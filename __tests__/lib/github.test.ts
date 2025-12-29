import { getOpenPRsGraphQL, getRecentlyMergedPRsWithReviews } from '@/lib/github';

// Mock fetch globally
global.fetch = jest.fn();

// Mock the config
jest.mock('@/lib/config', () => ({
  config: {
    github: { token: 'test-token' },
    limits: { maxPrPagesPerRepo: 10 },
  },
}));

describe('getOpenPRsGraphQL', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should filter out closed PRs from the results', async () => {
    // Mock GraphQL response with both open and closed PRs
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                title: 'Open PR 1',
                state: 'OPEN',
                url: 'https://github.com/test/repo/pull/1',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user1' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
              {
                number: 2,
                title: 'Closed PR',
                state: 'CLOSED',
                url: 'https://github.com/test/repo/pull/2',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user2' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
              {
                number: 3,
                title: 'Open PR 2',
                state: 'OPEN',
                url: 'https://github.com/test/repo/pull/3',
                createdAt: '2024-01-02T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user3' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
              {
                number: 4,
                title: 'Merged PR',
                state: 'MERGED',
                url: 'https://github.com/test/repo/pull/4',
                createdAt: '2024-01-03T00:00:00Z',
                updatedAt: '2024-01-03T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user4' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getOpenPRsGraphQL('test', 'repo');

    // Should only return the 2 OPEN PRs, filtering out CLOSED and MERGED
    expect(result).toHaveLength(2);
    expect(result[0].number).toBe(1);
    expect(result[0].state).toBe('OPEN');
    expect(result[1].number).toBe(3);
    expect(result[1].state).toBe('OPEN');
  });

  it('should return all PRs when all are in OPEN state', async () => {
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                title: 'Open PR 1',
                state: 'OPEN',
                url: 'https://github.com/test/repo/pull/1',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user1' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
              {
                number: 2,
                title: 'Open PR 2',
                state: 'OPEN',
                url: 'https://github.com/test/repo/pull/2',
                createdAt: '2024-01-02T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user2' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getOpenPRsGraphQL('test', 'repo');

    expect(result).toHaveLength(2);
    expect(result[0].state).toBe('OPEN');
    expect(result[1].state).toBe('OPEN');
  });

  it('should return empty array when all PRs are closed', async () => {
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                title: 'Closed PR',
                state: 'CLOSED',
                url: 'https://github.com/test/repo/pull/1',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user1' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getOpenPRsGraphQL('test', 'repo');

    expect(result).toHaveLength(0);
  });

  it('should handle pagination and filter closed PRs across multiple pages', async () => {
    // First page with mixed PRs
    const mockGraphQLDataPage1 = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
            nodes: [
              {
                number: 1,
                title: 'Open PR 1',
                state: 'OPEN',
                url: 'https://github.com/test/repo/pull/1',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user1' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
              {
                number: 2,
                title: 'Closed PR',
                state: 'CLOSED',
                url: 'https://github.com/test/repo/pull/2',
                createdAt: '2024-01-02T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user2' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
            ],
          },
        },
      },
    };

    // Second page with more mixed PRs
    const mockGraphQLDataPage2 = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 3,
                title: 'Open PR 2',
                state: 'OPEN',
                url: 'https://github.com/test/repo/pull/3',
                createdAt: '2024-01-03T00:00:00Z',
                updatedAt: '2024-01-03T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user3' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
              {
                number: 4,
                title: 'Merged PR',
                state: 'MERGED',
                url: 'https://github.com/test/repo/pull/4',
                createdAt: '2024-01-04T00:00:00Z',
                updatedAt: '2024-01-04T00:00:00Z',
                isDraft: false,
                authorAssociation: 'CONTRIBUTOR',
                author: { login: 'user4' },
                labels: { nodes: [] },
                reviewRequests: { nodes: [] },
                reviews: { nodes: [] },
              },
            ],
          },
        },
      },
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockGraphQLDataPage1,
        headers: new Headers(),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockGraphQLDataPage2,
        headers: new Headers(),
      } as Response);

    const result = await getOpenPRsGraphQL('test', 'repo');

    // Should only return the 2 OPEN PRs from both pages
    expect(result).toHaveLength(2);
    expect(result[0].number).toBe(1);
    expect(result[0].state).toBe('OPEN');
    expect(result[1].number).toBe(3);
    expect(result[1].state).toBe('OPEN');
  });
});

