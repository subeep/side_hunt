import { sql } from 'drizzle-orm';
import { applySchema, db } from '../src/db';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Local dev uses embedded PGlite and needs no push.');
  process.exit(1);
}
const res = await db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'organisations'`);
const exists = Number((res.rows[0] as { n: number }).n) > 0;
if (exists) {
  console.log('Schema already exists: nothing to do. To rebuild from scratch run `npm run db:reset` (drops everything), then db:push and db:seed.');
} else {
  await applySchema(db);
  console.log('Schema created.');
}
process.exit(0);
