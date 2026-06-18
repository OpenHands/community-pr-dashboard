import process from 'node:process';
import { loadEnvFiles } from './load-env.mjs';
import {
  buildCollaboratorsSet,
  buildEmployeesSet,
  buildMaintainersSet,
  fetchPullRequestDetails,
  fetchPullRequestsPage,
  resolveRepositories,
  summarizePullRequest,
} from './backfill-data.mjs';
import {
  buildProgressMetadata,
  createPool,
  createSyncRun,
  persistPullRequest,
  persistRepository,
  updateSyncRun,
  updateSyncState,
} from './backfill-db.mjs';
import {
  InterruptError,
  formatDuration,
  logLine,
  parseArgs,
  parseDateInput,
  printHelp,
} from './backfill-shared.mjs';

loadEnvFiles();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const startDate = parseDateInput(options.startDate);
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';

  if (!options.dryRun && !databaseUrl) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL is required unless you use --dry-run.');
  }

  const repositories = await resolveRepositories(options.repos);
  if (repositories.length === 0) {
    logLine('No repositories matched the current configuration. Nothing to backfill.');
    return;
  }

  const employeesSet = await buildEmployeesSet();
  const maintainersSet = await buildMaintainersSet();
  const startedAtMs = Date.now();
  const progress = {
    startedAt: new Date().toISOString(),
    reposTotal: repositories.length,
    reposCompleted: 0,
    currentRepo: null,
    currentPage: 0,
    pagesProcessed: 0,
    prsProcessed: 0,
    reviewsProcessed: 0,
    reviewRequestsProcessed: 0,
    timelineEventsProcessed: 0,
  };

  let stopRequested = false;
  process.on('SIGINT', () => {
    if (stopRequested) {
      logLine('Received a second Ctrl+C; exiting immediately.');
      process.exit(130);
    }

    stopRequested = true;
    logLine('Received Ctrl+C. Finishing the current pull request before stopping...');
  });

  const pool = options.dryRun ? null : createPool(databaseUrl);
  const runId = pool
    ? await createSyncRun(pool, buildProgressMetadata(options, repositories, progress))
    : null;

  try {
    logLine(`Starting ${options.dryRun ? 'dry-run ' : ''}backfill for ${repositories.length} repos.`);
    if (startDate) {
      logLine(`Skipping PRs with updated_at before ${startDate.toISOString()}.`);
    }
    if (options.maxPages) {
      logLine(`Limiting each repository to ${options.maxPages} PR list pages.`);
    }

    for (let repoIndex = 0; repoIndex < repositories.length; repoIndex += 1) {
      if (stopRequested) {
        throw new InterruptError();
      }

      const repo = repositories[repoIndex];
      const [owner, repoName] = repo.full_name.split('/');
      progress.currentRepo = repo.full_name;
      progress.currentPage = 0;

      logLine(`[${repoIndex + 1}/${repositories.length}] ${repo.full_name}: loading repository roles...`);

      let collaboratorsSet = new Set();
      try {
        collaboratorsSet = await buildCollaboratorsSet(owner, repoName);
      } catch (error) {
        logLine(`Unable to load collaborators for ${repo.full_name}; author_type may be less precise. ${error instanceof Error ? error.message : String(error)}`);
      }

      const repoAuthorRoleSets = {
        maintainers: new Set(maintainersSet),
        collaborators: collaboratorsSet,
      };

      const repositoryId = pool ? await persistRepository(pool, repo) : null;
      let page = 1;
      let repoPrCount = 0;
      let repoReviewCount = 0;
      let repoReviewRequestCount = 0;
      let repoTimelineCount = 0;
      let cutoffReached = false;

      while (!cutoffReached) {
        if (stopRequested) {
          throw new InterruptError();
        }

        if (options.maxPages && page > options.maxPages) {
          break;
        }

        progress.currentPage = page;
        const { data: prPageData, rateLimit } = await fetchPullRequestsPage(owner, repoName, page);
        const pullRequests = Array.isArray(prPageData) ? prPageData : [];

        if (pullRequests.length === 0) {
          logLine(`${repo.full_name}: no more pull requests after page ${page - 1}.`);
          break;
        }

        const eligiblePullRequests = startDate
          ? pullRequests.filter(pr => new Date(pr.updated_at).getTime() >= startDate.getTime())
          : pullRequests;

        if (startDate && eligiblePullRequests.length < pullRequests.length) {
          cutoffReached = true;
        }

        if (eligiblePullRequests.length === 0) {
          logLine(`${repo.full_name}: reached start-date cutoff before page ${page}.`);
          break;
        }

        progress.pagesProcessed += 1;
        logLine(`${repo.full_name}: page ${page} fetched ${eligiblePullRequests.length} PRs (${formatDuration(Date.now() - startedAtMs)} elapsed${rateLimit ? `, ${rateLimit.remaining} GitHub requests remaining` : ''}).`);

        for (let prIndex = 0; prIndex < eligiblePullRequests.length; prIndex += 1) {
          if (stopRequested) {
            throw new InterruptError();
          }

          const pr = eligiblePullRequests[prIndex];
          const details = await fetchPullRequestDetails(owner, repoName, pr.number);
          const summary = summarizePullRequest(pr, details);

          if (pool && repositoryId) {
            await persistPullRequest(pool, repositoryId, pr, details, {
              employeesSet,
              repoAuthorRoleSets,
            });
          }

          repoPrCount += 1;
          repoReviewCount += summary.reviewRows.length;
          repoReviewRequestCount += summary.reviewRequestRows.length;
          repoTimelineCount += summary.timelineRows.length;
          progress.prsProcessed += 1;
          progress.reviewsProcessed += summary.reviewRows.length;
          progress.reviewRequestsProcessed += summary.reviewRequestRows.length;
          progress.timelineEventsProcessed += summary.timelineRows.length;

          if ((prIndex + 1) % 10 === 0 || prIndex + 1 === eligiblePullRequests.length) {
            const elapsed = Date.now() - startedAtMs;
            const prsPerMinute = progress.prsProcessed > 0 ? (progress.prsProcessed / elapsed) * 60_000 : 0;
            logLine(
              `${repo.full_name}: page ${page} progress ${prIndex + 1}/${eligiblePullRequests.length} PRs; ` +
              `${progress.prsProcessed} total PRs, ${progress.reviewsProcessed} reviews, ${progress.reviewRequestsProcessed} review requests, ` +
              `${progress.timelineEventsProcessed} timeline events stored; ~${prsPerMinute.toFixed(1)} PRs/min.`
            );
          }
        }

        if (pool && runId) {
          await updateSyncRun(pool, runId, {
            repositoriesSeen: progress.reposCompleted,
            pullRequestsSeen: progress.prsProcessed,
            reviewsSeen: progress.reviewsProcessed,
            metadata: buildProgressMetadata(options, repositories, progress),
          });
        }

        if (pullRequests.length < 100) {
          break;
        }

        page += 1;
      }

      progress.reposCompleted += 1;
      logLine(
        `${repo.full_name}: complete. ${repoPrCount} PRs, ${repoReviewCount} reviews, ` +
        `${repoReviewRequestCount} review requests, ${repoTimelineCount} timeline events in ${formatDuration(Date.now() - startedAtMs)}.`
      );

      if (pool && runId) {
        await updateSyncRun(pool, runId, {
          repositoriesSeen: progress.reposCompleted,
          pullRequestsSeen: progress.prsProcessed,
          reviewsSeen: progress.reviewsProcessed,
          metadata: buildProgressMetadata(options, repositories, progress),
        });
      }
    }

    if (pool && runId) {
      const metadata = buildProgressMetadata(options, repositories, progress);
      await updateSyncRun(pool, runId, {
        repositoriesSeen: progress.reposCompleted,
        pullRequestsSeen: progress.prsProcessed,
        reviewsSeen: progress.reviewsProcessed,
        metadata,
        finishedAt: new Date().toISOString(),
        status: 'completed',
      });
      await updateSyncState(pool, runId, 'completed', metadata);
    }

    logLine(
      `Backfill finished. ${progress.reposCompleted}/${progress.reposTotal} repos, ` +
      `${progress.prsProcessed} PRs, ${progress.reviewsProcessed} reviews, ${progress.reviewRequestsProcessed} review requests, ` +
      `${progress.timelineEventsProcessed} timeline events in ${formatDuration(Date.now() - startedAtMs)}.`
    );
  } catch (error) {
    const isInterrupt = error instanceof InterruptError;
    const message = isInterrupt
      ? 'Backfill interrupted by user.'
      : error instanceof Error
        ? error.message
        : String(error);

    if (pool && runId) {
      const metadata = buildProgressMetadata(options, repositories, progress);
      await updateSyncRun(pool, runId, {
        repositoriesSeen: progress.reposCompleted,
        pullRequestsSeen: progress.prsProcessed,
        reviewsSeen: progress.reviewsProcessed,
        metadata,
        errorMessage: message,
        finishedAt: new Date().toISOString(),
        status: 'failed',
      });
      await updateSyncState(pool, runId, 'failed', metadata);
    }

    throw error;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

main().catch(error => {
  if (error instanceof InterruptError) {
    logLine('Stopped cleanly after the current pull request.');
    process.exit(130);
  }

  console.error(error);
  process.exit(1);
});
