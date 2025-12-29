import { computeReviewerStats, computeDashboardData } from '@/lib/compute';
import { PR } from '@/lib/types';
import { CompletedReviewData } from '@/lib/github';

// Mock the employees module
jest.mock('@/lib/employees', () => ({
  isEmployee: (login: string, employeesSet: Set<string>) => employeesSet.has(login),
  isCommunityPR: (authorLogin: string, employeesSet: Set<string>, authorAssociation?: string) => {
    const isBot = authorLogin.includes('[bot]') || authorLogin.endsWith('-bot') || authorLogin === 'dependabot';
    const isEmployeeUser = employeesSet.has(authorLogin);
    const hasWriteAccess = authorAssociation === 'COLLABORATOR' || authorAssociation === 'MEMBER' || authorAssociation === 'OWNER';
    return !isBot && !isEmployeeUser && !hasWriteAccess;
  },
  getAuthorType: (authorLogin: string, employeesSet: Set<string>, authorAssociation?: string) => {
    const isBot = authorLogin.includes('[bot]') || authorLogin.endsWith('-bot') || authorLogin === 'dependabot';
    if (isBot) return 'bot';
    if (employeesSet.has(authorLogin)) return 'employee';
    const hasWriteAccess = authorAssociation === 'COLLABORATOR' || authorAssociation === 'MEMBER' || authorAssociation === 'OWNER';
    if (hasWriteAccess) return 'maintainer';
    return 'community';
  },
}));

// Mock the config
jest.mock('@/lib/config', () => ({
  config: {
    sla: { firstResponseHours: 72, firstReviewHours: 168 },
  },
}));

