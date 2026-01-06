import { config } from './config';
import { GitHubRateLimit } from './types';

export class GitHubAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public rateLimit?: GitHubRateLimit
  ) {
    super(message);
    this.name = 'GitHubAPIError';
  }
}

async function fetchGitHub(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.github.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenHands-PR-Dashboard/1.0',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const rateLimit = response.headers.get('x-ratelimit-remaining')
      ? {
          remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '0'),
          resetAt: new Date(parseInt(response.headers.get('x-ratelimit-reset') || '0') * 1000).toISOString(),
        }
      : undefined;

    throw new GitHubAPIError(
      `GitHub API error: ${response.status} ${response.statusText}`,
      response.status,
      rateLimit
    );
  }

  return response;
}

export async function graphql<T>(query: string, variables: Record<string, any> = {}): Promise<T & { rateLimit?: GitHubRateLimit }> {
  const response = await fetchGitHub('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL error: ${result.errors.map((e: any) => e.message).join(', ')}`);
  }

  // Extract rate limit info if present
  const rateLimit = result.data?.rateLimit ? {
    remaining: result.data.rateLimit.remaining,
    resetAt: result.data.rateLimit.resetAt,
  } : undefined;

  return { ...result.data, rateLimit };
}

export async function getOrgMembersGraphQL(org: string): Promise<string[]> {
  const query = `
    query OrgMembers($login: String!, $cursor: String) {
      organization(login: $login) {
        membersWithRole(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { login }
        }
      }
      rateLimit { remaining resetAt }
    }
  `;

  const members: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    type OrgMembersResult = {
      organization: {
        membersWithRole: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{ login: string }>;
        };
      };
    };
    
    const result: OrgMembersResult = await graphql<OrgMembersResult>(query, { login: org, cursor });

    const memberData = result.organization.membersWithRole;
    members.push(...memberData.nodes.map(node => node.login));
    
    hasNextPage = memberData.pageInfo.hasNextPage;
    cursor = memberData.pageInfo.endCursor;
  }

  return members;
}

export async function getOrgMembersREST(org: string): Promise<string[]> {
  const members: string[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchGitHub(
      `https://api.github.com/orgs/${org}/members?per_page=100&page=${page}`
    );
    
    const data = await response.json();
    
    if (data.length === 0) {
      hasMore = false;
    } else {
      members.push(...data.map((member: any) => member.login));
      page++;
    }
  }

  return members;
}

export async function getOpenPRsGraphQL(owner: string, repo: string): Promise<any[]> {
  const query = `
    query OpenPRs($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        pullRequests(states: OPEN, first: 50, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number title url createdAt updatedAt isDraft authorAssociation state
            author { login }
            mergeable
            labels(first: 20) { nodes { name } }
            reviewRequests(first: 20) {
              nodes { 
                requestedReviewer { 
                  __typename 
                  ... on User { login } 
                  ... on Team { slug } 
                } 
              }
            }
            reviews(first: 50) {
              nodes { 
                author { login } 
                state 
                submittedAt 
              }
            }
          }
        }
      }
      rateLimit { remaining resetAt }
    }
  `;

  const prs: any[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;

  while (hasNextPage && pageCount < config.limits.maxPrPagesPerRepo) {
    type OpenPRsResult = {
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: any[];
        };
      };
    };
    
    const result: OpenPRsResult = await graphql<OpenPRsResult>(query, { owner, name: repo, cursor });

    const prData = result.repository.pullRequests;
    // Filter to ensure only OPEN PRs are included
    const openPrs = prData.nodes.filter((pr: any) => pr.state === 'OPEN');
    prs.push(...openPrs);
    
    hasNextPage = prData.pageInfo.hasNextPage;
    cursor = prData.pageInfo.endCursor;
    pageCount++;
  }

  return prs;
}

export async function getRateLimit(): Promise<GitHubRateLimit> {
  const response = await fetchGitHub('https://api.github.com/rate_limit');
  const data = await response.json();
  
  return {
    remaining: data.rate.remaining,
    resetAt: new Date(data.rate.reset * 1000).toISOString(),
  };
}

export async function getOrgRepositories(org: string): Promise<any[]> {
  const repositories: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchGitHub(
      `https://api.github.com/orgs/${org}/repos?type=public&sort=updated&per_page=100&page=${page}`
    );
    
    const data = await response.json();
    
    if (data.length === 0) {
      hasMore = false;
    } else {
      // Filter out archived and disabled repos
      const activeRepos = data.filter((repo: any) => !repo.archived && !repo.disabled);
      repositories.push(...activeRepos);
      page++;
    }
  }

  return repositories;
}

export async function getAllRepositoriesFromOrgs(orgs: string[]): Promise<string[]> {
  const allRepos: string[] = [];
  
  for (const org of orgs) {
    try {
      console.log(`Fetching repositories for organization: ${org}`);
      const repos = await getOrgRepositories(org);
      const repoNames = repos.map(repo => repo.full_name);
      allRepos.push(...repoNames);
      console.log(`Found ${repoNames.length} active repositories for ${org}`);
    } catch (error) {
      console.error(`Failed to fetch repositories for org ${org}:`, error);
      // Continue with other orgs
    }
  }
  
  return allRepos;
}

