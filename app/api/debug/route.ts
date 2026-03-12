import { NextRequest } from 'next/server';
import { config } from '@/lib/config';

export async function GET(_request: NextRequest) {
  try {
    const hasToken = !!process.env.GITHUB_TOKEN;
    const tokenLength = process.env.GITHUB_TOKEN?.length || 0;
    
    return Response.json({
      hasToken,
      tokenLength,
      config: {
        orgs: config.orgs,
        repos: config.repos,
      },
      env: {
        NODE_ENV: process.env.NODE_ENV,
        GITHUB_TOKEN_SET: !!process.env.GITHUB_TOKEN,
      }
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      hasToken: !!process.env.GITHUB_TOKEN,
    }, { status: 500 });
  }
}