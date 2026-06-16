import { neon } from '@neondatabase/serverless';
import { config } from './config';
let sqlClient: ReturnType<typeof neon> | null = null;
export function getDatabaseUrl(): string {
  return config.database.url || process.env.NEON_DATABASE_URL || '';
}
export function isDatabaseConfigured(): boolean {
  return getDatabaseUrl().length > 0;
}
export function getSql(): ReturnType<typeof neon> {
  if (sqlClient) {
    return sqlClient;
  }
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL is required for Neon persistence');
  }
  sqlClient = neon(databaseUrl);
  return sqlClient;
}
