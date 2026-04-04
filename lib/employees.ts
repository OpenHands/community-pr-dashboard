import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from './config';
import { cache } from './cache';
import { getOrgMembersGraphQL, getOrgMembersREST, getRepoMaintainersREST } from './github';
import { EmployeeOverrides } from './types';

function loadEmployeeOverrides(): EmployeeOverrides {
  try {
    const filePath = join(process.cwd(), 'config', 'employees.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch {
    // If file doesn't exist or is invalid, return empty overrides
    return { allowlist: [], denylist: [] };
  }
}

export async function buildEmployeesSet(): Promise<Set<string>> {
  const cacheKey = `employees:${config.orgs.join(',')}`;
  
  return cache.withCache(cacheKey, config.cache.ttlSeconds, async () => {
    const employees = new Set<string>();
    
    // Fetch org members for each organization
    for (const org of config.orgs) {
      try {
        // Try GraphQL first, fallback to REST
        let members: string[];
        try {
          members = await getOrgMembersGraphQL(org);
        } catch (error) {
          console.warn(`GraphQL failed for org ${org}, falling back to REST:`, error);
          members = await getOrgMembersREST(org);
        }
        
        members.forEach(member => employees.add(member));
      } catch (error) {
        console.error(`Failed to fetch members for org ${org}:`, error);
        // Continue with other orgs
      }
    }
    
    // Apply overrides from config file
    const overrides = loadEmployeeOverrides();
    
    // Add allowlist members
    overrides.allowlist.forEach(login => employees.add(login));
    
    // Remove denylist members
    overrides.denylist.forEach(login => employees.delete(login));
    
    return employees;
  });
}

export async function buildRepoMaintainersSet(owner: string, repo: string): Promise<Set<string>> {
  const cacheKey = `maintainers:${owner}/${repo}`;

  return cache.withCache(cacheKey, config.cache.ttlSeconds, async () => {
    try {
      return new Set(await getRepoMaintainersREST(owner, repo));
    } catch (error) {
      console.error(`Failed to fetch maintainers for ${owner}/${repo}:`, error);
      return new Set<string>();
    }
  });
}

export function isEmployee(login: string, employeesSet: Set<string>): boolean {
  return employeesSet.has(login);
}

export function isCommunityPR(authorLogin: string, employeesSet: Set<string>, authorAssociation?: string): boolean {
  // Exclude bots (including Dependabot - note: dependabot shows as "dependabot", not "dependabot[bot]")
  const isBot = authorLogin.includes('[bot]') || authorLogin.endsWith('-bot') || authorLogin.endsWith('_bot') || authorLogin === 'dependabot';
  
  // Exclude employees
  const isEmployeeUser = isEmployee(authorLogin, employeesSet);
  
  // Exclude repository maintainers/collaborators (these have write access and are not community)
  // COLLABORATOR = has write access, MEMBER = org member, OWNER = repo owner
  const hasWriteAccess = authorAssociation === 'COLLABORATOR' || authorAssociation === 'MEMBER' || authorAssociation === 'OWNER';
  
  // Community PRs are from external contributors without write access
  // This includes: CONTRIBUTOR, FIRST_TIME_CONTRIBUTOR, FIRST_TIMER, NONE
  return !isBot && !isEmployeeUser && !hasWriteAccess;
}

export type AuthorType = 'employee' | 'maintainer' | 'community' | 'bot';

export function getAuthorType(
  authorLogin: string,
  employeesSet: Set<string>,
  authorAssociation?: string,
  maintainersSet: Set<string> = new Set()
): AuthorType {
  // Check for bots first (including Dependabot)
  const isBot = authorLogin.includes('[bot]') || authorLogin.endsWith('-bot') || authorLogin.endsWith('_bot') || authorLogin === 'dependabot';
  if (isBot) return 'bot';

  // Prefer explicit repo maintainer membership so employee-maintainers show as maintainers.
  if (maintainersSet.has(authorLogin)) return 'maintainer';
  
  // Check for employees (org members)
  const isEmployeeUser = isEmployee(authorLogin, employeesSet);
  if (isEmployeeUser) return 'employee';
  
  // Check for maintainers (users with write access)
  const hasWriteAccess = authorAssociation === 'COLLABORATOR' || authorAssociation === 'MEMBER' || authorAssociation === 'OWNER';
  if (hasWriteAccess) return 'maintainer';
  
  // Everyone else is community
  return 'community';
}

export async function getEmployeeStats(): Promise<{
  totalEmployees: number;
  orgs: string[];
  sampleEmployees: string[];
}> {
  const employeesSet = await buildEmployeesSet();
  const employees = Array.from(employeesSet);
  
  return {
    totalEmployees: employees.length,
    orgs: config.orgs,
    sampleEmployees: employees.slice(0, 10), // First 10 for debugging
  };
}