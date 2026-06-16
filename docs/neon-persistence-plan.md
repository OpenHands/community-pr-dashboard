# Neon Persistence Implementation Plan
## Goals
Move the dashboard from request-time GitHub API aggregation plus in-memory caching to a durable Neon Postgres data store that supports:
1. Full historical backfill of community PR, review, review-request, timeline, repository, author, and reviewer data.
2. A daily scheduled sync that keeps records current without depending on a page view.
3. A page-load sync check that refreshes stale data, but is globally throttled so multiple users cannot trigger GitHub syncs more than once every five minutes.
4. A manual refresh button that either starts a sync when allowed or returns the remaining wait time before the next refresh window.
5. Fast dashboard reads from Neon, with GitHub as the ingestion source and Neon as the query source.
## Current state
- `app/api/dashboard/route.ts` fetches GitHub data directly on request, computes metrics in-process, and stores responses in `lib/cache.ts`.
- `app/page.tsx` auto-refreshes every two minutes and uses `cacheBust` on Shift+Refresh to bypass the in-memory cache.
- The in-memory cache is process-local, so it does not coordinate across Vercel instances, server restarts, or multiple users.
- Historical review data currently uses short lookback windows (`30` days in several calls), which is not enough for long-term reporting.
## Target architecture
```text
GitHub API
   Γöé
   Γû╝
Sync worker / API route / Vercel cron
   Γöé  upsert normalized records + raw payload snapshots
   Γû╝
Neon Postgres
   Γöé
   Γö£ΓöÇΓöÇ dashboard reads: query current facts + compute/filter response
   Γö£ΓöÇΓöÇ sync state: last success, last attempt, next allowed sync
   ΓööΓöÇΓöÇ sync lock: cross-instance throttle + single-flight sync
```
### Request flow
1. Browser calls `GET /api/dashboard` on page load.
2. API checks `dashboard_sync_state` and `dashboard_sync_locks`.
3. If the last successful sync is older than `DASHBOARD_SYNC_COOLDOWN_SECONDS` and no lock is active, the server acquires a lock and runs an incremental sync.
4. If another request/user already synced recently or has the lock, the API skips GitHub and returns Neon data plus `sync.waitSeconds` metadata.
5. Dashboard data is read from Neon and returned to the browser.
6. The Refresh button calls a dedicated refresh endpoint or passes `refresh=true`; the server returns either `202 accepted`/fresh data or `429/409` style metadata with the number of seconds to wait.
## Data model
Initial schema is in `db/migrations/0001_neon_dashboard.sql`.
Core tables:
- `dashboard_repositories` ΓÇö repository metadata and discovery state.
- `dashboard_pull_requests` ΓÇö one row per PR, including normalized fields plus raw JSONB payload.
- `dashboard_pull_request_reviews` ΓÇö one row per GitHub review.
- `dashboard_review_requests` ΓÇö requested reviewer history, including active/removed state.
- `dashboard_timeline_events` ΓÇö durable event facts needed for first-response, ready-for-review, and historical reconstruction.
- `dashboard_sync_runs` ΓÇö audit trail for backfill, cron, page-load, and manual refresh runs.
- `dashboard_sync_state` ΓÇö latest successful/attempted sync timestamps and aggregate metadata.
- `dashboard_sync_locks` ΓÇö cross-instance lock used to enforce single-flight syncs and the five-minute throttle.
Store both normalized columns and `raw_payload` JSONB for GitHub records. The normalized fields make dashboard queries fast; the raw payload lets us repair/recompute derived metrics without immediately re-querying GitHub.
## Backfill strategy
Backfill should be separate from normal dashboard reads and daily syncs.
1. Run migrations and verify DB connectivity.
2. Discover configured repositories from `ORGS`, `REPOS_INCLUDE`, and `REPOS_EXCLUDE`.
3. For each repository, page through historical PRs in descending `UPDATED_AT` or `CREATED_AT` order until exhausted or until an optional `BACKFILL_START_DATE` cutoff is reached.
4. For every PR, fetch enough detail to populate:
   - PR identity and state fields.
   - labels and requested reviewers.
   - reviews.
   - timeline events for ready-for-review, comments, review requests, review removals, and first human response calculation.
