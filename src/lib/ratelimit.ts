import { sql } from 'drizzle-orm';
import { db, schema } from '@/db';

/** Fixed-window limiter backed by the DB (works across serverless instances). Returns true if allowed. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.windowStart} < ${new Date(now.getTime() - windowSec * 1000)} then 1 else ${schema.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${schema.rateLimits.windowStart} < ${new Date(now.getTime() - windowSec * 1000)} then ${now} else ${schema.rateLimits.windowStart} end`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return (row?.count ?? 1) <= max;
}
