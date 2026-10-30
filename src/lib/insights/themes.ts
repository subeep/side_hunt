import { and, eq, inArray, ne } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { authorize } from '../authz/policy';
import { minCohortOrgs } from '../env';
import { sharedPublicColumns, type SharedPublic } from '../learning/columns';
import { breakdown, countDistinctOrgs, PRIVACY_NOTE, releaseStat, smallSampleWarning, type Breakdown, type StatDisplay } from './aggregation';
import { cosine, idfTable, termFreq, tfidfVector, tokenise } from './text';
import { canSeeFeed, getVisibleSharedMany } from './visibility';

export const THEME_DISCLAIMER = `${PRIVACY_NOTE} Themes group approved contributions; they do not prove causation and no product model changes automatically.`;
export const QUALITY_WEIGHT: Record<string, number> = { unassessed: 0.3, weak: 0.2, moderate: 0.6, strong: 1 };
export const SIMILARITY_THRESHOLD = 0.25;
export const DUPLICATE_THRESHOLD = 0.85;

type Clusterable = Pick<SharedPublic, 'id' | 'title' | 'summary' | 'topic' | 'offeringSlug'>;

function vectors(items: Clusterable[]) {
  const tfs = items.map((i) => termFreq(tokenise(i.summary), 1, termFreq(tokenise(i.title), 2)));
  const idf = idfTable(tfs);
  return tfs.map((tf) => tfidfVector(tf, idf));
}
const eqi = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Pairwise similarity: TF-IDF cosine on title+summary with small boosts for the same offering / topic. */
export function similarityMatrix(items: Clusterable[]): number[][] {
  const v = vectors(items);
  return items.map((a, i) => items.map((b, j) => (i === j ? 1 : Math.min(1, cosine(v[i], v[j]) + (eqi(a.offeringSlug, b.offeringSlug) ? 0.1 : 0) + (eqi(a.topic, b.topic) ? 0.1 : 0)))));
}

/** Deterministic greedy average-linkage clustering (items processed in id order). Singletons are returned too. */
export function clusterItems(input: Clusterable[], threshold = SIMILARITY_THRESHOLD): string[][] {
  const items = [...input].sort((a, b) => a.id.localeCompare(b.id));
  const sim = similarityMatrix(items);
  const clusters: number[][] = [];
  items.forEach((_, i) => {
    let best = -1, bestSim = threshold;
    clusters.forEach((c, ci) => {
      const avg = c.reduce((s, j) => s + sim[i][j], 0) / c.length;
      if (avg >= bestSim) { best = ci; bestSim = avg; }
    });
    if (best >= 0) clusters[best].push(i);
    else clusters.push([i]);
  });
  return clusters.map((c) => c.map((i) => items[i].id));
}

export interface DuplicatePair { aId: string; bId: string; aTitle: string; bTitle: string; similarity: number }
/** Near-duplicate wording among approved items (a signal for moderators / owners; duplicates are not extra evidence). */
export function findDuplicates(items: Clusterable[], threshold = DUPLICATE_THRESHOLD): DuplicatePair[] {
  const sim = similarityMatrix(items);
  const out: DuplicatePair[] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (sim[i][j] >= threshold) out.push({ aId: items[i].id, bId: items[j].id, aTitle: items[i].title, bTitle: items[j].title, similarity: Math.round(sim[i][j] * 100) / 100 });
  return out.sort((x, y) => y.similarity - x.similarity);
}

