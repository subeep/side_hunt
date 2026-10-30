import * as schema from './schema';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * One drizzle handle for the whole app.
 *  - DATABASE_URL set  -> Postgres (Neon on Vercel). Schema is applied once with `npm run db:push`.
 *  - otherwise (local) -> embedded PGlite in ./.data (or in-memory when PGLITE_DIR=memory://). Schema + demo seed are applied automatically.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __azDb?: Db; __azDbReady?: Promise<void> };

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, max: 3, ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false } });
    return drizzlePg(pool, { schema }) as unknown as Db;
  }
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. Add a Postgres database (e.g. Neon via the Vercel Marketplace) and run `npm run db:push && npm run db:seed`.');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  // `next build` loads route modules in several workers: never share an on-disk PGlite dir with them.
  const building = process.env.NEXT_PHASE === 'phase-production-build';
  const dir = building ? 'memory://' : (process.env.PGLITE_DIR ?? '.data/pglite');
  if (!dir.startsWith('memory://')) (await import('node:fs')).mkdirSync(dir, { recursive: true });
  const client = dir.startsWith('memory://') ? new PGlite() : new PGlite(dir);
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  const existing = await client.query<{ n: number }>(
    `select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='organisations'`,
  );
  if (!existing.rows[0]?.n) {
    await applySchema(db);
    if (process.env.DEMO_MODE !== '0' && !building) {
      const { seedAll } = await import('./seed');
      await seedAll(db);
    }
  }
  return db;
}

/** Create every table from the drizzle schema (fresh database only). */
export async function applySchema(db: Db) {
  const kit = await import('drizzle-kit/api');
  const empty = kit.generateDrizzleJson({});
  const next = kit.generateDrizzleJson(schema as Record<string, unknown>);
  const statements = await kit.generateMigration(empty, next);
  for (const stmt of statements) await db.execute(sql.raw(stmt));
}

if (!g.__azDbReady) {
  g.__azDbReady = init().then((d) => {
    g.__azDb = d;
  });
}
await g.__azDbReady;

export const db: Db = g.__azDb as Db;
export { schema };
