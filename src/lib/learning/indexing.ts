/**
 * Search-index + retrieval-cache primitives. Deliberately free of runtime imports of '@/db' (seeds call these during db
 * initialisation) so every function takes the db handle. The index is built from the SHARED representation ONLY: never
 * from the private source, never from org/author data.
 */
import { eq, or, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Db } from '../../db';
import { EVIDENCE_TYPES, KIND_LABELS, offeringName } from './constants';

const STOP = new Set('the and for are but not you all any can had her was one our out has have been from that this with they will would there their what about which when were your into than then them these some such only also more most other over very just like each both make many much must should could after before while where being between because'.split(' '));

export const tokenise = (text: string) => (text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []).filter((t) => !STOP.has(t));

type SharedForIndex = Pick<typeof schema.sharedContributions.$inferSelect, 'kind' | 'title' | 'summary' | 'offeringSlug' | 'industry' | 'region' | 'periodLabel' | 'topic' | 'evidenceType'>;

/** Index document for a shared representation: text + term frequencies. Pure. */
export function buildIndexDoc(s: SharedForIndex) {
  const text = [
    s.title,
    s.summary,
    s.topic,
    s.industry,
    s.region,
    s.periodLabel,
    offeringName(s.offeringSlug),
    KIND_LABELS[s.kind as keyof typeof KIND_LABELS],
    EVIDENCE_TYPES[s.evidenceType as keyof typeof EVIDENCE_TYPES],
  ]
    .filter(Boolean)
    .join('\n');
  const terms: Record<string, number> = {};
  for (const t of tokenise(text)) terms[t] = (terms[t] ?? 0) + 1;
  return { text, terms };
}

/** (Re)index a PUBLISHED shared contribution. Anything not 'published' is removed from the index instead. */
export async function indexSharedWith(d: Db, sharedId: string): Promise<boolean> {
  const [s] = await d.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.id, sharedId));
  if (!s || s.status !== 'published') {
    await removeFromIndexWith(d, sharedId);
    return false;
  }
  const doc = buildIndexDoc(s);
  await d
    .insert(schema.searchIndex)
    .values({ sharedId, text: doc.text, terms: doc.terms })
    .onConflictDoUpdate({ target: schema.searchIndex.sharedId, set: { text: doc.text, terms: doc.terms, indexedAt: new Date() } });
  return true;
}

export async function removeFromIndexWith(d: Db, sharedId: string): Promise<number> {
  const r = await d.delete(schema.searchIndex).where(eq(schema.searchIndex.sharedId, sharedId)).returning({ id: schema.searchIndex.sharedId });
  return r.length;
}

/** Delete every cached retrieval result that references the id (in result_ids or anywhere in the cached payload). */
export async function purgeRetrievalCacheWith(d: Db, sharedId: string): Promise<number> {
  const r = await d
    .delete(schema.retrievalCache)
    .where(or(sql`${schema.retrievalCache.resultIds} @> ${JSON.stringify([sharedId])}::jsonb`, sql`${schema.retrievalCache.payload}::text like ${`%${sharedId}%`}`))
    .returning({ k: schema.retrievalCache.key });
  return r.length;
}