export interface Confidence { label: 'low' | 'medium' | 'high'; reasons: string[] }
/** Confidence derives from evidence quality, DISTINCT organisations and sample size; below the cohort threshold it is capped at low. */
export function themeConfidence(a: { qualities: string[]; orgs: number; items: number; threshold?: number }): Confidence {
  const t = a.threshold ?? minCohortOrgs();
  const q = a.qualities.length ? a.qualities.reduce((s, x) => s + (QUALITY_WEIGHT[x] ?? 0.3), 0) / a.qualities.length : 0;
  const score = 0.4 * q + 0.4 * Math.min(a.orgs / (2 * t), 1) + 0.2 * Math.min(a.items / 6, 1);
  let label: Confidence['label'] = score >= 0.7 ? 'high' : score >= 0.45 ? 'medium' : 'low';
  const reasons = [`Average reviewer-assessed evidence quality: ${q >= 0.75 ? 'strong' : q >= 0.5 ? 'moderate' : q >= 0.25 ? 'mixed' : 'weak or unassessed'}.`];
  if (a.orgs < t) { label = 'low'; reasons.push(`Fewer than ${t} contributing organisations: treat as an early signal.`); }
  else reasons.push(`At least ${t} distinct organisations contributed.`);
  if (a.items < 3) reasons.push('Very few approved contributions in this group.');
  return { label, reasons };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Sortable key for free-text period labels such as "Q3 2026" or "Jan-Mar 2026". */
export function periodKey(label: string): number {
  const year = Number(label.match(/(20\d\d)/)?.[1] ?? 0);
  const q = label.match(/\bq([1-4])\b/i)?.[1];
  const m = MONTHS.findIndex((x) => new RegExp(`\\b${x}`, 'i').test(label));
  return year * 100 + (q ? Number(q) * 3 : m >= 0 ? m + 1 : 0);
}

export interface TrendSummary { rows: Breakdown['rows']; text: string; note: string }
/** Trend-change summary between observation periods. Every period cell obeys the cohort threshold. */
export async function trendSummary(ids: string[]): Promise<TrendSummary> {
  const b = await breakdown(ids, 'period');
  const rows = [...b.rows].sort((x, y) => periodKey(x.label) - periodKey(y.label) || x.label.localeCompare(y.label));
  const t = minCohortOrgs();
  if (rows.length < 2)
    return { rows, text: `No trend comparison yet: it needs at least two observation periods that each have ${t} or more contributing organisations.`, note: b.note };
  const [prev, last] = rows.slice(-2);
  const d = last.orgs - prev.orgs;
  const dir = d > 0 ? 'more' : d < 0 ? 'fewer' : 'the same number of';
  return {
    rows,
    text: `${last.label}: ${last.orgs} organisations reported this, versus ${prev.orgs} in ${prev.label} (${d === 0 ? dir : `${Math.abs(d)} ${dir}`}). This shows who has reported, not how common the issue is in the market.`,
    note: b.note,
  };
}

export interface ThemeView {
  id: string; title: string; summary: string; offeringSlug: string | null; topic: string | null; caveat: string | null; generated: boolean;
  items: SharedPublic[]; offerings: string[]; periods: string[]; stat: StatDisplay; confidence: Confidence; limitations: string[]; smallSample: string | null;
  latestUpdate: Date | null; trend: TrendSummary | null; duplicates: DuplicatePair[]; disclaimer: string;
}

type ThemeRow = typeof schema.themes.$inferSelect;
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

async function memberIds(themeId: string) {
  return (await db.select({ id: schema.themeMembers.sharedId }).from(schema.themeMembers).where(eq(schema.themeMembers.themeId, themeId))).map((r) => r.id);
}

async function buildView(p: Principal, theme: ThemeRow, full: boolean): Promise<ThemeView | null> {
  const items = await getVisibleSharedMany(p, await memberIds(theme.id)); // published + visible only, re-checked now
  if (!items.length) return null;
  const ids = items.map((i) => i.id);
  const [stat, orgs] = [await releaseStat(p.userId, ids), await countDistinctOrgs(ids)];
  const confidence = themeConfidence({ qualities: items.map((i) => i.evidenceQuality), orgs, items: items.length });
  const limitations = [
    ...confidence.reasons,
    ...(items.every((i) => i.evidenceQuality === 'unassessed') ? ['No contribution here has been assessed for evidence quality yet.'] : []),
    ...(theme.caveat ? [theme.caveat] : []),
  ];
  return {
    id: theme.id, title: theme.title, summary: theme.summary, offeringSlug: theme.offeringSlug, topic: theme.topic, caveat: theme.caveat, generated: theme.createdBy === 'system',
    items, offerings: uniq(items.map((i) => i.offeringSlug)), periods: uniq(items.map((i) => i.periodLabel)).sort((a, b) => periodKey(a) - periodKey(b)),
    stat, confidence, limitations, smallSample: smallSampleWarning({ ...stat, suppressed: stat.suppressed || orgs < minCohortOrgs() }),
    latestUpdate: [theme.updatedAt, ...items.map((i) => i.publishedAt)].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    trend: full ? await trendSummary(ids) : null,
    duplicates: full ? findDuplicates(items) : [],
    disclaimer: THEME_DISCLAIMER,
  };
}

/** Themes with at least one currently published + visible contribution. Null when the principal may not see the feed. */
export async function listThemes(p: Principal | null): Promise<ThemeView[] | null> {
  if (!canSeeFeed(p)) return null;
  const themes = await db.select().from(schema.themes).where(eq(schema.themes.status, 'active')).orderBy(schema.themes.title);
  const out: ThemeView[] = [];
  for (const t of themes) {
    const v = await buildView(p!, t, false);
    if (v) out.push(v);
  }
  return out;
}

export async function getThemeView(p: Principal | null, id: string): Promise<ThemeView | null> {
  if (!canSeeFeed(p) || !id) return null;
  const [t] = await db.select().from(schema.themes).where(and(eq(schema.themes.id, id), eq(schema.themes.status, 'active')));
  return t ? buildView(p!, t, true) : null;
}

/** Visible themes that reference a given shared item (feed detail "appears in themes"). */
export async function themesForItem(p: Principal | null, sharedId: string): Promise<{ id: string; title: string }[]> {
  if (!canSeeFeed(p)) return [];
  const rows = await db
    .select({ id: schema.themes.id, title: schema.themes.title })
    .from(schema.themeMembers)
    .innerJoin(schema.themes, eq(schema.themes.id, schema.themeMembers.themeId))
    .where(and(eq(schema.themeMembers.sharedId, sharedId), eq(schema.themes.status, 'active')));
  return rows;
}

const mode = (xs: (string | null)[]) => {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
};

/**
 * Rebuild GENERATED themes (created_by='system') from the published feed. Hand-made themes are never modified. Clusters of
 * at least two items that do not substantially overlap a hand-made theme become generated themes with deterministic ids.
 * Product owners only.
 */
export async function rebuildThemes(p: Principal): Promise<{ created: number; removed: number }> {
  const d = authorize(p, 'idea.manage');
  if (!d.allow) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'themes.rebuild', outcome: 'deny', meta: { reason: d.reason } });
    throw new Error('forbidden');
  }
  const items = (await db.select(sharedPublicColumns).from(schema.sharedContributions).where(eq(schema.sharedContributions.status, 'published'))) as SharedPublic[];
  const manual = await db.select().from(schema.themes).where(ne(schema.themes.createdBy, 'system'));
  const manualMembers = manual.length ? await db.select().from(schema.themeMembers).where(inArray(schema.themeMembers.themeId, manual.map((m) => m.id))) : [];
  const manualSets = manual.map((m) => new Set(manualMembers.filter((x) => x.themeId === m.id).map((x) => x.sharedId)));
  const byId = new Map(items.map((i) => [i.id, i]));
  const clusters = clusterItems(items).filter((c) => c.length >= 2 && !manualSets.some((ms) => c.filter((id) => ms.has(id)).length / c.length >= 0.5));

  const keep = new Set<string>();
  for (const c of clusters) {
    const members = c.map((id) => byId.get(id)!);
    const id = 'thm_auto_' + createHash('sha1').update([...c].sort().join('|')).digest('hex').slice(0, 12);
    keep.add(id);
    const topic = mode(members.map((m) => m.topic));
    const offering = mode(members.map((m) => m.offeringSlug));
    const tf = new Map<string, number>();
    members.forEach((m) => termFreq(tokenise(`${m.title} ${m.summary}`), 1, tf));
    const top = [...tf].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([t]) => t);
    const existing = await memberIds(id);
    const same = existing.length === c.length && c.every((x) => existing.includes(x));
    await db.insert(schema.themes).values({
      id, title: `Emerging: ${topic ?? top.join(', ')}`, summary: 'Approved contributions grouped automatically by similar wording. Review the supporting evidence before drawing conclusions.',
      offeringSlug: offering, topic, caveat: 'Generated by text similarity, not editorial judgement.', createdBy: 'system',
    }).onConflictDoUpdate({ target: schema.themes.id, set: same ? { status: 'active' } : { status: 'active', updatedAt: new Date() } });
    if (!same) {
      await db.delete(schema.themeMembers).where(eq(schema.themeMembers.themeId, id));
      await db.insert(schema.themeMembers).values(c.map((sharedId) => ({ themeId: id, sharedId, addedBy: 'system' }))).onConflictDoNothing();
    }
  }
  const generated = await db.select({ id: schema.themes.id }).from(schema.themes).where(eq(schema.themes.createdBy, 'system'));
  const stale = generated.map((g) => g.id).filter((id) => !keep.has(id));
  if (stale.length) {
    await db.delete(schema.themeMembers).where(inArray(schema.themeMembers.themeId, stale));
    await db.delete(schema.themes).where(inArray(schema.themes.id, stale));
  }
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'themes.rebuild', resourceType: 'themes', meta: { created: keep.size, removed: stale.length } });
  return { created: keep.size, removed: stale.length };
}

/** Cheap visibility check for a theme (no statistics released): at least one member is published + visible to the principal. */
export async function themeIsVisible(p: Principal | null, id: string): Promise<{ id: string; title: string } | null> {
  if (!canSeeFeed(p) || !id) return null;
  const [t] = await db.select({ id: schema.themes.id, title: schema.themes.title }).from(schema.themes).where(and(eq(schema.themes.id, id), eq(schema.themes.status, 'active')));
  if (!t) return null;
  return (await getVisibleSharedMany(p, await memberIds(id))).length ? t : null;
}
