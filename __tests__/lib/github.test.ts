import { getOpenPRsGraphQL } from '@/lib/github';

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
