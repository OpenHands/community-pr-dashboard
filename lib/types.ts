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
  medianReviewTimeHours: number | null;  // Median time from request to completion
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