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
  getOrgMembersGraphQL: jest.fn(),
  getOrgMembersREST: jest.fn(),
  getRepoCollaboratorsREST: jest.fn(),
}));

import { readFileSync } from 'fs';
import { getRepoCollaboratorsREST } from '@/lib/github';
import { buildMaintainersSet, buildRepoAuthorRoleSets } from '@/lib/employees';

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockGetRepoCollaboratorsREST = getRepoCollaboratorsREST as jest.MockedFunction<typeof getRepoCollaboratorsREST>;

beforeEach(() => {
  jest.clearAllMocks();
  mockReadFileSync.mockImplementation((path: Parameters<typeof readFileSync>[0]) => {
    if (String(path).endsWith('maintainers.json')) {
      return JSON.stringify({
        allowlist: ['enyst', 'rbren'],
        denylist: [],
      }) as ReturnType<typeof readFileSync>;
    }

    throw new Error(`Unexpected file read: ${String(path)}`);
  });
  mockGetRepoCollaboratorsREST.mockResolvedValue(['enyst', 'write-user']);
});

describe('maintainer role sources', () => {
  it('builds the maintainer set from config/maintainers.json', async () => {
    const maintainers = await buildMaintainersSet();

    expect(maintainers).toEqual(new Set(['enyst', 'rbren']));
  });

  it('keeps explicit maintainers out of the collaborator bucket', async () => {
    const roleSets = await buildRepoAuthorRoleSets('OpenHands', 'OpenHands');

    expect(roleSets.maintainers).toEqual(new Set(['enyst', 'rbren']));
    expect(roleSets.collaborators).toEqual(new Set(['write-user']));
  });
});
