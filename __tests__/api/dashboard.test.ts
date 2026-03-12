/**
 * @jest-environment node
 *
 * Tests for app/api/dashboard/route.ts — the code changed on this branch.
 *
 * Covered:
 *   resolveRepos  — uses explicit repos, falls back to org discovery, falls
 *                   back to FALLBACK_REPOS when org discovery fails.
 *   parallel fetch — all repos are fetched; PRs from every repo appear in
 *                    the merged response.
 *   RateLimitError — any repo throwing RateLimitError produces a 429 with
 *                    Retry-After and resetAt in the body.
 *   per-repo isolation — a non-RateLimitError from one repo does not fail
 *                        the whole request; data from other repos is returned.
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/dashboard/route';
import { RateLimitError } from '@/lib/github';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/config', () => ({
  config: {
    github: { token: 'test-token' },
    orgs: ['test-org'],
    repos: { include: [] },
    cache: { ttlSeconds: 60 },
    limits: { maxPrPagesPerRepo: 10 },
    sla: { firstResponseHours: 72, firstReviewHours: 144 },
  },
}));

// Cache calls through to the fetcher so tests exercise the real handler logic.
jest.mock('@/lib/cache', () => ({
  cache: {
    withCache: jest.fn((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  },
}));

jest.mock('@/lib/employees', () => ({
  buildEmployeesSet: jest.fn(),
  isCommunityPR: jest.fn(),
}));

// Keep the real RateLimitError class; replace network functions with mocks.
jest.mock('@/lib/github', () => {
  const actual = jest.requireActual<typeof import('@/lib/github')>('@/lib/github');
  return {
    RateLimitError: actual.RateLimitError,
    GitHubAPIError: actual.GitHubAPIError,
    getOpenPRsGraphQL: jest.fn(),
    getRecentlyMergedPRsWithReviews: jest.fn(),
    getAllPRReviewStats: jest.fn(),
    getAllRepositoriesFromOrgs: jest.fn(),
  };
});

jest.mock('@/lib/compute', () => ({
  transformPR: jest.fn(),
  computeKpis: jest.fn(),
  computeDashboardData: jest.fn(),
  computeCommunityReviewerStats: jest.fn(),
  computeOrgMemberReviewerStats: jest.fn(),
  computeBotReviewerStats: jest.fn(),
}));

// ─── Imports of mocked functions (resolved after jest.mock hoisting) ─────────

import {
  getOpenPRsGraphQL,
  getRecentlyMergedPRsWithReviews,
  getAllPRReviewStats,
  getAllRepositoriesFromOrgs,
} from '@/lib/github';
import { buildEmployeesSet } from '@/lib/employees';
import {
  transformPR,
  computeDashboardData,
  computeCommunityReviewerStats,
  computeOrgMemberReviewerStats,
  computeBotReviewerStats,
} from '@/lib/compute';

const mockGetOpenPRs              = getOpenPRsGraphQL              as jest.MockedFunction<typeof getOpenPRsGraphQL>;
const mockGetMergedPRs            = getRecentlyMergedPRsWithReviews as jest.MockedFunction<typeof getRecentlyMergedPRsWithReviews>;
const mockGetAllReviewStats       = getAllPRReviewStats             as jest.MockedFunction<typeof getAllPRReviewStats>;
const mockGetAllRepositories      = getAllRepositoriesFromOrgs      as jest.MockedFunction<typeof getAllRepositoriesFromOrgs>;
const mockBuildEmployeesSet       = buildEmployeesSet              as jest.MockedFunction<typeof buildEmployeesSet>;
const mockTransformPR             = transformPR                    as jest.MockedFunction<typeof transformPR>;
const mockComputeDashboardData    = computeDashboardData           as jest.MockedFunction<typeof computeDashboardData>;
const mockComputeCommunityStats   = computeCommunityReviewerStats  as jest.MockedFunction<typeof computeCommunityReviewerStats>;
const mockComputeOrgMemberStats   = computeOrgMemberReviewerStats  as jest.MockedFunction<typeof computeOrgMemberReviewerStats>;
const mockComputeBotStats         = computeBotReviewerStats        as jest.MockedFunction<typeof computeBotReviewerStats>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/dashboard');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

/** Minimal transformed PR shape required by the route's filter logic. */
function makeTransformedPR(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    labels: [],
    authorType: 'community',
    ageHours: 0,
    needsFirstResponse: false,
    firstReviewAt: null,
    isDraft: false,
    reviews: [],
    requestedReviewers: { users: [], teams: [] },
    ...overrides,
  };
}

