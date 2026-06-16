import { Pool } from '@neondatabase/serverless';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL or NEON_DATABASE_URL is required.');
  process.exit(1);
}

const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file]
    );

    if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
      console.log(`Skipping ${file}; already applied.`);
      continue;
    }

    const migrationSql = await readFile(path.join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);

    await client.query('BEGIN');
    try {
      await client.query(migrationSql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`Applied ${file}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log('Migrations complete.');
} finally {
  client.release();
  await pool.end();
}
