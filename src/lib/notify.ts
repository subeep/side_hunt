import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { sendEmail } from './email';

/**
 * Persisted in-app notification (P0). Idempotent on dedupeKey: calling twice never creates a second row.
 * Pass email:true to also queue an email (P1); the notification records the honest email status.
 */
export async function notify(n: { userId: string; kind: string; title: string; body?: string; link?: string; dedupeKey: string; email?: boolean }) {
  const [row] = await db
    .insert(schema.notifications)
    .values({ userId: n.userId, kind: n.kind, title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey, emailStatus: n.email ? 'queued' : 'none' })
    .onConflictDoNothing()
    .returning();
  if (row && n.email) {
    const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, n.userId));
    if (u) {
      const status = await sendEmail({ to: u.email, subject: n.title, body: `${n.body ?? ''}\n\n${n.link ?? ''}`.trim(), purpose: n.kind, dedupeKey: `ntf:${n.dedupeKey}` });
      await db.update(schema.notifications).set({ emailStatus: status }).where(eq(schema.notifications.id, row.id));
    }
  }
  return row ?? null;
}