export type CompletedReviewData = {
  reviewerLogin: string;
  authorAssociation: string;
  submittedAt: string;
  requestedAt: string | null;
  prNumber: number;
  prUrl: string;
};

export type ReviewRequestData = {
  reviewerLogin: string;
  requestedAt: string;
  prNumber: number;
};

export type ReviewStatsData = {
  completedReviews: CompletedReviewData[];
  reviewRequests: ReviewRequestData[];
};

export async function getRecentlyMergedPRsWithReviews(owner: string, repo: string, daysBack: number = 30): Promise<ReviewStatsData> {
  if (daysBack <= 0) {
    throw new Error('daysBack must be a positive number');
  }
  
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);
  
  const query = `
    query RecentMergedPRs($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        pullRequests(states: MERGED, first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number
            url
            mergedAt
            timelineItems(first: 100, itemTypes: [REVIEW_REQUESTED_EVENT, PULL_REQUEST_REVIEW]) {
              nodes {
                __typename
                ... on ReviewRequestedEvent {
                  createdAt
                  requestedReviewer {
                    __typename
                    ... on User { login }
                  }
                }
                ... on PullRequestReview {
                  author { login }
                  authorAssociation
                  submittedAt
                  state
                }
              }
            }
          }
        }
      }
      rateLimit { remaining resetAt }
    }
  `;

  const completedReviews: CompletedReviewData[] = [];
  const reviewRequests: ReviewRequestData[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;
  const maxPages = 5; // Limit pages to avoid excessive API calls

  while (hasNextPage && pageCount < maxPages) {
    type MergedPRsResult = {
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: any[];
        };
      };
    };
    
    const result: MergedPRsResult = await graphql<MergedPRsResult>(query, { owner, name: repo, cursor });

    const prData = result.repository.pullRequests;
    
    for (const pr of prData.nodes) {
      // Skip PRs merged before our date range
      if (pr.mergedAt && new Date(pr.mergedAt) < sinceDate) {
        hasNextPage = false;
        break;
      }
      
      // Build a map of review requests by reviewer (keep the FIRST request time)
      const prReviewRequests: Record<string, string> = {};
      const reviews: Array<{ login: string; authorAssociation: string; submittedAt: string }> = [];
      
      for (const item of pr.timelineItems?.nodes || []) {
        if (item.__typename === 'ReviewRequestedEvent' && item.requestedReviewer?.login) {
          // Only store the first request time (don't overwrite if already exists)
          if (!prReviewRequests[item.requestedReviewer.login]) {
            prReviewRequests[item.requestedReviewer.login] = item.createdAt;
          }
        } else if (item.__typename === 'PullRequestReview' && item.author?.login && item.submittedAt) {
          // Only count actual reviews (APPROVED, CHANGES_REQUESTED, COMMENTED)
          if (['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'].includes(item.state)) {
            reviews.push({
              login: item.author.login,
              authorAssociation: item.authorAssociation || 'NONE',
              submittedAt: item.submittedAt,
            });
          }
        }
      }
      
      // Track all review requests within the date range
      for (const [login, requestedAt] of Object.entries(prReviewRequests)) {
        if (new Date(requestedAt) >= sinceDate) {
          reviewRequests.push({
            reviewerLogin: login,
            requestedAt,
            prNumber: pr.number,
          });
        }
      }
      
      // Match reviews with their request times
      // Track which reviewers have already had their request "fulfilled" for this PR
      const fulfilledRequests = new Set<string>();
      
      for (const review of reviews) {
        // Only count reviews submitted within our date range
        if (new Date(review.submittedAt) >= sinceDate) {
          // Only include requestedAt if:
          // 1. The request was within the date range
          // 2. The review was submitted AFTER the request (a review can't fulfill a request that came later)
          // 3. This is the first review from this reviewer on this PR (to avoid counting multiple reviews as multiple fulfilled requests)
          const requestedAt = prReviewRequests[review.login];
          const requestedAtInRange = requestedAt && new Date(requestedAt) >= sinceDate ? requestedAt : null;
          const reviewAfterRequest = requestedAtInRange && new Date(review.submittedAt) >= new Date(requestedAtInRange);
          const isFirstReviewForRequest = reviewAfterRequest && !fulfilledRequests.has(review.login);
          
          if (isFirstReviewForRequest) {
            fulfilledRequests.add(review.login);
          }
          
          completedReviews.push({
            reviewerLogin: review.login,
            authorAssociation: review.authorAssociation,
            submittedAt: review.submittedAt,
            requestedAt: isFirstReviewForRequest ? requestedAtInRange : null,
            prNumber: pr.number,
            prUrl: pr.url,
          });
        }
      }
    }
    
    hasNextPage = prData.pageInfo.hasNextPage && hasNextPage;
    cursor = prData.pageInfo.endCursor;
    pageCount++;
  }

  return { completedReviews, reviewRequests };
}

export type CommunityPRReviewData = {
  reviewerLogin: string;
  prNumber: number;
  prUrl: string;
  prAuthor: string;
  prAuthorAssociation: string;
  readyForReviewAt: string;
  firstReviewAt: string;
  reviewTimeHours: number;
};

