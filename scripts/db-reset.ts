import { rmSync } from 'node:fs';

if (process.env.DATABASE_URL) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false } });
  await pool.query('drop schema public cascade; create schema public;');
  await pool.end();
  console.log('dropped public schema; now run: npm run db:push && npm run db:seed');
} else {
  rmSync('.data/pglite', { recursive: true, force: true });
  console.log('removed .data/pglite; it will be recreated and seeded on next start');
}
