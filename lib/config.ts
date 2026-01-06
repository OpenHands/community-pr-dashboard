export const config = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
  },
  orgs: (process.env.ORGS || 'all-hands-ai,openhands').split(',').map(s => s.trim()),
  repos: {
    include: process.env.REPOS_INCLUDE
      ? process.env.REPOS_INCLUDE.split(',').map(s => s.trim())
      : [],
    exclude: process.env.REPOS_EXCLUDE 
      ? process.env.REPOS_EXCLUDE.split(',').map(s => s.trim())
      : [],
  },
  sla: {
    firstResponseHours: parseInt(process.env.SLA_HOURS_FIRST_RESPONSE || '72'),
    firstReviewHours: parseInt(process.env.SLA_HOURS_FIRST_REVIEW || '144'),
  },
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '120'),
  },
  limits: {
    maxPrPagesPerRepo: parseInt(process.env.MAX_PR_PAGES_PER_REPO || '10'),
  },
};

export function validateConfig() {
  if (!config.github.token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  
  if (config.orgs.length === 0) {
    throw new Error('At least one organization must be specified in ORGS');
  }
  
  return true;
}