/**
 * Fetch review stats for community PRs (authored by non-org-members).
 * Measures time from PR ready-for-review to first review.
 * This metric better reflects responsiveness to community contributions
 * since it doesn't depend on explicit review requests.
 */
export async function getCommunityPRReviewStats(
  owner: string,
  repo: string,
  daysBack: number = 30,
  employeesSet: Set<string>
): Promise<CommunityPRReviewData[]> {
  if (daysBack <= 0) {
    throw new Error('daysBack must be a positive number');
  }

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);

  const query = `
    query CommunityPRReviews($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        pullRequests(states: MERGED, first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number
            url
            createdAt
            mergedAt
            isDraft
            author { login }
            authorAssociation
            timelineItems(first: 100, itemTypes: [READY_FOR_REVIEW_EVENT, PULL_REQUEST_REVIEW]) {
              nodes {
                __typename
                ... on ReadyForReviewEvent {
                  createdAt
                }
                ... on PullRequestReview {
                  author { login }
                  authorAssociation
                  submittedAt
                  state
                }
              }
            }
          }
        }
      }
      rateLimit { remaining resetAt }
    }
  `;

  const communityReviews: CommunityPRReviewData[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;
  const maxPages = 5;

  while (hasNextPage && pageCount < maxPages) {
    type CommunityPRsResult = {
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: any[];
        };
      };
    };

    const result: CommunityPRsResult = await graphql<CommunityPRsResult>(query, { owner, name: repo, cursor });
    const prData = result.repository.pullRequests;

    for (const pr of prData.nodes) {
      // Skip PRs merged before our date range
      if (pr.mergedAt && new Date(pr.mergedAt) < sinceDate) {
        hasNextPage = false;
        break;
      }

      const authorLogin = pr.author?.login;
      const authorAssociation = pr.authorAssociation || 'NONE';

      // Skip if no author (ghost users)
      if (!authorLogin) continue;

      // Filter to community PRs only:
      // - Not an employee (org member)
      // - Not a collaborator/member/owner (has write access)
      // - Not a bot
      const isEmployee = employeesSet.has(authorLogin);
      const hasWriteAccess = ['COLLABORATOR', 'MEMBER', 'OWNER'].includes(authorAssociation);
      const isBot = authorLogin.includes('[bot]') || authorLogin.endsWith('-bot') || authorLogin === 'dependabot';

      if (isEmployee || hasWriteAccess || isBot) continue;

      // Determine when PR became ready for review
      // If PR was never a draft, use createdAt
      // Otherwise, use the ReadyForReviewEvent timestamp
      let readyForReviewAt: string | null = null;

      for (const item of pr.timelineItems?.nodes || []) {
        if (item.__typename === 'ReadyForReviewEvent') {
          readyForReviewAt = item.createdAt;
          break; // Use first ready event
        }
      }

      // If no ReadyForReviewEvent, PR was created as non-draft
      if (!readyForReviewAt) {
        readyForReviewAt = pr.createdAt;
      }

      // Find first review (by any reviewer)
      // Group by reviewer to track who gave the first review
      const reviewerFirstReview: Record<string, string> = {};

      for (const item of pr.timelineItems?.nodes || []) {
        if (item.__typename === 'PullRequestReview' && item.author?.login && item.submittedAt) {
          // Only count substantive reviews
          if (['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'].includes(item.state)) {
            const reviewerLogin = item.author.login;
            // Keep only the first review from each reviewer
            if (!reviewerFirstReview[reviewerLogin]) {
              reviewerFirstReview[reviewerLogin] = item.submittedAt;
            }
          }
        }
      }

      // For each reviewer who reviewed this community PR, calculate their response time
      for (const [reviewerLogin, firstReviewAt] of Object.entries(reviewerFirstReview)) {
        // readyForReviewAt is guaranteed non-null here (fallback to createdAt above)
        const readyTime = new Date(readyForReviewAt!).getTime();
        const reviewTime = new Date(firstReviewAt).getTime();
        const reviewTimeHours = (reviewTime - readyTime) / (1000 * 60 * 60);

        // Safety check: only include positive review times
        // (review must come after PR was ready)
        if (reviewTimeHours <= 0) {
          console.warn(`Skipping invalid review time for PR #${pr.number}: ${reviewTimeHours} hours (readyAt: ${readyForReviewAt}, reviewAt: ${firstReviewAt})`);
          continue;
        }

        // Only include reviews within our date range
        if (new Date(firstReviewAt) >= sinceDate) {
          communityReviews.push({
            reviewerLogin,
            prNumber: pr.number,
            prUrl: pr.url,
            prAuthor: authorLogin,
            prAuthorAssociation: authorAssociation,
            readyForReviewAt: readyForReviewAt!, // guaranteed non-null
            firstReviewAt,
            reviewTimeHours,
          });
        }
      }
    }

    hasNextPage = prData.pageInfo.hasNextPage && hasNextPage;
    cursor = prData.pageInfo.endCursor;
    pageCount++;
  }

  return communityReviews;
}
