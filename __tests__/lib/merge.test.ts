import { mergeDashboardResponses, computeKPIsFromPRs, mergeReviewers, DEFAULT_REPOS } from '@/lib/merge'
import { PR, Reviewer, DashboardData } from '@/lib/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0   = '2024-01-01T00:00:00Z'
const T1h  = '2024-01-01T01:00:00Z'   // T0 + 1 h
const T2h  = '2024-01-01T02:00:00Z'   // T0 + 2 h
const T3h  = '2024-01-01T03:00:00Z'   // T0 + 3 h
const T24h = '2024-01-02T00:00:00Z'   // T0 + 24 h
const T48h = '2024-01-03T00:00:00Z'   // T0 + 48 h

const makePR = (overrides: Partial<PR> = {}): PR => ({
  repo: 'org/repo',
  number: 1,
  title: 'PR 1',
  url: 'https://github.com/org/repo/pull/1',
  authorLogin: 'user1',
  authorAssociation: 'CONTRIBUTOR',
  authorType: 'community',
  isEmployeeAuthor: false,
  isDraft: false,
  createdAt: T0,
  updatedAt: T0,
  readyForReviewAt: T0,
  labels: [],
  requestedReviewers: { users: [], teams: [] },
  reviews: [],
  ageHours: 24,
  needsFirstResponse: false,
  overdueFirstResponse: false,
  overdueFirstReview: false,
  ...overrides,
})

const makeReviewer = (overrides: Partial<Reviewer> = {}): Reviewer => ({
  name: 'reviewer1',
  pendingCount: 0,
  completedTotal: 0,
  completedRequested: 0,
  completedUnrequested: 0,
  requestedTotal: 0,
  completionRate: null,
  ...overrides,
})

const makeResponse = (prs: PR[], reviewers?: Reviewer[]): DashboardData => ({
  kpis: computeKPIsFromPRs(prs),
  prs,
  reviewers,
  totalPrs: prs.length,
  lastUpdated: T0,
})

// ---------------------------------------------------------------------------
// DEFAULT_REPOS
// ---------------------------------------------------------------------------

describe('DEFAULT_REPOS', () => {
  it('contains exactly 5 entries', () => {
    expect(DEFAULT_REPOS).toHaveLength(5)
  })

  it('every entry is a valid "owner/repo" slug', () => {
    DEFAULT_REPOS.forEach(r => expect(r).toMatch(/^[^/]+\/[^/]+$/))
  })
})

// ---------------------------------------------------------------------------
// computeKPIsFromPRs
// ---------------------------------------------------------------------------

