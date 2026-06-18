import {
  ACTIVE_REVIEW_STATES,
  PER_PAGE,
  TIMELINE_EVENTS_TO_STORE,
  fetchGitHubJson,
  fetchOrgRepositories,
  fetchPaginatedCollection,
  fetchRepository,
  isBotLogin,
  isOrgMemberAssociation,
  loadOverrides,
  logLine,
  normalizeLogin,
} from './backfill-shared.mjs';

function sortByOccurredAt(items, accessor) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(accessor(left) || 0).getTime();
    const rightTime = new Date(accessor(right) || 0).getTime();
    return leftTime - rightTime;
  });
}

export async function resolveRepositories(explicitRepos) {
  if (explicitRepos.length > 0) {
    const repositories = [];

    for (const fullName of explicitRepos) {
      const [owner, repo] = fullName.split('/');
      if (!owner || !repo) {
        throw new Error(`Invalid repository name: ${fullName}`);
      }

      repositories.push(await fetchRepository(owner, repo));
    }

    return repositories;
  }

  const includeRepos = (process.env.REPOS_INCLUDE || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (includeRepos.length > 0) {
    return resolveRepositories(includeRepos);
  }

  const orgs = (process.env.ORGS || 'OpenHands')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const excluded = new Set(
    (process.env.REPOS_EXCLUDE || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );

  const repositories = [];
  for (const org of orgs) {
    logLine(`Discovering repositories for organization ${org}...`);
    const orgRepositories = await fetchOrgRepositories(org);
    repositories.push(...orgRepositories.filter(repo => !excluded.has(repo.full_name.toLowerCase())));
  }

  return repositories;
}

export async function buildEmployeesSet() {
  const employees = new Set();
  const overrides = await loadOverrides('../config/employees.json');
  const orgs = (process.env.ORGS || 'OpenHands')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  try {
    const { data } = await fetchGitHubJson(
      'https://raw.githubusercontent.com/OpenHands/champions-list/main/data/excluded-logins.json'
    );

    const entries = Array.isArray(data?.logins) ? data.logins : [];
    for (const entry of entries) {
      if (typeof entry?.login === 'string' && typeof entry?.reason === 'string' && entry.reason.toLowerCase() === 'employee or org member') {
        employees.add(normalizeLogin(entry.login));
      }
    }
  } catch (error) {
    logLine(`Falling back to org membership for employee detection: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (employees.size === 0) {
    for (const org of orgs) {
      let page = 1;

      while (true) {
        const { data } = await fetchGitHubJson(
          `https://api.github.com/orgs/${org}/members?per_page=${PER_PAGE}&page=${page}`
        );
        const members = Array.isArray(data) ? data : [];

        if (members.length === 0) {
          break;
        }

        for (const member of members) {
          if (typeof member?.login === 'string') {
            employees.add(normalizeLogin(member.login));
          }
        }

        if (members.length < PER_PAGE) {
          break;
        }

        page += 1;
      }
    }
  }

  overrides.allowlist.forEach(login => employees.add(login));
  overrides.denylist.forEach(login => employees.delete(login));

  return employees;
}

export async function buildMaintainersSet() {
  const maintainers = new Set();
  const overrides = await loadOverrides('../config/maintainers.json');

  overrides.allowlist.forEach(login => maintainers.add(login));
  overrides.denylist.forEach(login => maintainers.delete(login));

  return maintainers;
}

export async function buildCollaboratorsSet(owner, repo) {
  const collaborators = new Set();
  let page = 1;

  while (true) {
    const { data } = await fetchGitHubJson(
      `https://api.github.com/repos/${owner}/${repo}/collaborators?affiliation=all&per_page=${PER_PAGE}&page=${page}`
    );
    const pageItems = Array.isArray(data) ? data : [];

    if (pageItems.length === 0) {
      break;
    }

    for (const collaborator of pageItems) {
      const permissions = collaborator?.permissions || {};
      if (permissions.admin || permissions.maintain || permissions.push) {
        collaborators.add(normalizeLogin(collaborator.login));
      }
    }

    if (pageItems.length < PER_PAGE) {
      break;
    }

    page += 1;
  }

  return collaborators;
}

export function getAuthorType(authorLogin, employeesSet, authorAssociation, repoAuthorRoleSets) {
  const normalizedAuthorLogin = normalizeLogin(authorLogin);

  if (isBotLogin(normalizedAuthorLogin)) {
    return 'bot';
  }

  if (repoAuthorRoleSets.maintainers.has(normalizedAuthorLogin)) {
    return 'maintainer';
  }

  if (employeesSet.has(normalizedAuthorLogin) || isOrgMemberAssociation(authorAssociation)) {
    return 'employee';
  }

  if (repoAuthorRoleSets.collaborators.has(normalizedAuthorLogin) || authorAssociation === 'COLLABORATOR') {
    return 'collaborator';
  }

  return 'community';
}

