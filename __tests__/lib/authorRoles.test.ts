jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

jest.mock('@/lib/cache', () => ({
  cache: {
    withCache: jest.fn((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  },
}));

jest.mock('@/lib/config', () => ({
  config: {
    cache: { ttlSeconds: 60 },
    orgs: ['test-org'],
  },
}));

jest.mock('@/lib/github', () => ({
  RateLimitError: class RateLimitError extends Error {
    constructor(resetAt: string) {
      super('GitHub API rate limit exceeded');
      this.name = 'RateLimitError';
      this.resetAt = resetAt;
    }
    resetAt: string;
  },
  getOrgMembersGraphQL: jest.fn(),
  getOrgMembersREST: jest.fn(),
  getRepoCollaboratorsREST: jest.fn(),
}));

import { readFileSync } from 'fs';
import { getOrgMembersGraphQL, getRepoCollaboratorsREST } from '@/lib/github';
import { buildEmployeesSet, buildMaintainersSet, buildRepoAuthorRoleSets } from '@/lib/employees';

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockGetOrgMembersGraphQL = getOrgMembersGraphQL as jest.MockedFunction<typeof getOrgMembersGraphQL>;
const mockGetRepoCollaboratorsREST = getRepoCollaboratorsREST as jest.MockedFunction<typeof getRepoCollaboratorsREST>;

beforeEach(() => {
  jest.clearAllMocks();

  mockReadFileSync.mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
    const pathString = String(path);

    if (pathString.endsWith('employees.json')) {
      return JSON.stringify({
        allowlist: ['added-employee'],
        denylist: ['removed-employee'],
      }) as ReturnType<typeof readFileSync>;
    }

    if (pathString.endsWith('maintainers.json')) {
      return JSON.stringify({
        allowlist: ['enyst', 'rbren'],
        denylist: ['rbren'],
      }) as ReturnType<typeof readFileSync>;
    }

    throw new Error(`Unexpected file read: ${pathString}`);
  });

  mockGetOrgMembersGraphQL.mockResolvedValue(['org-employee', 'removed-employee']);
  mockGetRepoCollaboratorsREST.mockResolvedValue(['enyst', 'rbren', 'write-user']);
});

describe('override-backed author role builders', () => {
  it('applies employee allowlist and denylist overrides', async () => {
    const employees = await buildEmployeesSet();

    expect(employees).toEqual(new Set(['org-employee', 'added-employee']));
  });

  it('applies maintainer allowlist and denylist overrides', async () => {
    const maintainers = await buildMaintainersSet();

    expect(maintainers).toEqual(new Set(['enyst']));
  });

  it('keeps explicit maintainers out of the collaborator bucket', async () => {
    const roleSets = await buildRepoAuthorRoleSets('OpenHands', 'OpenHands');

    expect(roleSets.maintainers).toEqual(new Set(['enyst']));
    expect(roleSets.collaborators).toEqual(new Set(['rbren', 'write-user']));
  });

  it('falls back to explicit maintainers when collaborator lookup fails', async () => {
    mockGetRepoCollaboratorsREST.mockRejectedValueOnce(new Error('collaborators unavailable'));

    const roleSets = await buildRepoAuthorRoleSets('OpenHands', 'OpenHands');

    expect(roleSets.maintainers).toEqual(new Set(['enyst']));
    expect(roleSets.collaborators).toEqual(new Set());
  });

});