describe('computeKPIsFromPRs', () => {
  describe('empty input', () => {
    it('returns zero counts', () => {
      const kpis = computeKPIsFromPRs([])
      expect(kpis.openCommunityPrs).toBe(0)
      expect(kpis.pendingReviews).toBe(0)
      expect(kpis.activeReviewers).toBe(0)
      expect(kpis.prsWithoutReviewers).toBe(0)
    })

    it('returns 0% for percentages', () => {
      const kpis = computeKPIsFromPRs([])
      expect(kpis.communityPrPercentage).toBe('0%')
      expect(kpis.reviewerCompliance).toBe('0%')
    })

    it('returns N/A for time metrics', () => {
      const kpis = computeKPIsFromPRs([])
      expect(kpis.medianResponseTime).toBe('N/A')
      expect(kpis.medianReviewTime).toBe('N/A')
    })
  })

  describe('community vs non-community counts', () => {
    it('counts only community-authored PRs in openCommunityPrs', () => {
      const prs = [
        makePR({ number: 1, authorType: 'community' }),
        makePR({ number: 2, authorType: 'community' }),
        makePR({ number: 3, authorType: 'employee' }),
      ]
      expect(computeKPIsFromPRs(prs).openCommunityPrs).toBe(2)
    })

    it('computes communityPrPercentage rounded to nearest %', () => {
      const prs = [
        makePR({ number: 1, authorType: 'community' }),
        makePR({ number: 2, authorType: 'community' }),
        makePR({ number: 3, authorType: 'employee' }),
      ]
      // 2/3 = 66.7% → rounds to 67%
      expect(computeKPIsFromPRs(prs).communityPrPercentage).toBe('67%')
    })

    it('counts draft community PRs in openCommunityPrs', () => {
      const prs = [
        makePR({ number: 1, authorType: 'community', isDraft: true }),
        makePR({ number: 2, authorType: 'employee' }),
      ]
      expect(computeKPIsFromPRs(prs).openCommunityPrs).toBe(1)
    })
  })

  describe('medianResponseTime (TFFR)', () => {
    it('shows N/A when no community PR has firstHumanResponseAt', () => {
      const prs = [makePR({ authorType: 'community' })]
      expect(computeKPIsFromPRs(prs).medianResponseTime).toBe('N/A')
    })

    it('formats sub-24h median in hours', () => {
      // [1h, 3h] → median 2h
      const prs = [
        makePR({ number: 1, authorType: 'community', readyForReviewAt: T0, firstHumanResponseAt: T1h }),
        makePR({ number: 2, authorType: 'community', readyForReviewAt: T0, firstHumanResponseAt: T3h }),
      ]
      expect(computeKPIsFromPRs(prs).medianResponseTime).toBe('2h')
    })

    it('formats 24h+ median in days', () => {
      // [24h, 48h] → median 36h → 2d (Math.round(36/24)=2)
      const prs = [
        makePR({ number: 1, authorType: 'community', readyForReviewAt: T0, firstHumanResponseAt: T24h }),
        makePR({ number: 2, authorType: 'community', readyForReviewAt: T0, firstHumanResponseAt: T48h }),
      ]
      expect(computeKPIsFromPRs(prs).medianResponseTime).toBe('2d')
    })

    it('ignores negative TFFR (response before readyForReview)', () => {
      // firstHumanResponseAt before readyForReviewAt → negative, filtered out
      const prs = [
        makePR({ authorType: 'community', readyForReviewAt: T1h, firstHumanResponseAt: T0 }),
      ]
      expect(computeKPIsFromPRs(prs).medianResponseTime).toBe('N/A')
    })

    it('only uses community PRs for TFFR calculation', () => {
      const prs = [
        makePR({ number: 1, authorType: 'employee', readyForReviewAt: T0, firstHumanResponseAt: T1h }),
      ]
      expect(computeKPIsFromPRs(prs).medianResponseTime).toBe('N/A')
    })
  })

  describe('medianReviewTime (TTFR)', () => {
    it('shows N/A when no community PR has firstReviewAt', () => {
      const prs = [makePR({ authorType: 'community' })]
      expect(computeKPIsFromPRs(prs).medianReviewTime).toBe('N/A')
    })

    it('computes median over odd-length array (middle element)', () => {
      // [2h, 3h, 24h] → median 3h
      const prs = [
        makePR({ number: 1, authorType: 'community', readyForReviewAt: T0, firstReviewAt: T2h }),
        makePR({ number: 2, authorType: 'community', readyForReviewAt: T0, firstReviewAt: T3h }),
        makePR({ number: 3, authorType: 'community', readyForReviewAt: T0, firstReviewAt: T24h }),
      ]
      expect(computeKPIsFromPRs(prs).medianReviewTime).toBe('3h')
    })

    it('computes median over even-length array (average of two middle)', () => {
      // [2h, 4h] → median 3h
      const prs = [
        makePR({ number: 1, authorType: 'community', readyForReviewAt: T0, firstReviewAt: T2h }),
        makePR({ number: 2, authorType: 'community', readyForReviewAt: T0, firstReviewAt: '2024-01-01T04:00:00Z' }),
      ]
      expect(computeKPIsFromPRs(prs).medianReviewTime).toBe('3h')
    })
  })

  describe('draft PR exclusion from non-draft KPIs', () => {
    it('excludes draft PRs from reviewerCompliance denominator', () => {
      const prs = [
        makePR({ number: 1, isDraft: false, requestedReviewers: { users: ['alice'], teams: [] } }),
        makePR({ number: 2, isDraft: true,  requestedReviewers: { users: ['bob'],   teams: [] } }),
      ]
      // Only 1 non-draft PR, and it has a reviewer → 100%
      expect(computeKPIsFromPRs(prs).reviewerCompliance).toBe('100%')
    })

    it('excludes draft PRs from pendingReviews and activeReviewers', () => {
      const prs = [
        makePR({ number: 1, isDraft: true, requestedReviewers: { users: ['alice'], teams: [] } }),
      ]
      const kpis = computeKPIsFromPRs(prs)
      expect(kpis.pendingReviews).toBe(0)
      expect(kpis.activeReviewers).toBe(0)
    })

    it('excludes draft PRs from prsWithoutReviewers', () => {
      const prs = [
        makePR({ number: 1, isDraft: true }),  // draft, no reviewers — should NOT be counted
        makePR({ number: 2, isDraft: false }),  // non-draft, no reviewers — counted
      ]
      expect(computeKPIsFromPRs(prs).prsWithoutReviewers).toBe(1)
    })
  })

  describe('reviewerCompliance', () => {
    it('is 100% when all non-draft PRs have at least one requested reviewer', () => {
      const prs = [
        makePR({ number: 1, requestedReviewers: { users: ['alice'], teams: [] } }),
        makePR({ number: 2, requestedReviewers: { users: ['bob'],   teams: [] } }),
      ]
      expect(computeKPIsFromPRs(prs).reviewerCompliance).toBe('100%')
    })

    it('is 0% when no non-draft PR has a requested reviewer', () => {
      const prs = [makePR(), makePR({ number: 2 })]
      expect(computeKPIsFromPRs(prs).reviewerCompliance).toBe('0%')
    })

    it('rounds to nearest % for mixed compliance', () => {
      // 1 of 3 non-draft PRs has a reviewer → 33%
      const prs = [
        makePR({ number: 1, requestedReviewers: { users: ['alice'], teams: [] } }),
        makePR({ number: 2 }),
        makePR({ number: 3 }),
      ]
      expect(computeKPIsFromPRs(prs).reviewerCompliance).toBe('33%')
    })
  })

  describe('pendingReviews, activeReviewers, prsWithoutReviewers', () => {
    it('sums all pending review requests across non-draft PRs', () => {
      const prs = [
        makePR({ number: 1, requestedReviewers: { users: ['alice', 'bob'], teams: [] } }),
        makePR({ number: 2, requestedReviewers: { users: ['alice'],        teams: [] } }),
      ]
      expect(computeKPIsFromPRs(prs).pendingReviews).toBe(3)
    })

    it('counts unique requested reviewers across non-draft PRs', () => {
      const prs = [
        makePR({ number: 1, requestedReviewers: { users: ['alice', 'bob'], teams: [] } }),
        makePR({ number: 2, requestedReviewers: { users: ['alice'],        teams: [] } }),
      ]
      expect(computeKPIsFromPRs(prs).activeReviewers).toBe(2)
    })

    it('counts non-draft PRs with no requested reviewers', () => {
      const prs = [
        makePR({ number: 1, requestedReviewers: { users: ['alice'], teams: [] } }),
        makePR({ number: 2 }),
        makePR({ number: 3 }),
      ]
      expect(computeKPIsFromPRs(prs).prsWithoutReviewers).toBe(2)
    })
  })
})

