import { and, asc, count, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '@/lib/auth/principal';
import { clientAudienceFilter } from './audience';
import { isUpcoming, listSessions } from './sessions';

const m = schema.media;
const k = schema.contributions;

/** Product slugs the ACTIVE workspace is entitled to, resolved to catalogue rows. Read-only. */
export async function listEntitledOfferings(p: Principal) {
  const slugs = [...p.entitlements];
  if (!p.activeOrgId || !slugs.length) return [];
  return db.select().from(schema.products).where(and(inArray(schema.products.slug, slugs), eq(schema.products.status, 'active'))).orderBy(asc(schema.products.sortOrder));
}

/** Approved product demos: published video media with an org or entitled-product audience (never selects the media payload). */
export async function listDemos(p: Principal, limit = 12) {
  if (!p.activeOrgId) return [];
  return db
    .select({ id: m.id, title: m.title, description: m.description, durationSec: m.durationSec, audienceKind: m.audienceKind, audienceProduct: m.audienceProduct })
    .from(m)
    .where(and(eq(m.status, 'published'), eq(m.kind, 'video'), clientAudienceFilter({ kind: m.audienceKind, orgId: m.audienceOrgId, product: m.audienceProduct }, p)))
    .orderBy(desc(m.createdAt))
    .limit(limit);
}

export type StatusCounts = Record<string, number>;

/**
 * Contribution status summary. "mine" = everything I authored in this workspace. "org" = mine plus colleagues' items that are
 * past draft AND not private to their author. Other people's drafts / private items are never counted.
 */
export async function contributionSummary(p: Principal): Promise<{ mine: StatusCounts; org: StatusCounts }> {
  if (!p.activeOrgId) return { mine: {}, org: {} };
  const group = async (where: ReturnType<typeof and>) => {
    const rows = await db.select({ status: k.status, n: count() }).from(k).where(where).groupBy(k.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n])) as StatusCounts;
  };
  const mine = await group(and(eq(k.orgId, p.activeOrgId), eq(k.authorId, p.userId)));
  const org = await group(and(eq(k.orgId, p.activeOrgId), or(eq(k.authorId, p.userId), and(ne(k.status, 'draft'), ne(k.sharingChoice, 'private')))));
  return { mine, org };
}

export const total = (c: StatusCounts) => Object.values(c).reduce((a, b) => a + b, 0);

export async function getDashboard(p: Principal) {
  const [offerings, demos, sessions, contributions] = await Promise.all([listEntitledOfferings(p), listDemos(p, 6), listSessions(p), contributionSummary(p)]);
  return { offerings, demos, upcoming: sessions.filter((s) => isUpcoming(s)).slice(0, 5).map(({ joinInfo: _j, ...s }) => s), contributions };
}