const EMPTY_REVIEW_STATS = { completedReviews: [], reviewRequests: [] };
const EMPTY_ALL_REVIEW_STATS = { communityReviews: [], orgMemberReviews: [], botReviews: [] };
const EMPTY_DASHBOARD_DATA = {
  kpis: {
    openCommunityPrs: 0, communityPrPercentage: '0%',
    medianResponseTime: 'N/A', medianReviewTime: 'N/A',
    reviewerCompliance: '0%', pendingReviews: 0,
    activeReviewers: 0, prsWithoutReviewers: 0,
  },
  reviewers: [],
  prs: [],
  lastUpdated: new Date().toISOString(),
};

// ─── Default mock implementations ────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  mockBuildEmployeesSet.mockResolvedValue(new Set<string>());
  mockGetOpenPRs.mockResolvedValue([]);
  mockGetMergedPRs.mockResolvedValue(EMPTY_REVIEW_STATS);
  mockGetAllReviewStats.mockResolvedValue(EMPTY_ALL_REVIEW_STATS);
  mockTransformPR.mockImplementation((rawPr: any) => makeTransformedPR({ number: rawPr.number }));
  mockComputeDashboardData.mockReturnValue(EMPTY_DASHBOARD_DATA as any);
  mockComputeCommunityStats.mockReturnValue([]);
  mockComputeOrgMemberStats.mockReturnValue([]);
  mockComputeBotStats.mockReturnValue([]);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/dashboard — resolveRepos', () => {
  it('fetches the repo(s) specified by the ?repos param', async () => {
    const res = await GET(makeRequest({ repos: 'owner/alpha' }));

    expect(res.status).toBe(200);
    expect(mockGetOpenPRs).toHaveBeenCalledTimes(1);
    expect(mockGetOpenPRs).toHaveBeenCalledWith('owner', 'alpha');
  });

  it('fetches all comma-separated repos from the ?repos param', async () => {
    const res = await GET(makeRequest({ repos: 'owner/alpha,owner/beta' }));

    expect(res.status).toBe(200);
    expect(mockGetOpenPRs).toHaveBeenCalledWith('owner', 'alpha');
    expect(mockGetOpenPRs).toHaveBeenCalledWith('owner', 'beta');
  });

  it('calls getAllRepositoriesFromOrgs when no repos param is supplied', async () => {
    mockGetAllRepositories.mockResolvedValue(['org/repo-a', 'org/repo-b']);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockGetAllRepositories).toHaveBeenCalledWith(['test-org']);
    expect(mockGetOpenPRs).toHaveBeenCalledWith('org', 'repo-a');
    expect(mockGetOpenPRs).toHaveBeenCalledWith('org', 'repo-b');
  });

  it('falls back to FALLBACK_REPOS when org discovery throws', async () => {
    mockGetAllRepositories.mockRejectedValue(new Error('network error'));

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    // The fallback list is always fetched on failure; spot-check one entry.
    const calledWithArgs = mockGetOpenPRs.mock.calls.map(([owner, repo]) => `${owner}/${repo}`);
    expect(calledWithArgs).toContain('all-hands-ai/OpenHands');
  });
});

// ─── parallel fetch ───────────────────────────────────────────────────────────