// ---------------------------------------------------------------------------
// mergeReviewers
// ---------------------------------------------------------------------------

describe('mergeReviewers', () => {
  describe('empty / undefined inputs', () => {
    it('returns empty array for empty input', () => {
      expect(mergeReviewers([])).toEqual([])
    })

    it('returns empty array when all inputs are undefined', () => {
      expect(mergeReviewers([undefined, undefined])).toEqual([])
    })

    it('skips undefined arrays without throwing', () => {
      const r = makeReviewer({ name: 'alice', completedTotal: 1 })
      expect(mergeReviewers([undefined, [r]])).toHaveLength(1)
    })
  })

  describe('non-overlapping reviewers', () => {
    it('returns the union of all reviewers', () => {
      const alice = makeReviewer({ name: 'alice', completedTotal: 3 })
      const bob   = makeReviewer({ name: 'bob',   completedTotal: 1 })
      const result = mergeReviewers([[alice], [bob]])
      expect(result.map(r => r.name)).toEqual(['alice', 'bob'])
    })

    it('sorts by completedTotal descending', () => {
      const alice = makeReviewer({ name: 'alice', completedTotal: 1 })
      const bob   = makeReviewer({ name: 'bob',   completedTotal: 5 })
      const carol = makeReviewer({ name: 'carol', completedTotal: 3 })
      const result = mergeReviewers([[alice, bob, carol]])
      expect(result.map(r => r.name)).toEqual(['bob', 'carol', 'alice'])
    })
  })

  describe('overlapping reviewers — counts summed', () => {
    it('sums pendingCount, completedTotal, completedRequested, completedUnrequested, requestedTotal', () => {
      const a1 = makeReviewer({ name: 'alice', pendingCount: 1, completedTotal: 2, completedRequested: 1, completedUnrequested: 1, requestedTotal: 2, completionRate: 50 })
      const a2 = makeReviewer({ name: 'alice', pendingCount: 2, completedTotal: 3, completedRequested: 2, completedUnrequested: 1, requestedTotal: 3, completionRate: 66.7 })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.pendingCount).toBe(3)
      expect(merged.completedTotal).toBe(5)
      expect(merged.completedRequested).toBe(3)
      expect(merged.completedUnrequested).toBe(2)
      expect(merged.requestedTotal).toBe(5)
    })

    it('recalculates completionRate from merged totals', () => {
      // 3 completed-requested / 5 requested = 60%
      const a1 = makeReviewer({ name: 'alice', completedRequested: 1, requestedTotal: 2 })
      const a2 = makeReviewer({ name: 'alice', completedRequested: 2, requestedTotal: 3 })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.completionRate).toBeCloseTo(60)
    })

    it('sets completionRate to null when merged requestedTotal is 0', () => {
      const a1 = makeReviewer({ name: 'alice', completedRequested: 0, requestedTotal: 0, completionRate: null })
      const a2 = makeReviewer({ name: 'alice', completedRequested: 0, requestedTotal: 0, completionRate: null })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.completionRate).toBeNull()
    })
  })

  describe('optional per-PR-type counts', () => {
    it('sums communityPRsReviewed when both are set', () => {
      const a1 = makeReviewer({ name: 'alice', communityPRsReviewed: 2 })
      const a2 = makeReviewer({ name: 'alice', communityPRsReviewed: 3 })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.communityPRsReviewed).toBe(5)
    })

    it('uses the set value when one side is undefined', () => {
      const a1 = makeReviewer({ name: 'alice' })                            // communityPRsReviewed undefined
      const a2 = makeReviewer({ name: 'alice', communityPRsReviewed: 4 })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.communityPRsReviewed).toBe(4)
    })

    it('sums orgMemberPRsReviewed and botPRsReviewed when set', () => {
      const a1 = makeReviewer({ name: 'alice', orgMemberPRsReviewed: 1, botPRsReviewed: 2 })
      const a2 = makeReviewer({ name: 'alice', orgMemberPRsReviewed: 3, botPRsReviewed: 1 })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.orgMemberPRsReviewed).toBe(4)
      expect(merged.botPRsReviewed).toBe(3)
    })
  })

  describe('median time fields', () => {
    it('keeps the first non-null medianCommunityReviewTimeHours', () => {
      const a1 = makeReviewer({ name: 'alice', medianCommunityReviewTimeHours: 5 })
      const a2 = makeReviewer({ name: 'alice', medianCommunityReviewTimeHours: 10 })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.medianCommunityReviewTimeHours).toBe(5)
    })

    it('falls through to second value when first is null', () => {
      const a1 = makeReviewer({ name: 'alice', medianCommunityReviewTimeHours: null })
      const a2 = makeReviewer({ name: 'alice', medianCommunityReviewTimeHours: 10 })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.medianCommunityReviewTimeHours).toBe(10)
    })

    it('falls through to second value when first is undefined', () => {
      const a1 = makeReviewer({ name: 'alice' })                                     // medianOrgMemberReviewTimeHours not set
      const a2 = makeReviewer({ name: 'alice', medianOrgMemberReviewTimeHours: 7 })
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged.medianOrgMemberReviewTimeHours).toBe(7)
    })
  })
})

