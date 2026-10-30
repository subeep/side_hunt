import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';

export type EmailStatus = 'queued' | 'sent' | 'failed';

/**
 * Persist to the outbox first (idempotent on dedupeKey), then hand off to a provider if configured.
 * Statuses are honest: 'queued' = stored only, 'sent' = accepted by the provider. We never claim "delivered".
 */
export async function sendEmail(input: { to: string; subject: string; body: string; purpose: string; dedupeKey: string }): Promise<EmailStatus> {
  const inserted = await db
    .insert(schema.emailOutbox)
    .values({ toEmail: input.to, subject: input.subject, body: input.body, purpose: input.purpose, dedupeKey: input.dedupeKey })
    .onConflictDoNothing()
    .returning();
  const row = inserted[0];
  if (!row) {
    const [existing] = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.dedupeKey, input.dedupeKey));
    return existing?.status ?? 'queued';
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return 'queued';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'azentio.ai <onboarding@resend.dev>', to: [input.to], subject: input.subject, text: input.body }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok) {
      await db.update(schema.emailOutbox).set({ status: 'sent', provider: 'resend', providerMessageId: json.id, sentAt: new Date() }).where(eq(schema.emailOutbox.id, row.id));
      return 'sent';
    }
    await db.update(schema.emailOutbox).set({ status: 'failed', provider: 'resend', error: json.message ?? `HTTP ${res.status}` }).where(eq(schema.emailOutbox.id, row.id));
    return 'failed';
  } catch (err) {
    await db.update(schema.emailOutbox).set({ status: 'failed', provider: 'resend', error: String(err) }).where(eq(schema.emailOutbox.id, row.id));
    return 'failed';
  }
}
