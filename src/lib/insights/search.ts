import { and, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { sharedPublicColumns, type SharedPublic } from '../learning/columns';
import { fuzzyMatch, escapeLike, idfOf, termFreq, tokenise } from './text';
import { releaseStat, type StatDisplay } from './aggregation';
import { canSeeFeed, getVisibleSharedMany } from './visibility';

const s = schema.sharedContributions;

export const FILTER_KEYS = ['offering', 'industry', 'region', 'period', 'topic'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>>;
export const CACHE_SCOPE = 'community:v1';
export const CACHE_TTL_MS = 10 * 60_000;
const MAX_IDS = 300;

/** Untrusted query params -> a clean, whitelisted filter object. */
export function normaliseFilters(raw: Record<string, unknown> | null | undefined): Filters {
  const out: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = raw?.[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 80);
  }
  return out;
}
export const normaliseQuery = (q: unknown) => (typeof q === 'string' ? q.trim().replace(/\s+/g, ' ').slice(0, 200) : '');

const filterColumn: Record<FilterKey, SQL> = {
  offering: sql`lower(${s.offeringSlug})`,
  industry: sql`lower(${s.industry})`,
  region: sql`lower(${s.region})`,
  period: sql`lower(${s.periodLabel})`,
  topic: sql`lower(${s.topic})`,
};
const filterConds = (f: Filters) => FILTER_KEYS.filter((k) => f[k]).map((k) => sql`${filterColumn[k]} = ${f[k]!.toLowerCase()}`);

export const cacheKeyFor = (q: string, f: Filters) =>
  createHash('sha256')
    .update(JSON.stringify({ scope: CACHE_SCOPE, q: tokenise(q).sort(), f: FILTER_KEYS.map((k) => [k, f[k]?.toLowerCase() ?? null]) }))
    .digest('hex');

interface Candidate extends SharedPublic { indexText: string | null; indexTerms: Record<string, number> | null }

async function loadCandidates(f: Filters): Promise<Candidate[]> {
  return (await db
    .select({ ...sharedPublicColumns, indexText: schema.searchIndex.text, indexTerms: schema.searchIndex.terms })
    .from(s)
    .leftJoin(schema.searchIndex, eq(schema.searchIndex.sharedId, s.id))
    .where(and(eq(s.status, 'published'), ...filterConds(f)))
    .orderBy(desc(s.publishedAt), s.id)
    .limit(2000)) as Candidate[];
}

function docTerms(c: Candidate): Map<string, number> {
  const tf = termFreq(tokenise(c.title), 3);
  termFreq(tokenise(c.topic), 2, tf);
  termFreq(tokenise(c.summary), 1, tf);
  termFreq(tokenise(c.indexText), 1, tf);
  if (c.indexTerms) for (const [k, v] of Object.entries(c.indexTerms)) if (typeof v === 'number' && !tf.has(k)) tf.set(k, v);
  return tf;
}

/** BM25-ish scoring over the (published) candidate set. Pure; exported for tests. */
export function scoreCandidates(q: string, docs: { id: string; tf: Map<string, number> }[]): Map<string, number> {
  const qt = [...new Set(tokenise(q))];
  const scores = new Map<string, number>();
  if (!qt.length) return scores;
  const n = docs.length;
  const k1 = 1.2;
  for (const t of qt) {
    const hits = docs
      .map((d) => {
        let tf = d.tf.get(t) ?? 0;
        if (!tf) for (const [dt, c] of d.tf) if (fuzzyMatch(t, dt)) tf += 0.5 * c;
        return { id: d.id, tf };
      })
      .filter((h) => h.tf > 0);
    const idf = idfOf(hits.length, n);
    for (const h of hits) scores.set(h.id, (scores.get(h.id) ?? 0) + idf * ((h.tf * (k1 + 1)) / (h.tf + k1)));
  }
  return scores;
}

export interface FeedParams { q?: string; filters?: Filters; limit?: number; offset?: number }
export interface FeedPage { items: SharedPublic[]; ids: string[]; cacheHit: boolean; hasMore: boolean }

async function rankIds(q: string, f: Filters): Promise<string[]> {
  const cands = await loadCandidates(f);
  if (!q) return cands.map((c) => c.id).slice(0, MAX_IDS);
  const scores = scoreCandidates(q, cands.map((c) => ({ id: c.id, tf: docTerms(c) })));
  const order = new Map(cands.map((c, i) => [c.id, i]));
  return [...scores].sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!).map(([id]) => id).slice(0, MAX_IDS);
}

/**
 * Ranked, filtered, visibility-checked search over APPROVED shared items. Returns null when the principal may not see the
 * feed. Cached id lists (retrieval_cache) are always re-verified against status='published' so withdrawal is immediate
 * even if a cache purge is delayed.
 */