describe('GET /api/dashboard — parallel fetch', () => {
  it('runs getOpenPRsGraphQL, getRecentlyMergedPRsWithReviews and getAllPRReviewStats for each repo', async () => {
    await GET(makeRequest({ repos: 'owner/repo1,owner/repo2' }));

    expect(mockGetOpenPRs).toHaveBeenCalledWith('owner', 'repo1');
    expect(mockGetOpenPRs).toHaveBeenCalledWith('owner', 'repo2');
    expect(mockGetMergedPRs).toHaveBeenCalledWith('owner', 'repo1', 30);
    expect(mockGetMergedPRs).toHaveBeenCalledWith('owner', 'repo2', 30);
    expect(mockGetAllReviewStats).toHaveBeenCalledWith('owner', 'repo1', 30, expect.any(Set));
    expect(mockGetAllReviewStats).toHaveBeenCalledWith('owner', 'repo2', 30, expect.any(Set));
  });

  it('merges PRs from all repos into a single response', async () => {
    mockGetOpenPRs
      .mockResolvedValueOnce([{ number: 1 }])
      .mockResolvedValueOnce([{ number: 2 }, { number: 3 }]);

    const res  = await GET(makeRequest({ repos: 'owner/repo1,owner/repo2' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalPrs).toBe(3);
  });
});

// ─── RateLimitError → 429 ────────────────────────────────────────────────────

describe('GET /api/dashboard — RateLimitError handling', () => {
  it('returns 429 when getOpenPRsGraphQL throws RateLimitError', async () => {
    const resetAt = new Date(Date.now() + 3_600_000).toISOString();
    mockGetOpenPRs.mockRejectedValue(new RateLimitError(resetAt));

    const res  = await GET(makeRequest({ repos: 'owner/repo' }));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe('rate_limited');
    expect(body.resetAt).toBe(resetAt);
  });

  it('sets Retry-After to seconds until reset when resetAt is in the future', async () => {
    const resetAt = new Date(Date.now() + 3_600_000).toISOString();
    mockGetOpenPRs.mockRejectedValue(new RateLimitError(resetAt));

    const res = await GET(makeRequest({ repos: 'owner/repo' }));

    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });

  it('sets Retry-After to 0 when resetAt is already in the past', async () => {
    const resetAt = new Date(Date.now() - 5000).toISOString();
    mockGetOpenPRs.mockRejectedValue(new RateLimitError(resetAt));

    const res = await GET(makeRequest({ repos: 'owner/repo' }));

    expect(res.headers.get('Retry-After')).toBe('0');
  });

  it('returns 429 even when the RateLimitError comes from getRecentlyMergedPRsWithReviews', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString();
    mockGetOpenPRs.mockResolvedValue([]);
    mockGetMergedPRs.mockRejectedValue(new RateLimitError(resetAt));

    const res = await GET(makeRequest({ repos: 'owner/repo' }));

    expect(res.status).toBe(429);
  });
});

// ─── per-repo error isolation ─────────────────────────────────────────────────

describe('GET /api/dashboard — per-repo error isolation', () => {
  it('returns 200 with data from successful repos when one repo throws a non-RateLimitError', async () => {
    mockGetOpenPRs
      .mockRejectedValueOnce(new Error('network error for repo1'))
      .mockResolvedValueOnce([{ number: 42 }]);

    const res  = await GET(makeRequest({ repos: 'owner/repo1,owner/repo2' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    // repo2's PR should still be counted
    expect(body.totalPrs).toBe(1);
  });

  it('returns 200 with empty data when every repo throws a non-RateLimitError', async () => {
    mockGetOpenPRs.mockRejectedValue(new Error('all repos failed'));

    const res  = await GET(makeRequest({ repos: 'owner/repo1,owner/repo2' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalPrs).toBe(0);
  });

  it('returns 500 on an unexpected top-level error (e.g. buildEmployeesSet throws)', async () => {
    mockBuildEmployeesSet.mockRejectedValue(new Error('employees fetch failed'));

    const res  = await GET(makeRequest({ repos: 'owner/repo' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain('Failed');
  });
});