export async function fetchPullRequestsPage(owner, repo, page) {
  return fetchGitHubJson(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=${PER_PAGE}&page=${page}`
  );
}

export async function fetchPullRequestDetails(owner, repo, pullNumber) {
  const [reviewsResult, timelineResult] = await Promise.all([
    fetchPaginatedCollection(
      page => `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?per_page=${PER_PAGE}&page=${page}`
    ),
    fetchPaginatedCollection(
      page => `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/timeline?per_page=${PER_PAGE}&page=${page}`
    ),
  ]);

  return {
    reviews: reviewsResult.items,
    timelineEvents: timelineResult.items,
  };
}

export function computeFirstsFromReviews(reviews, employeesSet) {
  const humanReviews = sortByOccurredAt(
    reviews.filter(review => review?.submitted_at && review?.user?.login && !isBotLogin(review.user.login)),
    review => review.submitted_at
  );

  const firstReviewAt = humanReviews[0]?.submitted_at || null;
  const firstHumanResponseAt = humanReviews.find(review => employeesSet.has(normalizeLogin(review.user.login)))?.submitted_at || null;

  return {
    firstHumanResponseAt,
    firstReviewAt,
  };
}

export function determineReadyForReviewAt(pr, timelineEvents) {
  const readyEvent = sortByOccurredAt(
    timelineEvents.filter(event => event?.event === 'ready_for_review' && event?.created_at),
    event => event.created_at
  )[0];

  return readyEvent?.created_at || pr.created_at;
}

export function buildRequestedReviewersSnapshot(pr) {
  return {
    users: Array.isArray(pr?.requested_reviewers)
      ? pr.requested_reviewers
          .map(reviewer => reviewer?.login)
          .filter(login => typeof login === 'string' && !isBotLogin(login))
      : [],
    teams: Array.isArray(pr?.requested_teams)
      ? pr.requested_teams
          .map(team => team?.slug)
          .filter(slug => typeof slug === 'string' && slug.length > 0)
      : [],
  };
}

function getReviewRequestDescriptor(event) {
  if (event?.requested_reviewer?.login) {
    return {
      reviewerType: 'user',
      reviewerLogin: event.requested_reviewer.login,
      reviewerKey: `user:${normalizeLogin(event.requested_reviewer.login)}`,
      teamSlug: null,
    };
  }

  if (event?.requested_team?.slug) {
    return {
      reviewerType: 'team',
      reviewerLogin: null,
      reviewerKey: `team:${String(event.requested_team.slug).toLowerCase()}`,
      teamSlug: event.requested_team.slug,
    };
  }

  return null;
}

export function buildTimelineEventRows(timelineEvents) {
  return sortByOccurredAt(
    timelineEvents.filter(event => TIMELINE_EVENTS_TO_STORE.has(event?.event) && event?.created_at),
    event => event.created_at
  ).map(event => {
    const descriptor = getReviewRequestDescriptor(event);
    const syntheticId = [
      'timeline',
      event.node_id || event.id || 'no-id',
      event.event || 'unknown',
      event.created_at || 'unknown',
      event.actor?.login || 'unknown',
      descriptor?.reviewerKey || 'none',
    ].join(':');

    return {
      githubNodeId: event.node_id || syntheticId,
      eventType: event.event,
      actorLogin: event.actor?.login || null,
      occurredAt: event.created_at,
      rawPayload: event,
    };
  });
}

export function buildReviewRequestRows(pr, timelineEvents) {
  const rows = [];
  const activeRowsByKey = new Map();
  const sortedEvents = sortByOccurredAt(
    timelineEvents.filter(event => ['review_requested', 'review_request_removed'].includes(event?.event) && event?.created_at),
    event => event.created_at
  );

  for (const event of sortedEvents) {
    const descriptor = getReviewRequestDescriptor(event);
    if (!descriptor) {
      continue;
    }

    if (event.event === 'review_requested') {
      const row = {
        reviewerType: descriptor.reviewerType,
        reviewerLogin: descriptor.reviewerLogin,
        teamSlug: descriptor.teamSlug,
        requestedAt: event.created_at,
        removedAt: null,
        isActive: true,
        rawPayload: event,
      };
      rows.push(row);
      activeRowsByKey.set(descriptor.reviewerKey, row);
    }

    if (event.event === 'review_request_removed') {
      const activeRow = activeRowsByKey.get(descriptor.reviewerKey);
      if (activeRow) {
        activeRow.removedAt = event.created_at;
        activeRow.isActive = false;
        activeRowsByKey.delete(descriptor.reviewerKey);
      }
    }
  }

  const snapshot = buildRequestedReviewersSnapshot(pr);

  for (const reviewerLogin of snapshot.users) {
    const reviewerKey = `user:${normalizeLogin(reviewerLogin)}`;
    if (!activeRowsByKey.has(reviewerKey)) {
      rows.push({
        reviewerType: 'user',
        reviewerLogin,
        teamSlug: null,
        requestedAt: pr.updated_at,
        removedAt: null,
        isActive: true,
        rawPayload: {
          synthetic: true,
          source: 'current_requested_reviewers',
          reviewerLogin,
          pullNumber: pr.number,
        },
      });
    }
  }

  for (const teamSlug of snapshot.teams) {
    const reviewerKey = `team:${String(teamSlug).toLowerCase()}`;
    if (!activeRowsByKey.has(reviewerKey)) {
      rows.push({
        reviewerType: 'team',
        reviewerLogin: null,
        teamSlug,
        requestedAt: pr.updated_at,
        removedAt: null,
        isActive: true,
        rawPayload: {
          synthetic: true,
          source: 'current_requested_teams',
          teamSlug,
          pullNumber: pr.number,
        },
      });
    }
  }

  return rows;
}

export function buildReviewRows(reviews) {
  return sortByOccurredAt(
    reviews.filter(review => review?.submitted_at && review?.node_id),
    review => review.submitted_at
  ).map(review => ({
    githubNodeId: review.node_id,
    reviewerLogin: review.user?.login || null,
    state: review.state || 'UNKNOWN',
    authorAssociation: review.author_association || 'NONE',
    submittedAt: review.submitted_at,
    rawPayload: review,
  }));
}

export function summarizePullRequest(pr, details) {
  const reviewRows = buildReviewRows(details.reviews);
  const reviewRequestRows = buildReviewRequestRows(pr, details.timelineEvents);
  const timelineRows = buildTimelineEventRows(details.timelineEvents);

  return {
    reviewRows,
    reviewRequestRows,
    timelineRows,
    activeReviewCount: reviewRows.filter(review => ACTIVE_REVIEW_STATES.has(review.state)).length,
  };
}
