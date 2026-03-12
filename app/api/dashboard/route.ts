import { NextRequest, NextResponse } from 'next/server';
import { RateLimitError } from '@/lib/github';
import { config } from '@/lib/config';
import { cache } from '@/lib/cache';
import { buildEmployeesSet } from '@/lib/employees';
import { getOpenPRsGraphQL, getRecentlyMergedPRsWithReviews, getAllPRReviewStats, ReviewStatsData, CommunityPRReviewData, OrgMemberPRReviewData, BotPRReviewData } from '@/lib/github';
import { transformPR, computeDashboardData, computeCommunityReviewerStats, computeOrgMemberReviewerStats, computeBotReviewerStats } from '@/lib/compute';
import { PR } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('=== Dashboard API called ===');
  try {
    // Debug: Check if GitHub token is available
    console.log('GitHub token available:', !!process.env.GITHUB_TOKEN);
    console.log('Config orgs:', config.orgs);
    // validateConfig(); // Temporarily disabled for debugging
    
    const { searchParams } = new URL(request.url);
    const repoParam = searchParams.get('repos');
    if (!repoParam) {
      return NextResponse.json({ error: 'repos parameter is required (format: owner/repo)' }, { status: 400 });
    }
    const [owner, repo] = repoParam.trim().split('/');
    if (!owner || !repo) {
      return NextResponse.json({ error: 'repos must be in owner/repo format' }, { status: 400 });
    }

    const debug = searchParams.get('debug') === 'true';
    const labelsParam = searchParams.get('labels');
    const ageParam = searchParams.get('age');
    const statusParam = searchParams.get('status');
    const noReviewersParam = searchParams.get('noReviewers');
    const limitParam = searchParams.get('limit');
    const draftStatusParam = searchParams.get('draftStatus');
    const authorTypeParam = searchParams.get('authorType');
    const reviewerParam = searchParams.get('reviewer');

    const labelFilters = labelsParam
      ? labelsParam.split(',').map(l => l.trim().toLowerCase())
      : [];

    const cacheBustParam = searchParams.get('cacheBust');
    const cacheKey = `dashboard:${JSON.stringify({
      repo: repoParam.trim(),
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
      // Phase 1: all three are independent — run in parallel
      const [employeesSet, rawPrs, reviewStatsData] = await Promise.all([
        buildEmployeesSet(),
        getOpenPRsGraphQL(owner, repo, draftStatusParam === 'final'),
        getRecentlyMergedPRsWithReviews(owner, repo, 30),
      ]);

      // Phase 2: getAllPRReviewStats needs employeesSet; kick it off while
      // transformPR (synchronous) runs so the two overlap.
      const allReviewStatsPromise = getAllPRReviewStats(owner, repo, 30, employeesSet);

      const allPrs: PR[] = rawPrs.map(rawPr => {
        rawPr.repository = { owner: { login: owner }, name: repo };
        return transformPR(rawPr, employeesSet);
      });

      const allReviewStatsData: ReviewStatsData = {
        completedReviews: reviewStatsData.completedReviews,
        reviewRequests:   reviewStatsData.reviewRequests,
      };

      const allReviewStats = await allReviewStatsPromise;
      const allCommunityReviews: CommunityPRReviewData[]   = allReviewStats.communityReviews;
      const allOrgMemberReviews: OrgMemberPRReviewData[]   = allReviewStats.orgMemberReviews;
      const allBotReviews:       BotPRReviewData[]         = allReviewStats.botReviews;
      
      // Apply filters
      let filteredPrs = allPrs;
      
      // Don't filter to community PRs by default - show all PRs
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
      
      return {
        ...dashboardData,
        prs: filteredPrs,
        totalPrs: allPrs.length,
      };
    });
    
    const response = result;
    
    if (debug) {
      (response as any).debug = {
        totalPrs: result.totalPrs,
        cacheKey,
        filters: { repo: repoParam, labels: labelFilters, age: ageParam },
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

    console.error('=== Dashboard API error ===', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');

    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack',
      },
      { status: 500 }
    );
  }
}