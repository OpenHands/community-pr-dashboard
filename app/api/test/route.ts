import { NextRequest, NextResponse } from 'next/server';
import { validateConfig } from '@/lib/config';
import { graphql } from '@/lib/github';

export async function GET(_request: NextRequest) {
  try {
    // Validate configuration
    validateConfig();
    
    // Test basic GraphQL query
    const result = await graphql<{ viewer: { login: string } }>(`
      query {
        viewer { login }
        rateLimit { remaining resetAt }
      }
    `);
    
    return NextResponse.json({
      ok: true,
      viewer: result.viewer.login,
      rateLimit: result.rateLimit,
    });
  } catch (error) {
    console.error('API test failed:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { 
          ok: false, 
          error: error.message,
          type: error.constructor.name,
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { ok: false, error: 'Unknown error occurred' },
      { status: 500 }
    );
  }
}