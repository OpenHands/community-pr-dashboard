import { NextRequest } from 'next/server';
import { getOpenPRsGraphQL } from '@/lib/github';

export async function GET(_request: NextRequest) {
  try {
    console.log('Testing GitHub API...');
    const prs = await getOpenPRsGraphQL('All-Hands-AI', 'OpenHands');
    console.log(`Found ${prs.length} PRs`);
    
    return Response.json({
      success: true,
      prCount: prs.length,
      firstPR: prs[0] ? {
        number: prs[0].number,
        title: prs[0].title,
        author: prs[0].author?.login,
      } : null,
    });
  } catch (error) {
    console.error('GitHub API test failed:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}