-- Initial Neon schema for durable dashboard persistence.
-- Apply with: npm run db:migrate
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dashboard_repositories (
  id bigserial PRIMARY KEY,
  owner text NOT NULL,
  name text NOT NULL,
  full_name text NOT NULL UNIQUE,
  html_url text,
  description text,
  is_private boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  is_disabled boolean NOT NULL DEFAULT false,
  pushed_at timestamptz,
  github_updated_at timestamptz,
  last_synced_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_repositories_owner_idx
  ON dashboard_repositories (owner);
CREATE TABLE IF NOT EXISTS dashboard_pull_requests (
  id bigserial PRIMARY KEY,
  repository_id bigint NOT NULL REFERENCES dashboard_repositories(id) ON DELETE CASCADE,
  github_node_id text,
  number integer NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  state text NOT NULL,
  author_login text,
  author_association text,
  author_type text,
  is_draft boolean NOT NULL DEFAULT false,
  mergeable text,
  created_at timestamptz NOT NULL,
  github_updated_at timestamptz NOT NULL,
  closed_at timestamptz,
  merged_at timestamptz,
  ready_for_review_at timestamptz,
  first_human_response_at timestamptz,
  first_review_at timestamptz,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_reviewers jsonb NOT NULL DEFAULT '{"users": [], "teams": []}'::jsonb,
  computed jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repository_id, number),
  UNIQUE (github_node_id)
);
CREATE INDEX IF NOT EXISTS dashboard_pull_requests_repo_state_idx
  ON dashboard_pull_requests (repository_id, state);
CREATE INDEX IF NOT EXISTS dashboard_pull_requests_updated_idx
  ON dashboard_pull_requests (github_updated_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_pull_requests_ready_idx
  ON dashboard_pull_requests (ready_for_review_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_pull_requests_author_idx
  ON dashboard_pull_requests (author_login);
CREATE TABLE IF NOT EXISTS dashboard_pull_request_reviews (
  id bigserial PRIMARY KEY,
  pull_request_id bigint NOT NULL REFERENCES dashboard_pull_requests(id) ON DELETE CASCADE,
  github_node_id text NOT NULL UNIQUE,
  reviewer_login text,
  state text NOT NULL,
  author_association text,
  submitted_at timestamptz NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_pull_request_reviews_pr_idx
  ON dashboard_pull_request_reviews (pull_request_id, submitted_at);
CREATE INDEX IF NOT EXISTS dashboard_pull_request_reviews_reviewer_idx
  ON dashboard_pull_request_reviews (reviewer_login, submitted_at DESC);
CREATE TABLE IF NOT EXISTS dashboard_review_requests (
  id bigserial PRIMARY KEY,
  pull_request_id bigint NOT NULL REFERENCES dashboard_pull_requests(id) ON DELETE CASCADE,
  reviewer_type text NOT NULL,
  reviewer_login text,
  team_slug text,
  requested_at timestamptz NOT NULL,
  removed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_review_requests_unique_idx
  ON dashboard_review_requests (
    pull_request_id,
    reviewer_type,
    COALESCE(reviewer_login, ''),
    COALESCE(team_slug, ''),
    requested_at
  );
CREATE INDEX IF NOT EXISTS dashboard_review_requests_active_idx
  ON dashboard_review_requests (is_active, reviewer_login, requested_at DESC);
CREATE TABLE IF NOT EXISTS dashboard_timeline_events (
  id bigserial PRIMARY KEY,
  pull_request_id bigint NOT NULL REFERENCES dashboard_pull_requests(id) ON DELETE CASCADE,
  github_node_id text,
  event_type text NOT NULL,
  actor_login text,
  occurred_at timestamptz NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pull_request_id, github_node_id)
);
CREATE INDEX IF NOT EXISTS dashboard_timeline_events_pr_type_idx
  ON dashboard_timeline_events (pull_request_id, event_type, occurred_at);
CREATE INDEX IF NOT EXISTS dashboard_timeline_events_actor_idx
  ON dashboard_timeline_events (actor_login, occurred_at DESC);
CREATE TABLE IF NOT EXISTS dashboard_sync_runs (
  id bigserial PRIMARY KEY,
  trigger text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  repositories_seen integer NOT NULL DEFAULT 0,
  pull_requests_seen integer NOT NULL DEFAULT 0,
  reviews_seen integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS dashboard_sync_runs_started_idx
  ON dashboard_sync_runs (started_at DESC);
CREATE TABLE IF NOT EXISTS dashboard_sync_state (
  sync_key text PRIMARY KEY,
  last_successful_sync_at timestamptz,
  last_attempted_sync_at timestamptz,
  last_run_id bigint REFERENCES dashboard_sync_runs(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dashboard_sync_locks (
  lock_key text PRIMARY KEY,
  lock_token uuid NOT NULL DEFAULT gen_random_uuid(),
  locked_until timestamptz NOT NULL,
  locked_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_sync_locks_expiry_idx
  ON dashboard_sync_locks (locked_until);