describe('getRecentlyMergedPRsWithReviews', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract completed reviews from merged PRs', async () => {
    // Use dates within the last 30 days
    const requestedDate = new Date();
    requestedDate.setDate(requestedDate.getDate() - 5);
    const submittedDate = new Date();
    submittedDate.setDate(submittedDate.getDate() - 4);
    
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                url: 'https://github.com/test/repo/pull/1',
                mergedAt: new Date().toISOString(),
                timelineItems: {
                  nodes: [
                    {
                      __typename: 'ReviewRequestedEvent',
                      createdAt: requestedDate.toISOString(),
                      requestedReviewer: { __typename: 'User', login: 'reviewer1' },
                    },
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'MEMBER',
                      submittedAt: submittedDate.toISOString(),
                      state: 'APPROVED',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getRecentlyMergedPRsWithReviews('test', 'repo', 30);

    expect(result.completedReviews).toHaveLength(1);
    expect(result.completedReviews[0].reviewerLogin).toBe('reviewer1');
    expect(result.completedReviews[0].authorAssociation).toBe('MEMBER');
    expect(result.completedReviews[0].requestedAt).toBe(requestedDate.toISOString());
    expect(result.completedReviews[0].submittedAt).toBe(submittedDate.toISOString());
    expect(result.completedReviews[0].prNumber).toBe(1);
    
    // Should also track the review request
    expect(result.reviewRequests).toHaveLength(1);
    expect(result.reviewRequests[0].reviewerLogin).toBe('reviewer1');
  });

  it('should handle reviews without request events', async () => {
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                url: 'https://github.com/test/repo/pull/1',
                mergedAt: new Date().toISOString(),
                timelineItems: {
                  nodes: [
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'COLLABORATOR',
                      submittedAt: new Date().toISOString(),
                      state: 'APPROVED',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getRecentlyMergedPRsWithReviews('test', 'repo', 30);

    expect(result.completedReviews).toHaveLength(1);
    expect(result.completedReviews[0].reviewerLogin).toBe('reviewer1');
    expect(result.completedReviews[0].authorAssociation).toBe('COLLABORATOR');
    expect(result.completedReviews[0].requestedAt).toBeNull();
    
    // No review requests since there was no ReviewRequestedEvent
    expect(result.reviewRequests).toHaveLength(0);
  });

  it('should filter out reviews older than the specified days', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                url: 'https://github.com/test/repo/pull/1',
                mergedAt: oldDate.toISOString(),
                timelineItems: {
                  nodes: [
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'MEMBER',
                      submittedAt: oldDate.toISOString(),
                      state: 'APPROVED',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getRecentlyMergedPRsWithReviews('test', 'repo', 30);

    // Review is older than 30 days, should be filtered out
    expect(result.completedReviews).toHaveLength(0);
  });

  it('should only count actual reviews (APPROVED, CHANGES_REQUESTED, COMMENTED)', async () => {
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                url: 'https://github.com/test/repo/pull/1',
                mergedAt: new Date().toISOString(),
                timelineItems: {
                  nodes: [
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'MEMBER',
                      submittedAt: new Date().toISOString(),
                      state: 'APPROVED',
                    },
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer2' },
                      authorAssociation: 'MEMBER',
                      submittedAt: new Date().toISOString(),
                      state: 'CHANGES_REQUESTED',
                    },
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer3' },
                      authorAssociation: 'MEMBER',
                      submittedAt: new Date().toISOString(),
                      state: 'COMMENTED',
                    },
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer4' },
                      authorAssociation: 'MEMBER',
                      submittedAt: new Date().toISOString(),
                      state: 'PENDING', // Should be filtered out
                    },
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer5' },
                      authorAssociation: 'MEMBER',
                      submittedAt: new Date().toISOString(),
                      state: 'DISMISSED', // Should be filtered out
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getRecentlyMergedPRsWithReviews('test', 'repo', 30);

    // Only APPROVED, CHANGES_REQUESTED, and COMMENTED should be counted
    expect(result.completedReviews).toHaveLength(3);
    expect(result.completedReviews.map(r => r.reviewerLogin).sort()).toEqual(['reviewer1', 'reviewer2', 'reviewer3']);
  });

  it('should track incomplete review requests', async () => {
    const requestedDate = new Date();
    requestedDate.setDate(requestedDate.getDate() - 5);
    
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                url: 'https://github.com/test/repo/pull/1',
                mergedAt: new Date().toISOString(),
                timelineItems: {
                  nodes: [
                    {
                      __typename: 'ReviewRequestedEvent',
                      createdAt: requestedDate.toISOString(),
                      requestedReviewer: { __typename: 'User', login: 'reviewer1' },
                    },
                    {
                      __typename: 'ReviewRequestedEvent',
                      createdAt: requestedDate.toISOString(),
                      requestedReviewer: { __typename: 'User', login: 'reviewer2' },
                    },
                    // Only reviewer1 actually reviewed
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'MEMBER',
                      submittedAt: new Date().toISOString(),
                      state: 'APPROVED',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getRecentlyMergedPRsWithReviews('test', 'repo', 30);

    // Should have 2 review requests
    expect(result.reviewRequests).toHaveLength(2);
    
    const reviewer1Request = result.reviewRequests.find(r => r.reviewerLogin === 'reviewer1');
    expect(reviewer1Request).toBeDefined();
    
    const reviewer2Request = result.reviewRequests.find(r => r.reviewerLogin === 'reviewer2');
    expect(reviewer2Request).toBeDefined();
  });

  it('should only count first review as fulfilling a request when reviewer submits multiple reviews', async () => {
    const requestedDate = new Date();
    requestedDate.setDate(requestedDate.getDate() - 5);
    const firstReviewDate = new Date();
    firstReviewDate.setDate(firstReviewDate.getDate() - 4);
    const secondReviewDate = new Date();
    secondReviewDate.setDate(secondReviewDate.getDate() - 3);
    
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                url: 'https://github.com/test/repo/pull/1',
                mergedAt: new Date().toISOString(),
                timelineItems: {
                  nodes: [
                    {
                      __typename: 'ReviewRequestedEvent',
                      createdAt: requestedDate.toISOString(),
                      requestedReviewer: { __typename: 'User', login: 'reviewer1' },
                    },
                    // reviewer1 submits multiple reviews on the same PR
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'MEMBER',
                      submittedAt: firstReviewDate.toISOString(),
                      state: 'CHANGES_REQUESTED',
                    },
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'MEMBER',
                      submittedAt: secondReviewDate.toISOString(),
                      state: 'APPROVED',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getRecentlyMergedPRsWithReviews('test', 'repo', 30);

    // Should have 1 review request
    expect(result.reviewRequests).toHaveLength(1);
    
    // Should have 2 completed reviews (both reviews count)
    expect(result.completedReviews).toHaveLength(2);
    
    // But only the first review should have requestedAt set (fulfilling the request)
    const reviewsWithRequestedAt = result.completedReviews.filter(r => r.requestedAt !== null);
    expect(reviewsWithRequestedAt).toHaveLength(1);
    expect(reviewsWithRequestedAt[0].submittedAt).toBe(firstReviewDate.toISOString());
    
    // The second review should have requestedAt as null
    const reviewsWithoutRequestedAt = result.completedReviews.filter(r => r.requestedAt === null);
    expect(reviewsWithoutRequestedAt).toHaveLength(1);
    expect(reviewsWithoutRequestedAt[0].submittedAt).toBe(secondReviewDate.toISOString());
  });

  it('should use the first request time when a reviewer is requested multiple times', async () => {
    const firstRequestDate = new Date();
    firstRequestDate.setDate(firstRequestDate.getDate() - 10);
    const secondRequestDate = new Date();
    secondRequestDate.setDate(secondRequestDate.getDate() - 5);
    const reviewDate = new Date();
    reviewDate.setDate(reviewDate.getDate() - 3);
    
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                url: 'https://github.com/test/repo/pull/1',
                mergedAt: new Date().toISOString(),
                timelineItems: {
                  nodes: [
                    // First request
                    {
                      __typename: 'ReviewRequestedEvent',
                      createdAt: firstRequestDate.toISOString(),
                      requestedReviewer: { __typename: 'User', login: 'reviewer1' },
                    },
                    // Second request (re-request)
                    {
                      __typename: 'ReviewRequestedEvent',
                      createdAt: secondRequestDate.toISOString(),
                      requestedReviewer: { __typename: 'User', login: 'reviewer1' },
                    },
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'MEMBER',
                      submittedAt: reviewDate.toISOString(),
                      state: 'APPROVED',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getRecentlyMergedPRsWithReviews('test', 'repo', 30);

    // Should use the first request time
    expect(result.reviewRequests).toHaveLength(1);
    expect(result.reviewRequests[0].requestedAt).toBe(firstRequestDate.toISOString());
    
    // The review should be matched with the first request time
    expect(result.completedReviews).toHaveLength(1);
    expect(result.completedReviews[0].requestedAt).toBe(firstRequestDate.toISOString());
  });

  it('should not count a review as fulfilling a request if the review came before the request', async () => {
    const reviewDate = new Date();
    reviewDate.setDate(reviewDate.getDate() - 10);
    const requestDate = new Date();
    requestDate.setDate(requestDate.getDate() - 5); // Request came AFTER the review
    
    const mockGraphQLData = {
      data: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                number: 1,
                url: 'https://github.com/test/repo/pull/1',
                mergedAt: new Date().toISOString(),
                timelineItems: {
                  nodes: [
                    // Review submitted first
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'reviewer1' },
                      authorAssociation: 'MEMBER',
                      submittedAt: reviewDate.toISOString(),
                      state: 'APPROVED',
                    },
                    // Request came after the review
                    {
                      __typename: 'ReviewRequestedEvent',
                      createdAt: requestDate.toISOString(),
                      requestedReviewer: { __typename: 'User', login: 'reviewer1' },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLData,
      headers: new Headers(),
    } as Response);

    const result = await getRecentlyMergedPRsWithReviews('test', 'repo', 30);

    // Should have 1 review request
    expect(result.reviewRequests).toHaveLength(1);
    
    // The review should NOT have requestedAt set because it came before the request
    expect(result.completedReviews).toHaveLength(1);
    expect(result.completedReviews[0].requestedAt).toBeNull();
  });
});
