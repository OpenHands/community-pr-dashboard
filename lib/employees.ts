import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from './config';
import { cache } from './cache';
import { RateLimitError, getOrgMembersGraphQL, getOrgMembersREST, getRepoCollaboratorsREST } from './github';
import { EmployeeOverrides, LoginOverrides, MaintainerOverrides, RepoAuthorRoleSets } from './types';

function normalizeOverrides(data: unknown): LoginOverrides {
  if (!data || typeof data !== 'object') {
    return { allowlist: [], denylist: [] };
  }

  const record = data as Partial<LoginOverrides>;

  return {
    allowlist: Array.isArray(record.allowlist) ? record.allowlist.filter((value): value is string => typeof value === 'string') : [],
    denylist: Array.isArray(record.denylist) ? record.denylist.filter((value): value is string => typeof value === 'string') : [],
  };
}

function loadOverrides(fileName: string): LoginOverrides {
  try {
    const filePath = join(process.cwd(), 'config', fileName);
    const fileContent = readFileSync(filePath, 'utf-8');
    return normalizeOverrides(JSON.parse(fileContent));
  } catch {
    return { allowlist: [], denylist: [] };
  }
}

function loadEmployeeOverrides(): EmployeeOverrides {
  return loadOverrides('employees.json');
}

function loadMaintainerOverrides(): MaintainerOverrides {
  return loadOverrides('maintainers.json');
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

export async function buildMaintainersSet(): Promise<Set<string>> {
  const cacheKey = 'maintainers';

  return cache.withCache(cacheKey, config.cache.ttlSeconds, async () => {
    const maintainers = new Set<string>();
    const overrides = loadMaintainerOverrides();

    overrides.allowlist.forEach(login => maintainers.add(login));
    overrides.denylist.forEach(login => maintainers.delete(login));

    return maintainers;
  });
}

export async function buildRepoAuthorRoleSets(owner: string, repo: string): Promise<RepoAuthorRoleSets> {
  const cacheKey = `repo-author-roles:${owner}/${repo}`;

  return cache.withCache(cacheKey, config.cache.ttlSeconds, async () => {
    const maintainersSet = await buildMaintainersSet();
    let collaborators: string[] = [];

    try {
      collaborators = await getRepoCollaboratorsREST(owner, repo);
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      console.error(`Failed to fetch repo collaborators for ${owner}/${repo}:`, error);
    }

    return {
      maintainers: new Set(maintainersSet),
      collaborators: new Set(collaborators.filter(login => !maintainersSet.has(login))),
    };
  });
}

export function isEmployee(login: string, employeesSet: Set<string>): boolean {
  return employeesSet.has(login);
}

export type AuthorType = 'employee' | 'maintainer' | 'collaborator' | 'community' | 'bot';

function isBotLogin(login: string): boolean {
  return login.includes('[bot]') || login.endsWith('-bot') || login.endsWith('_bot') || login === 'dependabot';
}

export function isOrgMemberAssociation(authorAssociation?: string): boolean {
  return authorAssociation === 'MEMBER' || authorAssociation === 'OWNER';
}

export function getAuthorType(
  authorLogin: string,
  employeesSet: Set<string>,
  authorAssociation?: string,
  repoAuthorRoleSets: RepoAuthorRoleSets = { maintainers: new Set(), collaborators: new Set() }
): AuthorType {
  if (isBotLogin(authorLogin)) return 'bot';

  if (repoAuthorRoleSets.maintainers.has(authorLogin)) return 'maintainer';

  const isEmployeeUser = isEmployee(authorLogin, employeesSet) || isOrgMemberAssociation(authorAssociation);
  if (isEmployeeUser) return 'employee';

  if (repoAuthorRoleSets.collaborators.has(authorLogin) || authorAssociation === 'COLLABORATOR') {
    return 'collaborator';
  }

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