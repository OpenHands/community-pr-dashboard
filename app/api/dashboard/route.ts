import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { cache } from '@/lib/cache';
import { buildEmployeesSet } from '@/lib/employees';
import { RateLimitError, getOpenPRsGraphQL, getRecentlyMergedPRsWithReviews, getAllPRReviewStats, ReviewStatsData, CommunityPRReviewData, OrgMemberPRReviewData, BotPRReviewData } from '@/lib/github';
import { transformPR, computeDashboardData, computeCommunityReviewerStats, computeOrgMemberReviewerStats, computeBotReviewerStats } from '@/lib/compute';
import { PR } from '@/lib/types';
import { DEFAULT_REPOS } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

function resolveRepos(targetRepos: string[]): string[] {
  return targetRepos.length > 0 ? targetRepos : DEFAULT_REPOS;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const debug = searchParams.get('debug') === 'true';
    const reposParam = searchParams.get('repos');
    const labelsParam = searchParams.get('labels');
    const ageParam = searchParams.get('age');
    const statusParam = searchParams.get('status');
    const noReviewersParam = searchParams.get('noReviewers');
    const limitParam = searchParams.get('limit');
    const draftStatusParam = searchParams.get('draftStatus');
    const authorTypeParam = searchParams.get('authorType');
    const reviewerParam = searchParams.get('reviewer');

    // Parse filters
    const targetRepos = reposParam
      ? reposParam.split(',').map(r => r.trim())
      : config.repos.include.length > 0
        ? config.repos.include
        : []; // Will auto-discover if empty

    const labelFilters = labelsParam
      ? labelsParam.split(',').map(l => l.trim().toLowerCase())
      : [];

    const cacheBustParam = searchParams.get('cacheBust');

    // Create cache key based on filters
    const cacheKey = `dashboard:${JSON.stringify({
      orgs: config.orgs,
      repos: targetRepos,
      labels: labelFilters,
      age: ageParam,
      status: statusParam,
      noReviewers: noReviewersParam,
      limit: limitParam,
      draftStatus: draftStatusParam,
      authorType: authorTypeParam,
      reviewer: reviewerParam,
      ...(cacheBustParam && { cacheBust: cacheBustParam }),
    })}`;

    const result = await cache.withCache(cacheKey, config.cache.ttlSeconds, async () => {
      const reposToFetch = resolveRepos(targetRepos);
      const employeesSet = await buildEmployeesSet();

      // Phase 2: for every repo, run its three fetches in parallel; run all repos in parallel.
      type RepoData = {
        prs: PR[];
        reviewStatsData: ReviewStatsData;
        communityReviews: CommunityPRReviewData[];
        orgMemberReviews: OrgMemberPRReviewData[];
        botReviews: BotPRReviewData[];
      };

      const repoResults = await Promise.all(
        reposToFetch
          .map(r => r.trim().split('/'))
          .filter(([owner, repo]) => owner && repo)
          .map(([owner, repo]) =>
            Promise.all([
              getOpenPRsGraphQL(owner, repo),
              getRecentlyMergedPRsWithReviews(owner, repo, 30),
              getAllPRReviewStats(owner, repo, 30, employeesSet),
            ])
              .then(([rawPrs, reviewStatsData, allReviewStats]): RepoData => ({
                prs: rawPrs.map(rawPr => {
                  rawPr.repository = { owner: { login: owner }, name: repo };
                  return transformPR(rawPr, employeesSet);
                }),
                reviewStatsData,
                communityReviews: allReviewStats.communityReviews,
                orgMemberReviews: allReviewStats.orgMemberReviews,
                botReviews:       allReviewStats.botReviews,
              }))
              .catch(err => {
                // Rate limit errors propagate — all other per-repo errors are isolated.
                if (err instanceof RateLimitError) throw err;
                console.error(`Failed to fetch ${owner}/${repo}:`, err);
                return null;
              })
          )
      );

      // Flatten results.
      const allPrs: PR[] = [];
      const allReviewStatsData: ReviewStatsData = { completedReviews: [], reviewRequests: [] };
      const allCommunityReviews: CommunityPRReviewData[] = [];
      const allOrgMemberReviews: OrgMemberPRReviewData[] = [];
      const allBotReviews: BotPRReviewData[] = [];

      for (const rd of repoResults) {
        if (!rd) continue;
        allPrs.push(...rd.prs);
        allReviewStatsData.completedReviews.push(...rd.reviewStatsData.completedReviews);
        allReviewStatsData.reviewRequests.push(...rd.reviewStatsData.reviewRequests);
        allCommunityReviews.push(...rd.communityReviews);
        allOrgMemberReviews.push(...rd.orgMemberReviews);
        allBotReviews.push(...rd.botReviews);
      }

      const visiblePrs = allPrs.filter(pr => pr.authorType !== 'bot');

      // Apply filters
      let filteredPrs = visiblePrs;

      // Don't filter to community PRs by default - show all non-bot PRs
      // Community PR filtering is handled in the compute functions

      // Apply label filters if provided
      if (labelFilters.length > 0) {
        filteredPrs = filteredPrs.filter(pr =>
          pr.labels.some(label => labelFilters.includes(label.toLowerCase()))
        );
      }

      // Apply author type filter if provided
      if (authorTypeParam && authorTypeParam !== 'all') {
        filteredPrs = filteredPrs.filter(pr => pr.authorType === authorTypeParam);
      }

      // Apply age filter if provided
      if (ageParam && ageParam !== 'all') {
        const ageRanges = {
          '0-24': [0, 24],           // 0-24 hours
          '2-days': [0, 48],         // Last 2 days (0-48 hours)
          '3-days': [0, 72],         // Last 3 days (0-72 hours)
          '7-days': [0, 168],        // Last 7 days (0-168 hours)
          '30-days': [0, 720],       // Last 30 days (0-720 hours)
        };

        const range = ageRanges[ageParam as keyof typeof ageRanges];
        if (range) {
          filteredPrs = filteredPrs.filter(pr =>
            pr.ageHours >= range[0] && pr.ageHours < range[1]
          );
        }
      }

      // Apply status filter if provided
      if (statusParam && statusParam !== 'all') {
        filteredPrs = filteredPrs.filter(pr => {
          switch (statusParam) {
            case 'needs-review':
              return pr.needsFirstResponse || (!pr.firstReviewAt && !pr.isDraft);
            case 'changes-requested':
              return pr.reviews.some(review => review.state === 'CHANGES_REQUESTED');
            case 'approved':
              return pr.reviews.some(review => review.state === 'APPROVED');
            default:
              return true;
          }
        });
      }

      // Apply no reviewers filter if provided
      if (noReviewersParam === 'true') {
        filteredPrs = filteredPrs.filter(pr => {
          // Check if PR has no requested reviewers (both users and teams)
          const hasRequestedReviewers = pr.requestedReviewers.users.length > 0 || pr.requestedReviewers.teams.length > 0;
          return !hasRequestedReviewers;
        });
      }

      // Apply reviewer filter if provided
      if (reviewerParam && reviewerParam !== 'all') {
        filteredPrs = filteredPrs.filter(pr => {
          // Check if the specified reviewer is in the requested reviewers list
          return pr.requestedReviewers.users.includes(reviewerParam);
        });
      }

      // Apply draft status filter if provided
      if (draftStatusParam && draftStatusParam !== 'all') {
        filteredPrs = filteredPrs.filter(pr => {
          switch (draftStatusParam) {
            case 'drafts':
              return pr.isDraft;
            case 'final':
              return !pr.isDraft;
            default:
              return true;
          }
        });
      }

      // Apply limit filter if provided (should be last to limit final results)
      if (limitParam && limitParam !== 'all') {
        const limit = parseInt(limitParam, 10);
        if (!isNaN(limit) && limit > 0) {
          filteredPrs = filteredPrs.slice(0, limit);
        }
      }

      // Compute dashboard data based on all PRs (not just filtered ones)
      const dashboardData = computeDashboardData(allPrs, employeesSet, allReviewStatsData);

      // Compute community reviewer stats and merge into existing reviewer data
      const communityReviewerStats = computeCommunityReviewerStats(allCommunityReviews);
      // Compute org member reviewer stats
      const orgMemberReviewerStats = computeOrgMemberReviewerStats(allOrgMemberReviews);
      // Compute bot reviewer stats
      const botReviewerStats = computeBotReviewerStats(allBotReviews);

      // Merge community, org member, and bot stats into existing reviewers
      if (dashboardData.reviewers) {
        const communityStatsMap = new Map(
          communityReviewerStats.map(s => [s.name, s])
        );
        const orgMemberStatsMap = new Map(
          orgMemberReviewerStats.map(s => [s.name, s])
        );
        const botStatsMap = new Map(
          botReviewerStats.map(s => [s.name, s])
        );

        for (const reviewer of dashboardData.reviewers) {
          const communityStats = communityStatsMap.get(reviewer.name);
          if (communityStats) {
            reviewer.communityPRsReviewed = communityStats.communityPRsReviewed;
            reviewer.medianCommunityReviewTimeHours = communityStats.medianCommunityReviewTimeHours;
          }
          const orgMemberStats = orgMemberStatsMap.get(reviewer.name);
          if (orgMemberStats) {
            reviewer.orgMemberPRsReviewed = orgMemberStats.orgMemberPRsReviewed;
            reviewer.medianOrgMemberReviewTimeHours = orgMemberStats.medianOrgMemberReviewTimeHours;
          }
          const botStats = botStatsMap.get(reviewer.name);
          if (botStats) {
            reviewer.botPRsReviewed = botStats.botPRsReviewed;
            reviewer.medianBotReviewTimeHours = botStats.medianBotReviewTimeHours;
          }
        }

        // Add any reviewers who only have community, org member, or bot reviews (not in the original list)
        const allNewReviewerNames = new Set([
          ...communityReviewerStats.map(s => s.name),
          ...orgMemberReviewerStats.map(s => s.name),
          ...botReviewerStats.map(s => s.name),
        ]);

        for (const name of allNewReviewerNames) {
          if (!dashboardData.reviewers.find(r => r.name === name)) {
            const communityStats = communityStatsMap.get(name);
            const orgMemberStats = orgMemberStatsMap.get(name);
            const botStats = botStatsMap.get(name);
            dashboardData.reviewers.push({
              name,
              pendingCount: 0,
              completedTotal: 0,
              completedRequested: 0,
              completedUnrequested: 0,
              requestedTotal: 0,
              completionRate: null,
              communityPRsReviewed: communityStats?.communityPRsReviewed,
              medianCommunityReviewTimeHours: communityStats?.medianCommunityReviewTimeHours,
              orgMemberPRsReviewed: orgMemberStats?.orgMemberPRsReviewed,
              medianOrgMemberReviewTimeHours: orgMemberStats?.medianOrgMemberReviewTimeHours,
              botPRsReviewed: botStats?.botPRsReviewed,
              medianBotReviewTimeHours: botStats?.medianBotReviewTimeHours,
            });
          }
        }
      }

      // But return filtered PRs for the table
      return {
        ...dashboardData,
        prs: filteredPrs,
        totalPrs: visiblePrs.length,
        employeeCount: employeesSet.size,
      };
    });

    const response = result;

    if (debug) {
      (response as any).debug = {
        totalPrs: result.totalPrs,
        employeeCount: result.employeeCount,
        cacheKey,
        filters: { repos: targetRepos, labels: labelFilters, age: ageParam },
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    if (error instanceof RateLimitError) {
      const retryAfter = Math.max(0, Math.ceil((new Date(error.resetAt).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'rate_limited', resetAt: error.resetAt },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    console.error('Dashboard API error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}