export async function searchShared(p: Principal | null, params: FeedParams = {}): Promise<FeedPage | null> {
  if (!canSeeFeed(p)) return null;
  const q = normaliseQuery(params.q);
  const f = normaliseFilters(params.filters);
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);
  const key = cacheKeyFor(q, f);

  // The cached list is only valid for the exact published set it was computed from, so approvals/reinstatements show at once.
  const [fp] = await db.select({ v: sql<string>`coalesce(md5(string_agg(${s.id}::text, ',' order by ${s.id})), '')` }).from(s).where(eq(s.status, 'published'));
  const scope = `${CACHE_SCOPE}:${fp?.v ?? ''}`;
  let ids: string[] | null = null;
  let cacheHit = false;
  const [hit] = await db.select().from(schema.retrievalCache).where(eq(schema.retrievalCache.key, key));
  if (hit && hit.scope === scope && Date.now() - hit.createdAt.getTime() < CACHE_TTL_MS) {
    ids = hit.resultIds;
    cacheHit = true;
  }
  if (!ids) {
    ids = await rankIds(q, f);
    await db
      .insert(schema.retrievalCache)
      .values({ key, scope, resultIds: ids })
      .onConflictDoUpdate({ target: schema.retrievalCache.key, set: { scope, resultIds: ids, createdAt: new Date() } });
  }
  const verified = await getVisibleSharedMany(p, ids); // re-check published + visibility on EVERY read
  const page = verified.slice(offset, offset + limit);
  return { items: page, ids: verified.map((v) => v.id), cacheHit, hasMore: offset + limit < verified.length };
}

export interface FeedResult extends FeedPage { stat: StatDisplay; facets: Record<'offering' | 'industry' | 'region' | 'period' | 'topic', string[]> }

/** Distinct filter values among published items (no counts). */
export async function facets(p: Principal | null): Promise<FeedResult['facets']> {
  const empty = { offering: [], industry: [], region: [], period: [], topic: [] };
  if (!canSeeFeed(p)) return empty;
  const rows = await db
    .select({ offering: s.offeringSlug, industry: s.industry, region: s.region, period: s.periodLabel, topic: s.topic })
    .from(s)
    .where(eq(s.status, 'published'));
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
  return { offering: uniq(rows.map((r) => r.offering)), industry: uniq(rows.map((r) => r.industry)), region: uniq(rows.map((r) => r.region)), period: uniq(rows.map((r) => r.period)), topic: uniq(rows.map((r) => r.topic)) };
}

/** Search + the safeguarded headline statistic (same visibility rules + cohort threshold + differencing ledger). */
export async function runFeed(p: Principal | null, params: FeedParams = {}): Promise<FeedResult | null> {
  const page = await searchShared(p, params);
  if (!page || !p) return null;
  const stat = await releaseStat(p.userId, page.ids);
  return { ...page, stat, facets: await facets(p) };
}

export interface Suggestion { text: string; kind: 'title' | 'topic'; id?: string }
/** Type-ahead. Same visibility + published rule as the records; no counts; only approved titles/topics. */
export async function suggest(p: Principal | null, prefix: string): Promise<Suggestion[]> {
  const q = normaliseQuery(prefix);
  if (!canSeeFeed(p) || q.length < 2) return [];
  const like = `%${escapeLike(q)}%`;
  const titles = await db.select({ id: s.id, title: s.title }).from(s).where(and(eq(s.status, 'published'), ilike(s.title, like))).orderBy(desc(s.publishedAt)).limit(6);
  const topics = await db.selectDistinct({ topic: s.topic }).from(s).where(and(eq(s.status, 'published'), ilike(s.topic, like))).limit(4);
  return [
    ...topics.flatMap((t) => (t.topic ? [{ text: t.topic, kind: 'topic' as const }] : [])),
    ...titles.map((t) => ({ text: t.title, kind: 'title' as const, id: t.id })),
  ].slice(0, 8);
}

const csvCell = (v: unknown) => {
  let t = v instanceof Date ? v.toISOString() : v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // spreadsheet formula injection
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const EXPORT_COLS = ['id', 'title', 'summary', 'kind', 'offeringSlug', 'industry', 'region', 'periodLabel', 'topic', 'evidenceType', 'confidence', 'evidenceQuality', 'attributionLabel', 'publishedAt'] as const;

/** Export of the SAME result set the user would see (visibility, published re-check, suppression). null = not permitted. */
export async function exportFeed(p: Principal | null, params: FeedParams, format: 'csv' | 'json') {
  const res = await runFeed(p, { ...params, limit: 500, offset: 0 });
  if (!res || !p) return null;
  const rows = res.items.map((i) => Object.fromEntries(EXPORT_COLS.map((c) => [c, i[c as keyof SharedPublic]])));
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'insights.export', resourceType: 'shared_feed', meta: { format, count: rows.length, q: normaliseQuery(params.q), filters: normaliseFilters(params.filters) } });
  if (format === 'json') {
    return { contentType: 'application/json; charset=utf-8', filename: 'azentio-approved-insights.json', body: JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Approved, de-identified shared contributions only.', statistics: res.stat, items: rows }, null, 2) };
  }
  const body = [EXPORT_COLS.join(','), ...rows.map((r) => EXPORT_COLS.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
  return { contentType: 'text/csv; charset=utf-8', filename: 'azentio-approved-insights.csv', body };
}
