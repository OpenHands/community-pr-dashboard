const PER_PAGE = 100;
const KNOWN_BOT_LOGINS = new Set([
  'all-hands-bot',
  'blacksmith-sh[bot]',
  'claudecode',
  'codex',
  'copilot',
  'dependabot',
  'dependabot[bot]',
  'fly-io[bot]',
  'github-actions',
  'github-actions[bot]',
  'openhands',
  'openhands-bot',
  'openhands-release-bot[bot]',
  'renovate',
  'renovate[bot]',
  'smolpaws',
]);
const TIMELINE_EVENTS_TO_STORE = new Set([
  'ready_for_review',
  'review_requested',
  'review_request_removed',
]);
const ACTIVE_REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']);

export class InterruptError extends Error {
  constructor() {
    super('Interrupted by user');
    this.name = 'InterruptError';
  }
}

export function logLine(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

export function normalizeLogin(login) {
  return typeof login === 'string' ? login.trim().toLowerCase() : '';
}

export function isBotLogin(login) {
  const normalizedLogin = normalizeLogin(login);
  if (!normalizedLogin) {
    return false;
  }

  return KNOWN_BOT_LOGINS.has(normalizedLogin)
    || normalizedLogin.includes('[bot]')
    || normalizedLogin.endsWith('-bot')
    || normalizedLogin.endsWith('_bot');
}

export function isOrgMemberAssociation(authorAssociation) {
  return authorAssociation === 'MEMBER' || authorAssociation === 'OWNER';
}

export function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return date;
}

export function parseInteger(value, optionName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

export function printHelp() {
  console.log(`Usage: npm run backfill -- [options]\n\nOptions:\n  --repo <owner/repo[,owner/repo]>  Backfill one or more repositories\n  --dry-run                         Fetch data and show progress without writing to Neon\n  --start-date <YYYY-MM-DD>         Skip PRs updated before this UTC date\n  --max-pages <N>                   Stop after N PR list pages per repo\n  --help                            Show this help message\n\nExamples:\n  npm run backfill\n  npm run backfill -- --repo OpenHands/openhands\n  npm run backfill -- --repo OpenHands/openhands --start-date 2025-01-01\n  npm run backfill -- --repo OpenHands/community-pr-dashboard --dry-run --max-pages 1`);
}

export function parseArgs(argv) {
  const options = {
    repos: [],
    dryRun: false,
    help: false,
    maxPages: null,
    startDate: process.env.BACKFILL_START_DATE || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--repo':
      case '--repos': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error(`${arg} requires a value.`);
        }
        options.repos.push(...value.split(',').map(repo => repo.trim()).filter(Boolean));
        index += 1;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--max-pages': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('--max-pages requires a value.');
        }
        options.maxPages = parseInteger(value, '--max-pages');
        index += 1;
        break;
      }
      case '--start-date': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('--start-date requires a value.');
        }
        options.startDate = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.maxPages === null && process.env.BACKFILL_MAX_PR_PAGES_PER_REPO) {
    options.maxPages = parseInteger(process.env.BACKFILL_MAX_PR_PAGES_PER_REPO, 'BACKFILL_MAX_PR_PAGES_PER_REPO');
  }

  return options;
}

export async function loadOverrides(fileUrl) {
  try {
    const { readFile } = await import('node:fs/promises');
    const fileContent = await readFile(new URL(fileUrl, import.meta.url), 'utf8');
    return normalizeOverrides(JSON.parse(fileContent));
  } catch {
    return { allowlist: [], denylist: [] };
  }
}

function normalizeOverrides(data) {
  if (!data || typeof data !== 'object') {
    return { allowlist: [], denylist: [] };
  }

  return {
    allowlist: Array.isArray(data.allowlist)
      ? data.allowlist.map(value => normalizeLogin(value)).filter(Boolean)
      : [],
    denylist: Array.isArray(data.denylist)
      ? data.denylist.map(value => normalizeLogin(value)).filter(Boolean)
      : [],
  };
}

function getRateLimit(response) {
  const remainingHeader = response.headers.get('x-ratelimit-remaining');
  const resetHeader = response.headers.get('x-ratelimit-reset');

  if (!remainingHeader || !resetHeader) {
    return undefined;
  }

  return {
    remaining: Number.parseInt(remainingHeader, 10),
    resetAt: new Date(Number.parseInt(resetHeader, 10) * 1000).toISOString(),
  };
}

export async function fetchGitHub(url, options = {}) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('GITHUB_TOKEN is required. Add it to .env.local or your shell environment.');
  }

  while (true) {
    const response = await fetch(url, {
      method: options.method || 'GET',
      body: options.body,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: options.accept || 'application/vnd.github+json',
        'Content-Type': options.body ? 'application/json' : undefined,
        'User-Agent': 'OpenHands-PR-Dashboard/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });

    const rateLimit = getRateLimit(response);

    if (response.ok) {
      return { response, rateLimit };
    }

    if ((response.status === 403 || response.status === 429) && rateLimit?.remaining === 0) {
      const waitMs = Math.max(5_000, new Date(rateLimit.resetAt).getTime() - Date.now() + 5_000);
      logLine(`GitHub rate limit reached for ${url}. Waiting ${formatDuration(waitMs)} until reset at ${rateLimit.resetAt}.`);
      await sleep(waitMs);
      continue;
    }

    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status} ${response.statusText} for ${url}: ${errorText.slice(0, 500)}`);
  }
}

export async function fetchGitHubJson(url, options = {}) {
  const { response, rateLimit } = await fetchGitHub(url, options);
  const text = await response.text();

  return {
    data: text ? JSON.parse(text) : null,
    rateLimit,
  };
}

export async function fetchPaginatedCollection(urlBuilder) {
  const items = [];
  let page = 1;
  let lastRateLimit;

  while (true) {
    const { data, rateLimit } = await fetchGitHubJson(urlBuilder(page));
    const pageItems = Array.isArray(data) ? data : [];
    lastRateLimit = rateLimit;
    items.push(...pageItems);

    if (pageItems.length < PER_PAGE) {
      break;
    }

    page += 1;
  }

  return { items, rateLimit: lastRateLimit };
}

export async function fetchRepository(owner, repo) {
  const { data } = await fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}`);
  return data;
}

export async function fetchOrgRepositories(org) {
  const repositories = [];
  let page = 1;

  while (true) {
    const { data } = await fetchGitHubJson(
      `https://api.github.com/orgs/${org}/repos?type=public&sort=updated&per_page=${PER_PAGE}&page=${page}`
    );
    const pageItems = Array.isArray(data) ? data : [];

    if (pageItems.length === 0) {
      break;
    }

    repositories.push(...pageItems.filter(repo => !repo.archived && !repo.disabled));

    if (pageItems.length < PER_PAGE) {
      break;
    }

    page += 1;
  }

  return repositories;
}

export { ACTIVE_REVIEW_STATES, PER_PAGE, TIMELINE_EVENTS_TO_STORE };