5. Upsert rows idempotently by GitHub node ID or `(repo_id, number)`.
6. Commit progress per repository/page into `dashboard_sync_runs.metadata` so an interrupted backfill can resume.
7. Respect GitHub rate limits by recording reset timestamps and sleeping/stopping safely when needed.
8. After backfill, run one incremental sync to catch any PRs updated while the backfill was running.
Recommended first implementation path:
- Build a CLI script for repository-scoped backfills, e.g. `npm run backfill -- --repo OpenHands/openhands`.
- Run it repo-by-repo for large orgs so rate-limit and timeout failures are isolated.
- Add a `BACKFILL_MAX_PR_PAGES_PER_REPO` guard for test runs, but keep production backfill able to exhaust all pages.
## Daily cron strategy
Use a deterministic scheduled job, not an LLM automation, because this is fixed data ingestion.
Preferred deployment path on Vercel:
1. Add `app/api/sync/cron/route.ts`.
2. Protect it with `SYNC_CRON_SECRET` using an `Authorization: Bearer <secret>` header.
3. Configure `vercel.json` cron, for example:
```json
{
  "crons": [
    { "path": "/api/sync/cron", "schedule": "0 8 * * *" }
  ]
}
```
Daily cron should:
- Acquire the sync lock with trigger `cron`.
- Sync repositories and all PRs updated since the last successful sync minus a safety overlap window, e.g. 24 hours.
- Update `dashboard_sync_state` only after a successful run.
- Record failures in `dashboard_sync_runs` without deleting the last successful state.
## Page-load and manual refresh throttle
Use Neon as the coordination point, not process memory.
- `DASHBOARD_SYNC_COOLDOWN_SECONDS=300` by default.
- `DASHBOARD_SYNC_LOCK_TIMEOUT_SECONDS=600` by default to recover if a sync crashes.
- Page-load sync check is opportunistic:
  - If allowed, acquire lock and sync before or alongside the response.
  - If throttled, return existing DB data immediately with `sync.waitSeconds`.
- Manual refresh should call the same policy:
  - If allowed: run sync and return refreshed data.
  - If not allowed: return current data and a clear wait message, e.g. `Try again in 3m 12s`.
- Remove the current `cacheBust` behavior once Neon sync state is live because bypassing process cache will not bypass the global throttle.
## Implementation phases
### Phase 0 ΓÇö Database foundation (started on this branch)
- Add Neon dependency and DB connection helper.
- Add migration for core tables, indexes, sync state, and locks.
- Add setup README and environment variable documentation.
### Phase 1 ΓÇö Read path from Neon
- Add repository functions that read normalized PR/review data from Neon.
- Reuse existing `computeDashboardData` and filtering logic where practical.
- Keep GitHub direct fetch path behind a temporary feature flag while validating parity.
### Phase 2 ΓÇö Incremental sync
- Extract GitHub fetch logic into ingestion functions that upsert into Neon.
- Add sync run/state/lock handling.
- Add `/api/sync/refresh` for page-load/manual refresh behavior.
- Return sync metadata from `/api/dashboard`.
### Phase 3 ΓÇö Backfill
- Add a resumable CLI backfill script.
- Backfill in repository batches and record progress in `dashboard_sync_runs.metadata`.
- Validate counts against GitHub search/API spot checks.
### Phase 4 ΓÇö Daily cron
- Add authenticated cron route.
- Add Vercel cron config.
- Confirm logs, run records, and failure handling.
### Phase 5 ΓÇö Cutover and cleanup
- Make Neon the default data source.
- Remove or reduce `lib/cache.ts` use for dashboard data.
- Replace two-minute client auto-refresh with a lighter polling cadence or explicit stale indicator.
- Update tests to cover throttling, DB reads, and sync lock behavior.
## Testing plan
- Unit tests for sync cooldown math and lock-result handling.
- Repository tests for SQL upserts using a test Neon branch or local Postgres when available.
- API tests for:
  - page load when sync is allowed,
  - page load when sync is throttled,
  - manual refresh wait response,
  - cron auth failure/success.
- Backfill dry-run mode that logs would-be repository/page counts without writing.
- Production validation by comparing old direct-GitHub output with Neon-backed output for a fixed repo/date window.
## Open decisions
- Whether to compute dashboard aggregates on every request from normalized facts or persist precomputed daily snapshots for faster historical views.
- Whether backfill should include every timeline event or only the event types needed for current metrics.
- Whether to use Vercel Cron exclusively or also support GitHub Actions/manual CLI sync for non-Vercel deployments.
- Exact GitHub token scopes if private repositories are ever included; current public dashboard needs `read:org` and `public_repo`.
