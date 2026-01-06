export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';

export type Review = {
  authorLogin: string;
  state: ReviewState;
  submittedAt: string;
};

export type RequestedReviewers = {
  users: string[];
  teams: string[];
};

export type PR = {
  repo: string;
  number: number;
  title: string;
  url: string;
  authorLogin: string;
  authorAssociation: string;
  authorType: 'employee' | 'maintainer' | 'community' | 'bot';
  isEmployeeAuthor: boolean;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  requestedReviewers: RequestedReviewers;
  reviews: Review[];
  firstHumanResponseAt?: string;
  firstReviewAt?: string;
  ageHours: number;
  needsFirstResponse: boolean;
  overdueFirstResponse: boolean;
  overdueFirstReview: boolean;
};

export type KPIs = {
  openCommunityPrs: number;
  pctCommunityPrs: number;
  medianTffrHours?: number;
  medianTtfrHours?: number;
  assignedReviewerCompliancePct: number;
  reviewerLoad: Record<string, number>;
};

export type DashboardResponse = {
  kpis: KPIs;
  prs: PR[];
  rateLimit?: { remaining: number; resetAt: string };
};

export type ReviewStatsResponse = {
  totalOpenPRs: number;
  pendingReviewRequests: number;
  nonDraftPRsWithoutReviewers: number;
  topPendingReviewers: Array<{ name: string; count: number }>;
  uniqueReviewersWithPending: number;
};

export type EmployeeOverrides = {
  allowlist: string[];
  denylist: string[];
};

export type GitHubRateLimit = {
  remaining: number;
  resetAt: string;
};

// New types for the updated dashboard
export type FilterState = {
  repositories: string[];
  labels: string[];
  ageRange: string;
  status?: string;
  noReviewers?: boolean;
  limit?: string;
  draftStatus?: string;
  authorType?: string;
  reviewer?: string;
};

export type Reviewer = {
  name: string;
  pendingCount: number;
  // Completed reviews breakdown
  completedTotal: number;           // Total reviews completed (requested + unrequested)
  completedRequested: number;       // Reviews completed that were requested
  completedUnrequested: number;     // Reviews completed without being requested (self-initiated)
  // Request tracking
  requestedTotal: number;           // Total review requests received
  completionRate: number | null;    // completedRequested / requestedTotal * 100
  // Community PR metrics (time from PR ready to first review, for non-org-member PRs)
  communityPRsReviewed?: number;    // Number of community PRs reviewed
  medianCommunityReviewTimeHours?: number | null;  // Median time from PR ready to first review (community PRs only)
  // Org Member PR metrics (time from PR ready to first review, for org-member PRs)
  orgMemberPRsReviewed?: number;    // Number of org member PRs reviewed
  medianOrgMemberReviewTimeHours?: number | null;  // Median time from PR ready to first review (org member PRs only)
  // Bot PR metrics (reviews on PRs authored by bots like dependabot)
  botPRsReviewed?: number;          // Number of bot PRs reviewed
  medianBotReviewTimeHours?: number | null;  // Median time from PR ready to first review (bot PRs only)
};

export type DashboardKPIs = {
  openCommunityPrs: number;
  communityPrPercentage: string;
  medianResponseTime: string;
  medianReviewTime: string;
  reviewerCompliance: string;
  pendingReviews: number;
  activeReviewers: number;
  prsWithoutReviewers: number;
};

export type DashboardData = {
  kpis: DashboardKPIs;
  prs: PR[];
  reviewers?: Reviewer[];
  lastUpdated?: string;
  totalPrs?: number;
};

// Community PR review metrics - measures time from PR ready to first review
// Only for PRs authored by non-org-members
export type CommunityReviewData = {
  reviewerLogin: string;
  prNumber: number;
  prUrl: string;
  prAuthor: string;
  prAuthorAssociation: string;
  readyForReviewAt: string;    // When PR became ready (or createdAt if never draft)
  firstReviewAt: string;       // First review submission by this reviewer
  reviewTimeHours: number;     // Computed: firstReviewAt - readyForReviewAt
};

export type CommunityReviewerStats = {
  name: string;
  communityPRsReviewed: number;
  medianCommunityReviewTimeHours: number | null;  // null if below minimum sample size
};

export type OrgMemberReviewerStats = {
  name: string;
  orgMemberPRsReviewed: number;
  medianOrgMemberReviewTimeHours: number | null;  // null if below minimum sample size
};

export type BotReviewerStats = {
  name: string;
  botPRsReviewed: number;
  medianBotReviewTimeHours: number | null;  // null if below minimum sample size
};