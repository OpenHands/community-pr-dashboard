import { Pool } from '@neondatabase/serverless';
import {
  buildRequestedReviewersSnapshot,
  computeFirstsFromReviews,
  determineReadyForReviewAt,
  getAuthorType,
  summarizePullRequest,
} from './backfill-data.mjs';

const DASHBOARD_SYNC_KEY = 'github-dashboard';

function stringifyJson(value) {
  return JSON.stringify(value ?? {});
}

function buildInsertPlaceholders(rowCount, columnCount) {
  const rows = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const values = [];
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      values.push(`$${rowIndex * columnCount + columnIndex + 1}`);
    }
    rows.push(`(${values.join(', ')})`);
  }

  return rows.join(', ');
}

export function createPool(connectionString) {
  return new Pool({ connectionString });
}

export function buildProgressMetadata(options, repositories, progress) {
  return {
    options: {
      dryRun: options.dryRun,
      maxPages: options.maxPages,
      startDate: options.startDate || null,
      repositories: repositories.map(repo => repo.full_name),
    },
    progress,
  };
}

export async function createSyncRun(pool, metadata) {
  const result = await pool.query(
    `
      INSERT INTO dashboard_sync_runs (trigger, status, started_at, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING id
    `,
    ['backfill', 'running', new Date().toISOString(), stringifyJson(metadata)]
  );

  return result.rows[0].id;
}

export async function updateSyncRun(pool, runId, fields) {
  if (!runId) {
    return;
  }

  await pool.query(
    `
      UPDATE dashboard_sync_runs
      SET repositories_seen = $2,
          pull_requests_seen = $3,
          reviews_seen = $4,
          metadata = $5::jsonb,
          error_message = $6,
          finished_at = COALESCE($7, finished_at),
          status = COALESCE($8, status)
      WHERE id = $1
    `,
    [
      runId,
      fields.repositoriesSeen,
      fields.pullRequestsSeen,
      fields.reviewsSeen,
      stringifyJson(fields.metadata),
      fields.errorMessage || null,
      fields.finishedAt || null,
      fields.status || null,
    ]
  );
}

export async function updateSyncState(pool, runId, status, metadata) {
  const nowIso = new Date().toISOString();
  const lastSuccessfulSyncAt = status === 'completed' ? nowIso : null;

  await pool.query(
    `
      INSERT INTO dashboard_sync_state (
        sync_key,
        last_successful_sync_at,
        last_attempted_sync_at,
        last_run_id,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (sync_key)
      DO UPDATE SET last_successful_sync_at = COALESCE(EXCLUDED.last_successful_sync_at, dashboard_sync_state.last_successful_sync_at),
                    last_attempted_sync_at = EXCLUDED.last_attempted_sync_at,
                    last_run_id = EXCLUDED.last_run_id,
                    metadata = EXCLUDED.metadata,
                    updated_at = EXCLUDED.updated_at
    `,
    [DASHBOARD_SYNC_KEY, lastSuccessfulSyncAt, nowIso, runId, stringifyJson(metadata), nowIso]
  );
}

export async function persistRepository(pool, repo) {
  const syncedAt = new Date().toISOString();
  const client = await pool.connect();

  try {
    const result = await client.query(
      `
        INSERT INTO dashboard_repositories (
          owner,
          name,
          full_name,
          html_url,
          description,
          is_private,
          is_archived,
          is_disabled,
          pushed_at,
          github_updated_at,
          last_synced_at,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
        ON CONFLICT (full_name)
        DO UPDATE SET html_url = EXCLUDED.html_url,
                      description = EXCLUDED.description,
                      is_private = EXCLUDED.is_private,
                      is_archived = EXCLUDED.is_archived,
                      is_disabled = EXCLUDED.is_disabled,
                      pushed_at = EXCLUDED.pushed_at,
                      github_updated_at = EXCLUDED.github_updated_at,
                      last_synced_at = EXCLUDED.last_synced_at,
                      raw_payload = EXCLUDED.raw_payload,
                      updated_at = now()
        RETURNING id
      `,
      [
        repo.owner.login,
        repo.name,
        repo.full_name,
        repo.html_url,
        repo.description || null,
        Boolean(repo.private),
        Boolean(repo.archived),
        Boolean(repo.disabled),
        repo.pushed_at || null,
        repo.updated_at || null,
        syncedAt,
        stringifyJson(repo),
      ]
    );

    return result.rows[0].id;
  } finally {
    client.release();
  }
}

