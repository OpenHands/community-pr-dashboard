#!/usr/bin/env node
/**
 * Benchmark: sequential (main) vs parallel (perf/server-parallel) fetch.
 *
 * Reproduces the three GitHub GraphQL calls the route makes per repo and
 * times two strategies:
 *
 *   sequential — one repo at a time, three requests per repo in serial
 *                (mirrors the for-loop on main)
 *
 *   parallel   — all repos concurrently, three requests per repo concurrently
 *                (mirrors the Promise.all on this branch)
 *
 * Usage:
 *   GITHUB_TOKEN=<token> node scripts/bench.mjs [--repos owner/repo,...]
 */

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN is not set.');
  process.exit(1);
}

// Repos to benchmark — pass --repos owner/a,owner/b to override
const args = process.argv.slice(2);
const reposArg = args.find(a => a.startsWith('--repos='))?.slice(8)
  ?? args[args.indexOf('--repos') + 1];

const REPOS = reposArg
  ? reposArg.split(',').map(r => r.trim())
  : ['OpenHands/OpenHands', 'OpenHands/software-agent-sdk', 'OpenHands/OpenHands-CLI'];

const RUNS = 3;

// ─── GraphQL helper ──────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'pr-dashboard-bench/1.0',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// ─── The three queries the route makes per repo (first page only) ─────────────

const OPEN_PRS = `
  query OpenPRs($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      pullRequests(states: OPEN, first: 50, orderBy: {field: CREATED_AT, direction: DESC}) {
        pageInfo { hasNextPage }
        nodes { number title isDraft authorAssociation state }
      }
    }
    rateLimit { remaining resetAt }
  }
`;

const MERGED_PRS = `
  query MergedPRs($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      pullRequests(states: MERGED, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
        pageInfo { hasNextPage }
        nodes {
          number mergedAt
          reviews(first: 10) { nodes { author { login } state submittedAt } }
          timelineItems(first: 5, itemTypes: [REVIEW_REQUESTED_EVENT]) {
            nodes { __typename ... on ReviewRequestedEvent { createdAt } }
          }
        }
      }
    }
    rateLimit { remaining resetAt }
  }
`;

const REVIEW_STATS = `
  query ReviewStats($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      pullRequests(states: MERGED, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          number isDraft authorAssociation
          reviews(first: 20) { nodes { author { login } state submittedAt } }
          timelineItems(first: 5, itemTypes: [READY_FOR_REVIEW_EVENT]) {
            nodes { __typename ... on ReadyForReviewEvent { createdAt } }
          }
        }
      }
    }
    rateLimit { remaining resetAt }
  }
`;

// ─── Per-repo fetch: runs all three queries ───────────────────────────────────

async function fetchRepo(owner, name) {
  return Promise.all([
    gql(OPEN_PRS,     { owner, name }),
    gql(MERGED_PRS,   { owner, name }),
    gql(REVIEW_STATS, { owner, name }),
  ]);
}

async function fetchRepoSequential(owner, name) {
  await gql(OPEN_PRS,     { owner, name });
  await gql(MERGED_PRS,   { owner, name });
  await gql(REVIEW_STATS, { owner, name });
}

// ─── Strategies ──────────────────────────────────────────────────────────────

// OLD (main): one repo at a time, three calls per repo in serial
async function strategySequential(repos) {
  for (const r of repos) {
    const [owner, name] = r.split('/');
    await fetchRepoSequential(owner, name);
  }
}

// NEW (this branch): all repos in parallel, three calls per repo in parallel
async function strategyParallel(repos) {
  await Promise.all(repos.map(r => {
    const [owner, name] = r.split('/');
    return fetchRepo(owner, name);
  }));
}

// ─── Timer ───────────────────────────────────────────────────────────────────

async function time(label, fn) {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

function ms(n) { return `${(n / 1000).toFixed(2)}s`; }

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('\nBenchmark: sequential (main) vs parallel (perf/server-parallel)');
console.log(`Repos (${REPOS.length}): ${REPOS.join(', ')}`);
console.log(`Runs: ${RUNS} (+ 1 warmup)\n`);

// Warmup — populates GitHub's CDN/edge caches, not counted
process.stdout.write('Warming up... ');
await strategyParallel(REPOS);
console.log('done.\n');

const seqTimes = [];
const parTimes = [];

for (let i = 0; i < RUNS; i++) {
  process.stdout.write(`Run ${i + 1}/${RUNS}  seq `);
  const s = await time('sequential', () => strategySequential(REPOS));
  seqTimes.push(s);
  process.stdout.write(`${ms(s)}  par `);

  const p = await time('parallel',   () => strategyParallel(REPOS));
  parTimes.push(p);
  console.log(`${ms(p)}`);
}

const seqMed = median(seqTimes);
const parMed = median(parTimes);
const speedup = seqMed / parMed;

// Theory: with N repos and 3 serial calls per repo, parallel should be
// ~(N × 3) / max(N, 3) times faster ≈ min(N, 3)×  faster for large N.
const theoreticalSpeedup = REPOS.length * 3;  // upper bound (all perfectly parallel)

console.log(`
╔══════════════════════════════════════════════════════╗
║              Benchmark results                       ║
╠══════════════════════════════════════════════════════╣
║  Strategy        │  ${RUNS} runs (median shown)           ║`);

seqTimes.forEach((t, i) =>
  process.stdout.write(`║  sequential r${i+1}  │  ${ms(t).padEnd(8)}                         ║\n`)
);
parTimes.forEach((t, i) =>
  process.stdout.write(`║  parallel   r${i+1}  │  ${ms(t).padEnd(8)}                         ║\n`)
);

console.log(`╠══════════════════════════════════════════════════════╣
║  sequential median  │  ${ms(seqMed).padEnd(6)}                          ║
║  parallel   median  │  ${ms(parMed).padEnd(6)}                          ║
║  speedup            │  ${speedup.toFixed(2)}×  (theoretical max: ${theoreticalSpeedup}×)   ║
╚══════════════════════════════════════════════════════╝
`);
