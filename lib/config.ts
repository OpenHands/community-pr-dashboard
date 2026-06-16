export const config = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
  },
  orgs: (process.env.ORGS || 'OpenHands').split(',').map(s => s.trim()).filter(Boolean),
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
  database: {
    url: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '',
  },
  sync: {
    cooldownSeconds: parseInt(process.env.DASHBOARD_SYNC_COOLDOWN_SECONDS || '300'),
    lockTimeoutSeconds: parseInt(process.env.DASHBOARD_SYNC_LOCK_TIMEOUT_SECONDS || '600'),
    cronSecret: process.env.SYNC_CRON_SECRET || '',
  },
  backfill: {
    startDate: process.env.BACKFILL_START_DATE || '',
    maxPrPagesPerRepo: process.env.BACKFILL_MAX_PR_PAGES_PER_REPO
      ? parseInt(process.env.BACKFILL_MAX_PR_PAGES_PER_REPO)
      : null,
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
