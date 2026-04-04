import { getAuthorType } from '@/lib/employees';

describe('getAuthorType', () => {
  const employeesSet = new Set(['employee-maintainer', 'employee-only']);
  const maintainersSet = new Set(['employee-maintainer', 'external-maintainer']);

  it('prefers maintainer over employee when a login is both', () => {
    expect(getAuthorType('employee-maintainer', employeesSet, 'MEMBER', maintainersSet)).toBe('maintainer');
  });

  it('keeps employees as employees when they are not repo maintainers', () => {
    expect(getAuthorType('employee-only', employeesSet, 'MEMBER', maintainersSet)).toBe('employee');
  });

  it('classifies external collaborators as maintainers', () => {
    expect(getAuthorType('external-maintainer', employeesSet, 'COLLABORATOR', maintainersSet)).toBe('maintainer');
  });

  it('classifies outside contributors as community', () => {
    expect(getAuthorType('community-user', employeesSet, 'CONTRIBUTOR', maintainersSet)).toBe('community');
  });
});
