import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db, schema } from '@/db';
import { minCohortOrgs } from '../env';

/**
 * AGGREGATION SAFEGUARDS.
 *
 * "Evidence" is counted in DISTINCT contributing organisations (count(distinct shared_contributions.org_id)); repeated
 * posts from one organisation are never independent evidence. Statistics (counts, trends, breakdowns) are released only
 * when the cohort has at least minCohortOrgs() organisations; below that the number is WITHHELD with an explanation,
 * while the individual approved items stay readable.
 *
 * IMPORTANT: a minimum cohort size alone is NOT a privacy guarantee. Rare attributes, small remaining cohorts and
 * differencing (subtracting two overlapping results) can still isolate one contributor. We therefore also:
 *  - keep a per-user LEDGER of released statistics and suppress a new statistic that differs from an earlier one by
 *    fewer than the threshold of organisations (symmetric difference of the item sets) within a time window;
 *  - suppress sensitive breakdown cells (industry x region, ...) below the threshold, plus a complementary cell so the
 *    suppressed cell cannot be recovered by subtraction from a total.
 * These controls reduce, but do not eliminate, re-identification risk. Production use needs a documented policy, a
 * reviewed threshold, rate limits and (ideally) formal methods such as differential privacy. Colluding users can still
 * combine their ledgers; this is a documented limitation.
 */
export const LEDGER_WINDOW_MS = 24 * 3600_000;
export const LEDGER_MAX_ROWS = 60;
export const PRIVACY_NOTE =
  'Counts reflect distinct organisations, not posting volume. Popularity is not market prevalence or proof of causation, and a minimum cohort size alone is not a privacy guarantee.';

export interface StatDisplay {
  suppressed: boolean;
  orgs: number | null;
  items: number | null;
  reason: string | null;
  threshold: number;
}

const s = schema.sharedContributions;
const belowReason = (t: number) => `Fewer than ${t} organisations; count withheld to protect contributors.`;
const diffReason = (t: number) =>
  `Withheld: this figure differs from one you were shown earlier by fewer than ${t} organisations, so showing it could reveal a single contributor.`;