// ---------------------------------------------------------------------------
// mergeDashboardResponses
// ---------------------------------------------------------------------------

describe('mergeDashboardResponses', () => {
  it('concatenates PRs from all responses', () => {
    const pr1 = makePR({ number: 1 })
    const pr2 = makePR({ number: 2 })
    const pr3 = makePR({ number: 3 })
    const result = mergeDashboardResponses([makeResponse([pr1, pr2]), makeResponse([pr3])])
    expect(result.prs).toHaveLength(3)
    expect(result.totalPrs).toBe(3)
  })

  it('sets totalPrs equal to the merged PR count', () => {
    const result = mergeDashboardResponses([
      makeResponse([makePR({ number: 1 }), makePR({ number: 2 })]),
      makeResponse([makePR({ number: 3 })]),
    ])
    expect(result.totalPrs).toBe(result.prs.length)
  })

  it('recomputes KPIs from all merged PRs (not inherited from individual responses)', () => {
    // Response 1: 1 community PR.  Response 2: 1 employee PR.
    // The merged openCommunityPrs should be 1, not 2.
    const res1 = makeResponse([makePR({ number: 1, authorType: 'community' })])
    const res2 = makeResponse([makePR({ number: 2, authorType: 'employee' })])
    const result = mergeDashboardResponses([res1, res2])
    expect(result.kpis.openCommunityPrs).toBe(1)
    expect(result.kpis.communityPrPercentage).toBe('50%')
  })

  it('merges reviewers across responses', () => {
    const alice1 = makeReviewer({ name: 'alice', completedTotal: 2 })
    const alice2 = makeReviewer({ name: 'alice', completedTotal: 3 })
    const result = mergeDashboardResponses([makeResponse([], [alice1]), makeResponse([], [alice2])])
    const alice = result.reviewers?.find(r => r.name === 'alice')
    expect(alice?.completedTotal).toBe(5)
  })

  it('handles responses with undefined reviewers without throwing', () => {
    const res1 = makeResponse([makePR()])               // reviewers: undefined
    const res2 = makeResponse([], [makeReviewer()])
    expect(() => mergeDashboardResponses([res1, res2])).not.toThrow()
  })

  it('returns valid ISO string for lastUpdated', () => {
    const result = mergeDashboardResponses([makeResponse([])])
    expect(() => new Date(result.lastUpdated!)).not.toThrow()
    expect(new Date(result.lastUpdated!).toISOString()).toBe(result.lastUpdated)
  })

  it('handles a single response as a passthrough', () => {
    const prs = [makePR({ number: 1, authorType: 'community' })]
    const reviewer = makeReviewer({ name: 'alice', completedTotal: 3 })
    const result = mergeDashboardResponses([makeResponse(prs, [reviewer])])
    expect(result.prs).toHaveLength(1)
    expect(result.kpis.openCommunityPrs).toBe(1)
    expect(result.reviewers?.[0].name).toBe('alice')
  })

  it('handles an empty responses array', () => {
    const result = mergeDashboardResponses([])
    expect(result.prs).toEqual([])
    expect(result.totalPrs).toBe(0)
    expect(result.reviewers).toEqual([])
  })
})
