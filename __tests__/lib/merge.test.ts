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

    it('returns 0% for percentages and N/A for time metrics', () => {
      const kpis = computeKPIsFromPRs([])
      expect(kpis.communityPrPercentage).toBe('0%')
      expect(kpis.reviewerCompliance).toBe('0%')
      expect(kpis.medianResponseTime).toBe('N/A')
      expect(kpis.medianReviewTime).toBe('N/A')
    })
  })

  describe('community vs non-community counts', () => {
    // 2 community + 1 employee — reused across both assertions
    const mixedPRs = [
      makePR({ number: 1, authorType: 'community' }),
      makePR({ number: 2, authorType: 'community' }),
      makePR({ number: 3, authorType: 'employee' }),
    ]

    it('counts only community-authored PRs in openCommunityPrs', () => {
      expect(computeKPIsFromPRs(mixedPRs).openCommunityPrs).toBe(2)
    })

    it('computes communityPrPercentage rounded to nearest % (2/3 → 67%)', () => {
      expect(computeKPIsFromPRs(mixedPRs).communityPrPercentage).toBe('67%')
    })

    it('counts draft community PRs in openCommunityPrs', () => {
      const prs = [
        makePR({ number: 1, authorType: 'community', isDraft: true }),
        makePR({ number: 2, authorType: 'employee' }),
      ]
      expect(computeKPIsFromPRs(prs).openCommunityPrs).toBe(1)
    })
  })

  // Both medianResponseTime (TFFR) and medianReviewTime (TTFR) share the
  // same N/A / hours / days / odd-median / community-only logic; only the
  // source PR field and the KPI field differ.
  describe.each([
    { kpiField: 'medianResponseTime' as const, prField: 'firstHumanResponseAt' as const },
    { kpiField: 'medianReviewTime'   as const, prField: 'firstReviewAt'         as const },
  ])('$kpiField', ({ kpiField, prField }) => {
    const communityWithTime = (n: number, time: string) =>
      makePR({ number: n, authorType: 'community', readyForReviewAt: T0, [prField]: time } as Partial<PR>)

    it('is N/A when no community PR has the timestamp', () => {
      expect(computeKPIsFromPRs([makePR({ authorType: 'community' })])[kpiField]).toBe('N/A')
    })

    it('is N/A when only non-community PRs have the timestamp', () => {
      const prs = [makePR({ authorType: 'employee', readyForReviewAt: T0, [prField]: T1h } as Partial<PR>)]
      expect(computeKPIsFromPRs(prs)[kpiField]).toBe('N/A')
    })

    it.each([
      ['even-length → hours', [T1h, T3h],        '2h'],   // [1h, 3h] → median 2h
      ['odd-length  → hours', [T2h, T3h, T24h],  '3h'],   // [2h, 3h, 24h] → median 3h
      ['even-length → days',  [T24h, T48h],       '2d'],   // [24h, 48h] → median 36h → 2d
    ])('median %s', (_, times, expected) => {
      const prs = times.map((t, i) => communityWithTime(i + 1, t))
      expect(computeKPIsFromPRs(prs)[kpiField]).toBe(expected)
    })
  })

  // TFFR-specific: negative elapsed times must be discarded
  it('medianResponseTime ignores negative TFFR (response before readyForReview)', () => {
    const prs = [makePR({ authorType: 'community', readyForReviewAt: T1h, firstHumanResponseAt: T0 })]
    expect(computeKPIsFromPRs(prs).medianResponseTime).toBe('N/A')
  })

  describe('draft PR exclusion from non-draft KPIs', () => {
    it('excludes draft PRs from reviewerCompliance denominator', () => {
      const prs = [
        makePR({ number: 1, isDraft: false, requestedReviewers: { users: ['alice'], teams: [] } }),
        makePR({ number: 2, isDraft: true,  requestedReviewers: { users: ['bob'],   teams: [] } }),
      ]
      expect(computeKPIsFromPRs(prs).reviewerCompliance).toBe('100%')
    })

    it('excludes draft PRs from pendingReviews and activeReviewers', () => {
      const prs = [makePR({ isDraft: true, requestedReviewers: { users: ['alice'], teams: [] } })]
      const kpis = computeKPIsFromPRs(prs)
      expect(kpis.pendingReviews).toBe(0)
      expect(kpis.activeReviewers).toBe(0)
    })

    it('excludes draft PRs from prsWithoutReviewers', () => {
      const prs = [
        makePR({ number: 1, isDraft: true }),   // draft — not counted
        makePR({ number: 2, isDraft: false }),   // non-draft, no reviewers — counted
      ]
      expect(computeKPIsFromPRs(prs).prsWithoutReviewers).toBe(1)
    })
  })

  describe('reviewerCompliance', () => {
    it.each([
      ['100%', [['alice'], ['bob']]],
      ['0%',   [[], []]],
      ['33%',  [['alice'], [], []]],
    ])('is %s', (expected, reviewerLists) => {
      const prs = reviewerLists.map((users, i) =>
        makePR({ number: i + 1, requestedReviewers: { users, teams: [] } })
      )
      expect(computeKPIsFromPRs(prs).reviewerCompliance).toBe(expected)
    })
  })

  describe('pendingReviews, activeReviewers, prsWithoutReviewers', () => {
    // PR1: alice + bob  PR2: alice  → pendingReviews=3, activeReviewers=2
    const twoRequestedPRs = [
      makePR({ number: 1, requestedReviewers: { users: ['alice', 'bob'], teams: [] } }),
      makePR({ number: 2, requestedReviewers: { users: ['alice'],        teams: [] } }),
    ]

    it('sums all pending review requests across non-draft PRs', () => {
      expect(computeKPIsFromPRs(twoRequestedPRs).pendingReviews).toBe(3)
    })

    it('counts unique requested reviewers across non-draft PRs', () => {
      expect(computeKPIsFromPRs(twoRequestedPRs).activeReviewers).toBe(2)
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

    it('recalculates completionRate from merged totals (3/5 → 60%)', () => {
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

  // All three optional count fields share the same summation semantics.
  type OptionalCount = 'communityPRsReviewed' | 'orgMemberPRsReviewed' | 'botPRsReviewed'
  const optionalCountFields: OptionalCount[] = ['communityPRsReviewed', 'orgMemberPRsReviewed', 'botPRsReviewed']

  describe('optional per-PR-type counts', () => {
    it.each(optionalCountFields)('sums %s when both sides are set', (field) => {
      const a1 = makeReviewer({ name: 'alice', [field]: 2 } as Partial<Reviewer>)
      const a2 = makeReviewer({ name: 'alice', [field]: 3 } as Partial<Reviewer>)
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged[field]).toBe(5)
    })

    it.each(optionalCountFields)('uses the set value for %s when one side is undefined', (field) => {
      const a1 = makeReviewer({ name: 'alice' })
      const a2 = makeReviewer({ name: 'alice', [field]: 4 } as Partial<Reviewer>)
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged[field]).toBe(4)
    })
  })

  // All three median-time fields use ??= semantics: keep first non-null/undefined.
  type MedianField = 'medianCommunityReviewTimeHours' | 'medianOrgMemberReviewTimeHours' | 'medianBotReviewTimeHours'
  const medianTimeFields: MedianField[] = ['medianCommunityReviewTimeHours', 'medianOrgMemberReviewTimeHours', 'medianBotReviewTimeHours']

  describe('median time fields — ??= (keep first non-null/undefined)', () => {
    it.each(medianTimeFields)('keeps the first non-null value for %s', (field) => {
      const a1 = makeReviewer({ name: 'alice', [field]: 5  } as Partial<Reviewer>)
      const a2 = makeReviewer({ name: 'alice', [field]: 10 } as Partial<Reviewer>)
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged[field]).toBe(5)
    })

    it.each(medianTimeFields)('falls through to second %s when first is null', (field) => {
      const a1 = makeReviewer({ name: 'alice', [field]: null } as Partial<Reviewer>)
      const a2 = makeReviewer({ name: 'alice', [field]: 8   } as Partial<Reviewer>)
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged[field]).toBe(8)
    })

    it.each(medianTimeFields)('falls through to second %s when first is undefined', (field) => {
      const a1 = makeReviewer({ name: 'alice' })
      const a2 = makeReviewer({ name: 'alice', [field]: 8 } as Partial<Reviewer>)
      const [merged] = mergeReviewers([[a1], [a2]])
      expect(merged[field]).toBe(8)
    })
  })
})