/** Distinct contributing organisations among the PUBLISHED items in `ids` (internal use only; never serialised raw). */
export async function countDistinctOrgs(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(distinct ${s.orgId})::int` })
    .from(s)
    .where(and(inArray(s.id, [...new Set(ids)]), eq(s.status, 'published')));
  return r?.n ?? 0;
}

async function orgMap(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: s.id, orgId: s.orgId }).from(s).where(inArray(s.id, ids));
  return new Map(rows.map((r) => [r.id, r.orgId]));
}

const hashSet = (ids: string[]) => createHash('sha256').update([...ids].sort().join('|')).digest('hex');

/**
 * Release (or withhold) the headline statistic for a set of items for one user. Applies the cohort threshold and the
 * differencing guard, and records released statistics in the ledger.
 */
export async function releaseStat(userId: string | null, rawIds: string[]): Promise<StatDisplay> {
  const t = minCohortOrgs();
  const ids = [...new Set(rawIds)];
  const published = ids.length
    ? (await db.select({ id: s.id }).from(s).where(and(inArray(s.id, ids), eq(s.status, 'published')))).map((r) => r.id)
    : [];
  const orgs = await countDistinctOrgs(published);
  if (published.length === 0) return { suppressed: false, orgs: 0, items: 0, reason: null, threshold: t };
  if (orgs < t) return { suppressed: true, orgs: null, items: null, reason: belowReason(t), threshold: t };

  const setHash = hashSet(published);
  if (userId) {
    const since = new Date(Date.now() - LEDGER_WINDOW_MS);
    const prior = await db
      .select()
      .from(schema.statLedger)
      .where(and(eq(schema.statLedger.userId, userId), sql`${schema.statLedger.createdAt} >= ${since}`))
      .orderBy(desc(schema.statLedger.createdAt))
      .limit(LEDGER_MAX_ROWS);
    const cur = new Set(published);
    for (const row of prior) {
      if (row.setHash === setHash) continue;
      const prev = new Set(row.itemIds);
      const diff = [...cur].filter((x) => !prev.has(x)).concat([...prev].filter((x) => !cur.has(x)));
      const orgOf = await orgMap(diff);
      const diffOrgs = new Set(diff.map((id) => orgOf.get(id) ?? `unknown:${id}`)).size;
      if (diffOrgs > 0 && diffOrgs < t) return { suppressed: true, orgs: null, items: null, reason: diffReason(t), threshold: t };
    }
    const same = prior.find((r) => r.setHash === setHash);
    if (same) await db.update(schema.statLedger).set({ createdAt: new Date() }).where(eq(schema.statLedger.id, same.id));
    else await db.insert(schema.statLedger).values({ userId, setHash, itemIds: published, orgs, items: published.length });
    const old = await db.select({ id: schema.statLedger.id }).from(schema.statLedger).where(eq(schema.statLedger.userId, userId)).orderBy(desc(schema.statLedger.createdAt)).offset(LEDGER_MAX_ROWS);
    if (old.length) await db.delete(schema.statLedger).where(inArray(schema.statLedger.id, old.map((o) => o.id)));
    await db.delete(schema.statLedger).where(and(eq(schema.statLedger.userId, userId), lt(schema.statLedger.createdAt, since)));
  }
  return { suppressed: false, orgs, items: published.length, reason: null, threshold: t };
}

export type BreakdownDim = 'industry' | 'region' | 'offering' | 'period' | 'industry_region';
export interface Breakdown {
  rows: { label: string; orgs: number; items: number }[];
  withheldCells: number;
  note: string;
}

/** Sensitive breakdowns: a cell below the cohort threshold is withheld (label included) and one neighbour is withheld too. */
export async function breakdown(ids: string[], dim: BreakdownDim): Promise<Breakdown> {
  const t = minCohortOrgs();
  const rows = ids.length
    ? await db.select({ orgId: s.orgId, industry: s.industry, region: s.region, offering: s.offeringSlug, period: s.periodLabel }).from(s).where(and(inArray(s.id, [...new Set(ids)]), eq(s.status, 'published')))
    : [];
  const label = (r: (typeof rows)[number]) =>
    dim === 'industry_region' ? `${r.industry ?? 'Unspecified'} × ${r.region ?? 'Unspecified'}` : (r[dim === 'industry' ? 'industry' : dim === 'region' ? 'region' : dim === 'offering' ? 'offering' : 'period'] ?? 'Unspecified');
  const cells = new Map<string, { orgs: Set<string>; items: number }>();
  for (const r of rows) {
    const k = label(r);
    const c = cells.get(k) ?? { orgs: new Set<string>(), items: 0 };
    c.orgs.add(r.orgId);
    c.items++;
    cells.set(k, c);
  }
  let released = [...cells].filter(([, c]) => c.orgs.size >= t).map(([label, c]) => ({ label, orgs: c.orgs.size, items: c.items }));
  let withheld = cells.size - released.length;
  if (withheld === 1 && released.length > 0) {
    // complementary suppression: with one hidden cell, (total - visible cells) would reveal it.
    released.sort((a, b) => a.items - b.items || a.label.localeCompare(b.label));
    released = released.slice(1);
    withheld++;
  }
  released.sort((a, b) => b.orgs - a.orgs || a.label.localeCompare(b.label));
  return {
    rows: released,
    withheldCells: withheld,
    note: withheld ? `${withheld} group${withheld > 1 ? 's' : ''} withheld: fewer than ${t} organisations (or hidden to prevent recovery by subtraction).` : '',
  };
}

export const smallSampleWarning = (stat: StatDisplay) =>
  stat.suppressed ? `Small sample: fewer than ${stat.threshold} organisations contributed, so this is an early signal, not a trend.` : null;
