import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { applySchema, db } from '@/db';
import { seedAll } from '@/db/seed';
import { safeEqual } from '@/lib/crypto';

export const maxDuration = 300;

/**
 * One-time bootstrap for hosts that cannot reach the database from a laptop.
 * Disabled unless SETUP_TOKEN is set (>= 16 chars). POST with `Authorization: Bearer <SETUP_TOKEN>`.
 * Creates the schema if it does not exist and (re)runs the idempotent seed. Remove SETUP_TOKEN afterwards.
 */
export async function POST(req: Request) {
  const token = process.env.SETUP_TOKEN;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token.length < 16 || !safeEqual(given, token)) return new NextResponse('Not found', { status: 404 });
  try {
  const res = (await db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'organisations'`)) as unknown as { rows: { n: number }[] };
  const existed = Number(res.rows[0]?.n) > 0;
  if (!existed) await applySchema(db);
  await seedAll(db);
  return NextResponse.json({ ok: true, schemaCreated: !existed, seeded: true });
  } catch (err) {
    // Only reachable with a valid setup token, so returning the message is safe and makes setup debuggable.
    const e = err as Error & { cause?: Error };
    return NextResponse.json({ ok: false, error: e.message, cause: e.cause?.message, hasDatabaseUrl: !!process.env.DATABASE_URL }, { status: 500 });
  }
}