// ---------------------------------------------------------------------------
// mergeDashboardResponses
// ---------------------------------------------------------------------------

describe('mergeDashboardResponses', () => {
  it('concatenates PRs from all responses', () => {
    const result = mergeDashboardResponses([
      makeResponse([makePR({ number: 1 }), makePR({ number: 2 })]),
      makeResponse([makePR({ number: 3 })]),
    ])
    expect(result.prs).toHaveLength(3)
    expect(result.totalPrs).toBe(3)
  })

  it('totalPrs always equals prs.length', () => {
    const result = mergeDashboardResponses([
      makeResponse([makePR({ number: 1 }), makePR({ number: 2 })]),
      makeResponse([makePR({ number: 3 })]),
    ])
    expect(result.totalPrs).toBe(result.prs.length)
  })

  it('recomputes KPIs from all merged PRs (not inherited from individual responses)', () => {
    // If KPIs were inherited: res1 says 1 community PR, res2 says 0 — wrong.
    // Merged should compute against the full 2-PR list: 1 community of 2 = 50%.
    const result = mergeDashboardResponses([
      makeResponse([makePR({ number: 1, authorType: 'community' })]),
      makeResponse([makePR({ number: 2, authorType: 'employee'  })]),
    ])
    expect(result.kpis.openCommunityPrs).toBe(1)
    expect(result.kpis.communityPrPercentage).toBe('50%')
  })

  it('merges reviewers across responses', () => {
    const result = mergeDashboardResponses([
      makeResponse([], [makeReviewer({ name: 'alice', completedTotal: 2 })]),
      makeResponse([], [makeReviewer({ name: 'alice', completedTotal: 3 })]),
    ])
    expect(result.reviewers?.find(r => r.name === 'alice')?.completedTotal).toBe(5)
  })

  it('handles responses with undefined reviewers without throwing', () => {
    expect(() => mergeDashboardResponses([
      makeResponse([makePR()]),          // reviewers: undefined
      makeResponse([], [makeReviewer()]),
    ])).not.toThrow()
  })

  it('returns a valid ISO string for lastUpdated', () => {
    const result = mergeDashboardResponses([makeResponse([])])
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
