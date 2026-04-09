import { getAuthorType } from '@/lib/employees';

describe('getAuthorType', () => {
  const employeesSet = new Set(['employee-maintainer', 'employee-only']);
  const repoAuthorRoleSets = {
    maintainers: new Set(['employee-maintainer', 'non-org-maintainer']),
    collaborators: new Set(['write-collaborator']),
  };

  it('prefers maintainer over employee when a login is both', () => {
    expect(getAuthorType('employee-maintainer', employeesSet, 'MEMBER', repoAuthorRoleSets)).toBe('maintainer');
  });

  it('keeps employees as employees when they are not repo maintainers', () => {
    expect(getAuthorType('employee-only', employeesSet, 'MEMBER', repoAuthorRoleSets)).toBe('employee');
  });

  it('classifies non-org maintainers from repo permissions', () => {
    expect(getAuthorType('non-org-maintainer', employeesSet, 'COLLABORATOR', repoAuthorRoleSets)).toBe('maintainer');
  });

  it('classifies write-only collaborators separately from maintainers', () => {
    expect(getAuthorType('write-collaborator', employeesSet, 'COLLABORATOR', repoAuthorRoleSets)).toBe('collaborator');
  });

  it('classifies bot accounts as bot', () => {
    expect(getAuthorType('dependabot[bot]', employeesSet, 'NONE', repoAuthorRoleSets)).toBe('bot');
  });

  it('uses MEMBER association as a fallback employee signal', () => {
    expect(getAuthorType('member-only', new Set(), 'MEMBER', repoAuthorRoleSets)).toBe('employee');
  });

  it('classifies outside contributors as community', () => {
    expect(getAuthorType('community-user', employeesSet, 'CONTRIBUTOR', repoAuthorRoleSets)).toBe('community');
  });
});
