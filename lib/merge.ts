import { PR, DashboardData, DashboardKPIs, Reviewer } from './types';

const DEFAULT_REPOS = [
  'OpenHands/OpenHands',
  'OpenHands/software-agent-sdk',
  'OpenHands/OpenHands-CLI',
  'OpenHands/docs',
  'OpenHands/benchmarks',
];

export { DEFAULT_REPOS };

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatTime(hours: number | null | undefined): string {
  if (hours == null) return 'N/A';
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

export function computeKPIsFromPRs(prs: PR[]): DashboardKPIs {
  const communityPrs = prs.filter(pr => pr.authorType === 'community');
  const nonDraftPrs = prs.filter(pr => !pr.isDraft);

  const tffrTimes = communityPrs
    .filter(pr => pr.firstHumanResponseAt)
    .map(pr => (new Date(pr.firstHumanResponseAt!).getTime() - new Date(pr.readyForReviewAt).getTime()) / 3_600_000)
    .filter(t => t >= 0);

  const ttfrTimes = communityPrs
    .filter(pr => pr.firstReviewAt)
    .map(pr => (new Date(pr.firstReviewAt!).getTime() - new Date(pr.readyForReviewAt).getTime()) / 3_600_000)
    .filter(t => t >= 0);

  const pendingPerReviewer: Record<string, number> = {};
  nonDraftPrs.forEach(pr =>
    pr.requestedReviewers.users.forEach(r => { pendingPerReviewer[r] = (pendingPerReviewer[r] ?? 0) + 1; })
  );

  const prsWithReviewers = nonDraftPrs.filter(pr => pr.requestedReviewers.users.length > 0);

  return {
    openCommunityPrs: communityPrs.length,
    communityPrPercentage: prs.length > 0 ? `${Math.round((communityPrs.length / prs.length) * 100)}%` : '0%',
    medianResponseTime: formatTime(median(tffrTimes)),
    medianReviewTime: formatTime(median(ttfrTimes)),
    reviewerCompliance: nonDraftPrs.length > 0
      ? `${Math.round((prsWithReviewers.length / nonDraftPrs.length) * 100)}%`
      : '0%',
    pendingReviews: Object.values(pendingPerReviewer).reduce((s, n) => s + n, 0),
    activeReviewers: Object.keys(pendingPerReviewer).length,
    prsWithoutReviewers: nonDraftPrs.filter(pr => pr.requestedReviewers.users.length === 0).length,
  };
}

export function mergeReviewers(reviewerArrays: (Reviewer[] | undefined)[]): Reviewer[] {
  const merged = new Map<string, Reviewer>();

  for (const reviewers of reviewerArrays) {
    if (!reviewers) continue;
    for (const r of reviewers) {
      if (merged.has(r.name)) {
        const e = merged.get(r.name)!;
        e.pendingCount += r.pendingCount;
        e.completedTotal += r.completedTotal;
        e.completedRequested += r.completedRequested;
        e.completedUnrequested += r.completedUnrequested;
        e.requestedTotal += r.requestedTotal;
        e.completionRate = e.requestedTotal > 0
          ? (e.completedRequested / e.requestedTotal) * 100
          : null;
        if (r.communityPRsReviewed != null)
          e.communityPRsReviewed = (e.communityPRsReviewed ?? 0) + r.communityPRsReviewed;
        if (r.orgMemberPRsReviewed != null)
          e.orgMemberPRsReviewed = (e.orgMemberPRsReviewed ?? 0) + r.orgMemberPRsReviewed;
        if (r.botPRsReviewed != null)
          e.botPRsReviewed = (e.botPRsReviewed ?? 0) + r.botPRsReviewed;
        // Medians can't be merged; keep the first non-null value as an approximation
        e.medianCommunityReviewTimeHours ??= r.medianCommunityReviewTimeHours;
        e.medianOrgMemberReviewTimeHours ??= r.medianOrgMemberReviewTimeHours;
        e.medianBotReviewTimeHours ??= r.medianBotReviewTimeHours;
      } else {
        merged.set(r.name, { ...r });
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.completedTotal - a.completedTotal);
}

export function mergeDashboardResponses(responses: DashboardData[]): DashboardData {
  const allPrs = responses.flatMap(r => r.prs ?? []);
  return {
    kpis: computeKPIsFromPRs(allPrs),
    prs: allPrs,
    reviewers: mergeReviewers(responses.map(r => r.reviewers)),
    totalPrs: allPrs.length,
    lastUpdated: new Date().toISOString(),
  };
}
