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