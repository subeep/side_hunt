import { describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resolveInvite } from '@/lib/client/invite';

// Security review (client area): /invite/[token] is reachable by anonymous visitors and writes one audit row per
// invalid view with no throttle, so an unauthenticated client can append unbounded rows to the audit log.
describe('anonymous /invite/<random> views', () => {
  it('must be throttled instead of writing one audit row per request', async () => {
    const before = (await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'invite.view'), isNull(schema.auditEvents.actorId)))).length;
    for (let i = 0; i < 150; i++) await resolveInvite(`random-token-${i}-xxxxxxxxxxxx`, null);
    const after = (await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'invite.view'), isNull(schema.auditEvents.actorId)))).length;
    expect(after - before).toBeLessThan(150); // FAILS today: exactly 150 rows written by an unauthenticated caller
  });
});
