# Neon Setup Guide
This dashboard will use Neon Postgres as the durable source of truth for PR and review data. Use this guide to create the database, configure environment variables, run migrations, and prepare for backfill/scheduled sync.
## Required environment variables
| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon pooled Postgres connection string. Use the pooled endpoint for Vercel/serverless deployments. |
| `NEON_DATABASE_URL` | Optional | Alias fallback if you prefer not to name the connection string `DATABASE_URL`. `DATABASE_URL` wins when both are set. |
| `GITHUB_TOKEN` | Yes | GitHub token used for repository, PR, review, and org-member ingestion. Needs `read:org` and `public_repo` for public OpenHands repos. |
| `SYNC_CRON_SECRET` | Yes before deploying cron | Random secret used to protect cron and manual sync endpoints. |
| `DASHBOARD_SYNC_COOLDOWN_SECONDS` | No | Minimum seconds between GitHub syncs triggered by page loads or refresh. Defaults to `300`. |
| `DASHBOARD_SYNC_LOCK_TIMEOUT_SECONDS` | No | Max lock lifetime for a running sync before another process can recover it. Defaults to `600`. |
| `BACKFILL_START_DATE` | No | Optional ISO date cutoff for historical backfill tests. Leave unset for full history. |
| `BACKFILL_MAX_PR_PAGES_PER_REPO` | No | Optional safety limit for dry runs or local testing. Leave unset for full backfill. |
Keep the existing dashboard variables as well: `ORGS`, `REPOS_INCLUDE`, `REPOS_EXCLUDE`, SLA settings, and GitHub page limits.
## Create the Neon database
### Option A ΓÇö Neon Console
1. Go to the Neon console and create a project, for example `openhands-community-pr-dashboard`.
2. Create or keep the default database, for example `dashboard`.
3. Create an application role, for example `dashboard_app`.
4. Copy the pooled connection string. It should look like:
```text
postgresql://dashboard_app:<password>@ep-...-pooler.<region>.aws.neon.tech/dashboard?sslmode=require
```
5. Set that value as `DATABASE_URL` locally and in Vercel.
### Option B ΓÇö Neon CLI
If you use `neonctl`, the exact commands depend on your Neon account setup, but the flow is:
```bash
neonctl auth
neonctl projects create --name openhands-community-pr-dashboard
neonctl connection-string --pooled --database-name dashboard --role-name dashboard_app
```
Copy the pooled connection string into `DATABASE_URL`.
## Local setup
1. Copy the environment example:
```bash
cp .env.local.example .env.local
```
2. Add the Neon and sync values:
```env
DATABASE_URL=postgresql://dashboard_app:<password>@ep-...-pooler.<region>.aws.neon.tech/dashboard?sslmode=require
SYNC_CRON_SECRET=<generate-a-long-random-value>
DASHBOARD_SYNC_COOLDOWN_SECONDS=300
DASHBOARD_SYNC_LOCK_TIMEOUT_SECONDS=600
```
3. Install dependencies:
```bash
npm install
```
4. Run migrations:
```bash
npm run db:migrate
```
5. Start the app:
```bash
npm run dev
```
## Vercel setup
Add the following project environment variables in Vercel for Preview and Production:
- `DATABASE_URL`
- `GITHUB_TOKEN`
- `SYNC_CRON_SECRET`
- `DASHBOARD_SYNC_COOLDOWN_SECONDS` (optional, default `300`)
- `DASHBOARD_SYNC_LOCK_TIMEOUT_SECONDS` (optional, default `600`)
- Existing dashboard config such as `ORGS`, `REPOS_INCLUDE`, and `REPOS_EXCLUDE`
Use the pooled Neon connection string for Vercel. Serverless deployments can open many short-lived connections; the pooled endpoint avoids exhausting Postgres connection limits.
## Applying migrations
Migrations are plain SQL files in `db/migrations/` and are applied in filename order by:
```bash
npm run db:migrate
```
The migration runner records applied files in `schema_migrations`, so re-running the command is safe.
## Backfill plan
Backfill support will be implemented as a resumable script in a follow-up phase. Until then, use this target flow:
```bash
# Full history after the backfill script lands
npm run backfill
# Safer single-repo dry run during testing
npm run backfill -- --repo OpenHands/community-pr-dashboard --dry-run
```
Backfill should be run from a trusted machine or CI job with `DATABASE_URL` and `GITHUB_TOKEN` available. Expect it to take time because it must page through historical PRs and timelines while respecting GitHub rate limits.
## Daily sync plan
The planned production path is a Vercel Cron hitting an authenticated route once per day:
```json
{
  "crons": [
    { "path": "/api/sync/cron", "schedule": "0 8 * * *" }
  ]
}
```
The route must verify:
```http
Authorization: Bearer <SYNC_CRON_SECRET>
```
## Page-load refresh behavior
Once the sync route is implemented, page loads and the Refresh button should share the same global throttle:
- If the last successful GitHub sync was more than five minutes ago, one request acquires the Neon lock and syncs.
- Other users get current Neon data immediately and a wait time.
- Refresh can display `Try again in Xm Ys` instead of bypassing cache.
## Troubleshooting
- `DATABASE_URL is required`: confirm `.env.local` exists locally or Vercel env vars are set.
- `password authentication failed`: rotate/copy the Neon role password again.
- `connection requires SSL`: ensure the connection string includes `sslmode=require`.
- `GitHub API rate limit exceeded`: wait until reset, lower backfill concurrency, or run repository batches.
- Migration appears stuck: check whether a prior process is holding a database connection or transaction.