describe('computeReviewerStats', () => {
  const employeesSet = new Set(['employee1', 'employee2', 'employee3']);

  const createMockPR = (overrides: Partial<PR> = {}): PR => ({
    repo: 'test/repo',
    number: 1,
    title: 'Test PR',
    url: 'https://github.com/test/repo/pull/1',
    authorLogin: 'community-user',
    authorAssociation: 'CONTRIBUTOR',
    authorType: 'community',
    isEmployeeAuthor: false,
    isDraft: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    labels: [],
    requestedReviewers: { users: [], teams: [] },
    reviews: [],
    ageHours: 24,
    needsFirstResponse: true,
    overdueFirstResponse: false,
    overdueFirstReview: false,
    ...overrides,
  });

  it('should calculate pending counts from open PRs', () => {
    const prs: PR[] = [
      createMockPR({ requestedReviewers: { users: ['employee1', 'employee2'], teams: [] } }),
      createMockPR({ requestedReviewers: { users: ['employee1'], teams: [] } }),
      createMockPR({ requestedReviewers: { users: ['employee3'], teams: [] } }),
    ];

    const completedReviews: CompletedReviewData[] = [];
    const result = computeReviewerStats(prs, completedReviews, employeesSet);

    expect(result).toHaveLength(3);
    
    const employee1 = result.find(r => r.name === 'employee1');
    expect(employee1?.pendingCount).toBe(2);
    
    const employee2 = result.find(r => r.name === 'employee2');
    expect(employee2?.pendingCount).toBe(1);
    
    const employee3 = result.find(r => r.name === 'employee3');
    expect(employee3?.pendingCount).toBe(1);
  });

  it('should calculate reviews completed in last month', () => {
    const prs: PR[] = [];
    const completedReviews: CompletedReviewData[] = [
      { reviewerLogin: 'employee1', submittedAt: '2024-01-15T10:00:00Z', requestedAt: null, prNumber: 1, prUrl: 'url1' },
      { reviewerLogin: 'employee1', submittedAt: '2024-01-16T10:00:00Z', requestedAt: null, prNumber: 2, prUrl: 'url2' },
      { reviewerLogin: 'employee2', submittedAt: '2024-01-17T10:00:00Z', requestedAt: null, prNumber: 3, prUrl: 'url3' },
    ];

    const result = computeReviewerStats(prs, completedReviews, employeesSet);

    // Should be sorted by reviews completed (descending)
    expect(result[0].name).toBe('employee1');
    expect(result[0].reviewsCompletedLastMonth).toBe(2);
    
    expect(result[1].name).toBe('employee2');
    expect(result[1].reviewsCompletedLastMonth).toBe(1);
  });

  it('should calculate average review time when request time is available', () => {
    const prs: PR[] = [];
    const completedReviews: CompletedReviewData[] = [
      // 24 hours review time
      { reviewerLogin: 'employee1', submittedAt: '2024-01-02T10:00:00Z', requestedAt: '2024-01-01T10:00:00Z', prNumber: 1, prUrl: 'url1' },
      // 48 hours review time
      { reviewerLogin: 'employee1', submittedAt: '2024-01-03T10:00:00Z', requestedAt: '2024-01-01T10:00:00Z', prNumber: 2, prUrl: 'url2' },
    ];

    const result = computeReviewerStats(prs, completedReviews, employeesSet);

    const employee1 = result.find(r => r.name === 'employee1');
    // Average of 24 and 48 hours = 36 hours
    expect(employee1?.avgReviewTimeHours).toBe(36);
  });

  it('should return null for avgReviewTimeHours when no request times available', () => {
    const prs: PR[] = [];
    const completedReviews: CompletedReviewData[] = [
      { reviewerLogin: 'employee1', submittedAt: '2024-01-15T10:00:00Z', requestedAt: null, prNumber: 1, prUrl: 'url1' },
    ];

    const result = computeReviewerStats(prs, completedReviews, employeesSet);

    const employee1 = result.find(r => r.name === 'employee1');
    expect(employee1?.avgReviewTimeHours).toBeNull();
  });

  it('should calculate completion rate correctly', () => {
    const prs: PR[] = [];
    const completedReviews: CompletedReviewData[] = [
      // 2 reviews with request times (completed)
      { reviewerLogin: 'employee1', submittedAt: '2024-01-02T10:00:00Z', requestedAt: '2024-01-01T10:00:00Z', prNumber: 1, prUrl: 'url1' },
      { reviewerLogin: 'employee1', submittedAt: '2024-01-03T10:00:00Z', requestedAt: '2024-01-02T10:00:00Z', prNumber: 2, prUrl: 'url2' },
      // 1 review without request time (self-initiated)
      { reviewerLogin: 'employee1', submittedAt: '2024-01-04T10:00:00Z', requestedAt: null, prNumber: 3, prUrl: 'url3' },
    ];

    const result = computeReviewerStats(prs, completedReviews, employeesSet);

    const employee1 = result.find(r => r.name === 'employee1');
    // 3 completed reviews / 2 requested reviews = 150%
    expect(employee1?.completionRate).toBe(150);
  });

  it('should filter out non-employees from results', () => {
    const prs: PR[] = [
      createMockPR({ requestedReviewers: { users: ['external-user'], teams: [] } }),
    ];
    const completedReviews: CompletedReviewData[] = [
      { reviewerLogin: 'external-user', submittedAt: '2024-01-15T10:00:00Z', requestedAt: null, prNumber: 1, prUrl: 'url1' },
    ];

    const result = computeReviewerStats(prs, completedReviews, employeesSet);

    // external-user should not be in results since they're not an employee
    expect(result.find(r => r.name === 'external-user')).toBeUndefined();
  });

  it('should sort reviewers by reviews completed (descending)', () => {
    const prs: PR[] = [];
    const completedReviews: CompletedReviewData[] = [
      { reviewerLogin: 'employee1', submittedAt: '2024-01-15T10:00:00Z', requestedAt: null, prNumber: 1, prUrl: 'url1' },
      { reviewerLogin: 'employee2', submittedAt: '2024-01-15T10:00:00Z', requestedAt: null, prNumber: 2, prUrl: 'url2' },
      { reviewerLogin: 'employee2', submittedAt: '2024-01-16T10:00:00Z', requestedAt: null, prNumber: 3, prUrl: 'url3' },
      { reviewerLogin: 'employee2', submittedAt: '2024-01-17T10:00:00Z', requestedAt: null, prNumber: 4, prUrl: 'url4' },
      { reviewerLogin: 'employee3', submittedAt: '2024-01-15T10:00:00Z', requestedAt: null, prNumber: 5, prUrl: 'url5' },
      { reviewerLogin: 'employee3', submittedAt: '2024-01-16T10:00:00Z', requestedAt: null, prNumber: 6, prUrl: 'url6' },
    ];

    const result = computeReviewerStats(prs, completedReviews, employeesSet);

    expect(result[0].name).toBe('employee2');
    expect(result[0].reviewsCompletedLastMonth).toBe(3);
    expect(result[1].name).toBe('employee3');
    expect(result[1].reviewsCompletedLastMonth).toBe(2);
    expect(result[2].name).toBe('employee1');
    expect(result[2].reviewsCompletedLastMonth).toBe(1);
  });
});