async function replacePullRequestChildren(client, pullRequestId, summary, syncedAt) {
  await client.query('DELETE FROM dashboard_pull_request_reviews WHERE pull_request_id = $1', [pullRequestId]);
  await client.query('DELETE FROM dashboard_review_requests WHERE pull_request_id = $1', [pullRequestId]);
  await client.query('DELETE FROM dashboard_timeline_events WHERE pull_request_id = $1', [pullRequestId]);

  if (summary.reviewRows.length > 0) {
    const values = [];
    for (const row of summary.reviewRows) {
      values.push(
        pullRequestId,
        row.githubNodeId,
        row.reviewerLogin,
        row.state,
        row.authorAssociation,
        row.submittedAt,
        stringifyJson(row.rawPayload),
        syncedAt,
      );
    }

    await client.query(
      `
        INSERT INTO dashboard_pull_request_reviews (
          pull_request_id,
          github_node_id,
          reviewer_login,
          state,
          author_association,
          submitted_at,
          raw_payload,
          last_synced_at
        )
        VALUES ${buildInsertPlaceholders(summary.reviewRows.length, 8)}
      `,
      values
    );
  }

  if (summary.reviewRequestRows.length > 0) {
    const values = [];
    for (const row of summary.reviewRequestRows) {
      values.push(
        pullRequestId,
        row.reviewerType,
        row.reviewerLogin,
        row.teamSlug,
        row.requestedAt,
        row.removedAt,
        row.isActive,
        stringifyJson(row.rawPayload),
        syncedAt,
      );
    }

    await client.query(
      `
        INSERT INTO dashboard_review_requests (
          pull_request_id,
          reviewer_type,
          reviewer_login,
          team_slug,
          requested_at,
          removed_at,
          is_active,
          raw_payload,
          last_synced_at
        )
        VALUES ${buildInsertPlaceholders(summary.reviewRequestRows.length, 9)}
      `,
      values
    );
  }

  if (summary.timelineRows.length > 0) {
    const values = [];
    for (const row of summary.timelineRows) {
      values.push(
        pullRequestId,
        row.githubNodeId,
        row.eventType,
        row.actorLogin,
        row.occurredAt,
        stringifyJson(row.rawPayload),
        syncedAt,
      );
    }

    await client.query(
      `
        INSERT INTO dashboard_timeline_events (
          pull_request_id,
          github_node_id,
          event_type,
          actor_login,
          occurred_at,
          raw_payload,
          last_synced_at
        )
        VALUES ${buildInsertPlaceholders(summary.timelineRows.length, 7)}
      `,
      values
    );
  }
}

export async function persistPullRequest(pool, repositoryId, pr, details, context) {
  const syncedAt = new Date().toISOString();
  const summary = summarizePullRequest(pr, details);
  const requestedReviewers = buildRequestedReviewersSnapshot(pr);
  const firsts = computeFirstsFromReviews(details.reviews, context.employeesSet);
  const readyForReviewAt = determineReadyForReviewAt(pr, details.timelineEvents);
  const authorLogin = pr.user?.login || null;
  const authorAssociation = pr.author_association || 'NONE';
  const authorType = getAuthorType(authorLogin, context.employeesSet, authorAssociation, context.repoAuthorRoleSets);
  const state = pr.merged_at ? 'MERGED' : String(pr.state || '').toUpperCase();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        INSERT INTO dashboard_pull_requests (
          repository_id,
          github_node_id,
          number,
          title,
          url,
          state,
          author_login,
          author_association,
          author_type,
          is_draft,
          mergeable,
          created_at,
          github_updated_at,
          closed_at,
          merged_at,
          ready_for_review_at,
          first_human_response_at,
          first_review_at,
          labels,
          requested_reviewers,
          computed,
          raw_payload,
          last_seen_at,
          last_synced_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23, $24
        )
        ON CONFLICT (repository_id, number)
        DO UPDATE SET github_node_id = EXCLUDED.github_node_id,
                      title = EXCLUDED.title,
                      url = EXCLUDED.url,
                      state = EXCLUDED.state,
                      author_login = EXCLUDED.author_login,
                      author_association = EXCLUDED.author_association,
                      author_type = EXCLUDED.author_type,
                      is_draft = EXCLUDED.is_draft,
                      mergeable = EXCLUDED.mergeable,
                      github_updated_at = EXCLUDED.github_updated_at,
                      closed_at = EXCLUDED.closed_at,
                      merged_at = EXCLUDED.merged_at,
                      ready_for_review_at = EXCLUDED.ready_for_review_at,
                      first_human_response_at = EXCLUDED.first_human_response_at,
                      first_review_at = EXCLUDED.first_review_at,
                      labels = EXCLUDED.labels,
                      requested_reviewers = EXCLUDED.requested_reviewers,
                      computed = EXCLUDED.computed,
                      raw_payload = EXCLUDED.raw_payload,
                      last_seen_at = EXCLUDED.last_seen_at,
                      last_synced_at = EXCLUDED.last_synced_at
        RETURNING id
      `,
      [
        repositoryId,
        pr.node_id || null,
        pr.number,
        pr.title,
        pr.html_url,
        state,
        authorLogin,
        authorAssociation,
        authorType,
        Boolean(pr.draft),
        null,
        pr.created_at,
        pr.updated_at,
        pr.closed_at || null,
        pr.merged_at || null,
        readyForReviewAt,
        firsts.firstHumanResponseAt,
        firsts.firstReviewAt,
        stringifyJson(Array.isArray(pr.labels) ? pr.labels.map(label => label.name).filter(Boolean) : []),
        stringifyJson(requestedReviewers),
        stringifyJson({
          source: 'backfill',
          reviewCount: summary.activeReviewCount,
          timelineEventCount: summary.timelineRows.length,
        }),
        stringifyJson(pr),
        syncedAt,
        syncedAt,
      ]
    );

    await replacePullRequestChildren(client, result.rows[0].id, summary, syncedAt);

    await client.query('COMMIT');

    return summary;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
