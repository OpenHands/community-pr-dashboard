import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { config, validateConfig } from '@/lib/config';
import { cache } from '@/lib/cache';
import { buildEmployeesSet, buildRepoAuthorRoleSets } from '@/lib/employees';
import { getOpenPRsGraphQL } from '@/lib/github';
import { transformPR, computeReviewStats } from '@/lib/compute';
import { PR } from '@/lib/types';
import { DEFAULT_REPOS } from '@/lib/defaults';

export async function GET(_request: NextRequest) {
  try {
    validateConfig();
    
    const cacheKey = `review-stats:${config.orgs.join(',')}`;
    
    const result = await cache.withCache(cacheKey, config.cache.ttlSeconds, async () => {
      // Build employees set
      const employeesSet = await buildEmployeesSet();
      
      // Get all PRs from configured repositories
      const allPrs: PR[] = [];
      
      const reposToFetch = config.repos.include.length > 0 ? config.repos.include : DEFAULT_REPOS;
      
      for (const repoPath of reposToFetch) {
        const [owner, repo] = repoPath.split('/');
        if (!owner || !repo) continue;
        
        try {
          const [rawPrs, repoAuthorRoleSets] = await Promise.all([
            getOpenPRsGraphQL(owner, repo),
            buildRepoAuthorRoleSets(owner, repo),
          ]);
          const transformedPrs = rawPrs.map(rawPr => {
            // Add repo info to raw PR for transformation
            rawPr.repository = { owner: { login: owner }, name: repo };
            return transformPR(rawPr, employeesSet, repoAuthorRoleSets);
          });
          
          allPrs.push(...transformedPrs);
        } catch (error) {
          console.error(`Failed to fetch PRs for ${repoPath}:`, error);
          // Continue with other repos
        }
      }
      
      return computeReviewStats(allPrs);
    });
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Review stats API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch review statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}