describe('computeDashboardData', () => {
  const employeesSet = new Set(['employee1', 'employee2']);

  const createMockPR = (overrides: Partial<PR> = {}): PR => ({
    repo: 'test/repo',
    number: 1,
    title: 'Test PR',
    url: 'https://github.com/test/repo/pull/1',
    authorLogin: 'community-user',
    authorAssociation: 'CONTRIBUTOR',
    authorType: 'community',
    isEmployeeAuthor: false,
    isDraft: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    labels: [],
    requestedReviewers: { users: [], teams: [] },
    reviews: [],
    ageHours: 24,
    needsFirstResponse: true,
    overdueFirstResponse: false,
    overdueFirstReview: false,
    ...overrides,
  });

  it('should include reviewer stats in dashboard data', () => {
    const prs: PR[] = [
      createMockPR({ requestedReviewers: { users: ['employee1'], teams: [] } }),
    ];
    const completedReviews: CompletedReviewData[] = [
      { reviewerLogin: 'employee1', submittedAt: '2024-01-15T10:00:00Z', requestedAt: '2024-01-14T10:00:00Z', prNumber: 1, prUrl: 'url1' },
    ];

    const result = computeDashboardData(prs, employeesSet, completedReviews);

    expect(result.reviewers).toBeDefined();
    expect(result.reviewers?.length).toBeGreaterThan(0);
    
    const employee1 = result.reviewers?.find(r => r.name === 'employee1');
    expect(employee1).toBeDefined();
    expect(employee1?.reviewsCompletedLastMonth).toBe(1);
    expect(employee1?.pendingCount).toBe(1);
    expect(employee1?.avgReviewTimeHours).toBe(24);
  });

  it('should work with empty completed reviews', () => {
    const prs: PR[] = [
      createMockPR({ requestedReviewers: { users: ['employee1'], teams: [] } }),
    ];

    const result = computeDashboardData(prs, employeesSet, []);

    expect(result.reviewers).toBeDefined();
    const employee1 = result.reviewers?.find(r => r.name === 'employee1');
    expect(employee1?.reviewsCompletedLastMonth).toBe(0);
    expect(employee1?.pendingCount).toBe(1);
  });

  it('should calculate total pending reviews correctly', () => {
    const prs: PR[] = [
      createMockPR({ requestedReviewers: { users: ['employee1', 'employee2'], teams: [] } }),
      createMockPR({ number: 2, requestedReviewers: { users: ['employee1'], teams: [] } }),
    ];

    const result = computeDashboardData(prs, employeesSet, []);

    expect(result.kpis.pendingReviews).toBe(3); // 2 for employee1 + 1 for employee2
  });
});
