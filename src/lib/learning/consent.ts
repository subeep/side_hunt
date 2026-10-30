import { asc, eq } from 'drizzle-orm';
import { db, schema, type Db } from '@/db';
import { CONSENT_PURPOSES, type ConsentPurpose } from '@/db/schema/learning';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { getOwnContribution } from './access';
import { fail, type Fail } from './result';

export type ConsentState = Record<ConsentPurpose, { granted: boolean; at: Date | null; version: number | null }>;
type Row = typeof schema.contributionConsents.$inferSelect;

/** Append-only history, oldest first. */
export async function consentHistory(contributionId: string, d: Db = db): Promise<Row[]> {
  return d.select().from(schema.contributionConsents).where(eq(schema.contributionConsents.contributionId, contributionId)).orderBy(asc(schema.contributionConsents.seq));
}

/** Current state = the LATEST row per purpose. No row means not granted (every purpose defaults to OFF). */
export function stateFromHistory(rows: Row[]): ConsentState {
  const st = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, { granted: false, at: null, version: null }])) as ConsentState;
  for (const r of rows) st[r.purpose] = { granted: r.granted, at: r.at, version: r.contributionVersion };
  return st;
}
export async function currentConsents(contributionId: string, d: Db = db): Promise<ConsentState> {
  return stateFromHistory(await consentHistory(contributionId, d));
}

/**
 * Append consent rows. Only appends where the value differs from the latest row (or none exists yet), so the history is
 * a meaningful audit trail. Rows are never updated or deleted. Membership of an organisation is NOT consent.
 */
export async function recordConsents(d: Db, a: { contributionId: string; userId: string; version: number; desired: Partial<Record<ConsentPurpose, boolean>>; note?: string }) {
  const rows = await consentHistory(a.contributionId, d);
  const cur = stateFromHistory(rows);
  const had = new Set(rows.map((r) => r.purpose));
  const inserts = CONSENT_PURPOSES.filter((p) => a.desired[p] !== undefined && (!had.has(p) || cur[p].granted !== a.desired[p])).map((p) => ({
    contributionId: a.contributionId,
    userId: a.userId,
    purpose: p,
    granted: a.desired[p]!,
    contributionVersion: a.version,
    note: a.note,
  }));
  if (inserts.length) await d.insert(schema.contributionConsents).values(inserts);
  return inserts.length;
}

/**
 * The author changes an OPTIONAL consent after submission. training can be toggled any time (it has no effect in this
 * release). attribution can always be REVOKED (the credit line is removed from the live shared copy immediately) but can
 * only be GRANTED before moderation finishes, because granting it later would widen disclosure without review.
 */
export async function setOptionalConsent(p: Principal, contributionId: string, purpose: 'attribution' | 'training', granted: boolean): Promise<{ ok: true } | Fail> {
  const row = await getOwnContribution(p, contributionId, 'learning.consent.write');
  if (!row) return fail('not_found', 'Not found');
  const cur = (await currentConsents(contributionId))[purpose];
  if (cur.granted === granted) return { ok: true };
  if (purpose === 'attribution' && granted && !['draft', 'clarification_requested'].includes(row.status))
    return fail('precondition', 'Attribution can only be added while the contribution is a draft or being amended, because adding it later would widen disclosure without review.');
  if (purpose === 'attribution' && granted && row.sharingChoice !== 'community') return fail('precondition', 'Attribution only applies to community sharing.');
  await recordConsents(db, { contributionId, userId: p.userId, version: row.version, desired: { [purpose]: granted }, note: granted ? 'granted by author' : 'withdrawn by author' });
  if (purpose === 'attribution' && !granted) {
    await db.update(schema.sharedContributions).set({ attributionLabel: null }).where(eq(schema.sharedContributions.contributionId, contributionId));
    await db.update(schema.reviewDrafts).set({ includeAttribution: false }).where(eq(schema.reviewDrafts.contributionId, contributionId));
  }
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: `learning.consent.${purpose}.${granted ? 'grant' : 'withdraw'}`, resourceType: 'contribution', resourceId: contributionId, orgId: row.orgId });
  return { ok: true };
}
