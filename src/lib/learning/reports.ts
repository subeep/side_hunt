import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { canSeeAudience } from '../authz';
import { audit } from '../audit';
import { notify } from '../notify';
import { rateLimit } from '../ratelimit';
import { fail, type Fail } from './result';
import { fieldErrors, reportInput } from './validation';

export const REPORT_RATE = { max: 5, windowSec: 3600 } as const;

/**
 * Report a PUBLISHED shared contribution. Any signed-in principal who can SEE the item (community audience rule) may
 * report. Stored with the reporter id for moderators only. The contributor is never told who reported, and the reporter
 * is never asked to identify another client. A non-visible / unknown / non-published id gets the same generic answer.
 */
export async function createReport(p: Principal | null, raw: unknown): Promise<{ ok: true; id: string; duplicate: boolean } | Fail> {
  if (!p) return fail('forbidden_actor', 'Sign in to report content.');
  const v = reportInput.safeParse(raw);
  if (!v.success) return fail('invalid', 'Please choose a reason.', fieldErrors(v.error));
  const [s] = await db.select({ id: schema.sharedContributions.id, status: schema.sharedContributions.status, title: schema.sharedContributions.title }).from(schema.sharedContributions).where(eq(schema.sharedContributions.id, v.data.sharedId));
  if (!s || s.status !== 'published' || !canSeeAudience(p, { kind: 'community' })) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.report.create', resourceType: 'shared_contribution', resourceId: v.data.sharedId, outcome: 'deny' });
    return fail('not_found', 'That item could not be found.');
  }
  const [open] = await db.select({ id: schema.reports.id }).from(schema.reports).where(and(eq(schema.reports.sharedId, s.id), eq(schema.reports.reporterId, p.userId), eq(schema.reports.status, 'open')));
  if (open) return { ok: true, id: open.id, duplicate: true };
  if (!(await rateLimit(`learn:report:${p.userId}`, REPORT_RATE.max, REPORT_RATE.windowSec))) return fail('rate_limited', 'You have sent several reports recently. Please try again later.');
  const [r] = await db.insert(schema.reports).values({ sharedId: s.id, reporterId: p.userId, reporterOrgId: p.activeOrgId, reason: v.data.reason, details: v.data.details }).returning({ id: schema.reports.id });
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'learning.report.create', resourceType: 'shared_contribution', resourceId: s.id, meta: { reportId: r.id, reason: v.data.reason } });
  const mods = await db.select({ u: schema.grants.userId }).from(schema.grants).where(and(eq(schema.grants.permission, 'learning_moderator'), isNull(schema.grants.revokedAt)));
  for (const m of mods) await notify({ userId: m.u, kind: 'moderation.report', title: 'New report on a shared observation', body: `"${s.title}" was reported (${v.data.reason}).`, link: `/moderation/reports/${r.id}`, dedupeKey: `report:${r.id}:${m.u}` });
  return { ok: true, id: r.id, duplicate: false };
}
