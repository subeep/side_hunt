import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audienceFilter, type AudienceKind } from '../authz';
import { isSlug, safeHref } from './links';

const c = schema.contentItems;
const aud = { kind: c.audienceKind, orgId: c.audienceOrgId, product: c.audienceProduct };

export interface Banner {
  id: string;
  title: string;
  summary: string | null;
  eyebrow: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  audienceKind: AudienceKind;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Pure: is `now` inside the banner's scheduled window? (null bound = open) */
export const inWindow = (b: { startsAt: Date | null; endsAt: Date | null }, now: Date) => (!b.startsAt || b.startsAt <= now) && (!b.endsAt || b.endsAt > now);

export function bannerFromRow(r: Pick<typeof c.$inferSelect, 'id' | 'title' | 'summary' | 'meta' | 'audienceKind' | 'startsAt' | 'endsAt'>): Banner {
  const m = (r.meta ?? {}) as Record<string, unknown>;
  const href = safeHref(m.ctaHref);
  return {
    id: r.id, title: r.title, summary: r.summary,
    eyebrow: typeof m.eyebrow === 'string' && m.eyebrow ? m.eyebrow.slice(0, 60) : 'Announcement',
    ctaLabel: href && typeof m.ctaLabel === 'string' ? m.ctaLabel.slice(0, 40) : null,
    ctaHref: href, audienceKind: r.audienceKind as AudienceKind, startsAt: r.startsAt, endsAt: r.endsAt,
  };
}

/**
 * Banners the principal may see right now: published, inside their window, and permitted by the audience rule
 * (audienceFilter: NULL audience => hidden). Anonymous visitors only ever get audience 'public'.
 */
export async function getBannersForPrincipal(p: Principal | null, now = new Date()): Promise<Banner[]> {
  const rows = await db
    .select({ id: c.id, title: c.title, summary: c.summary, meta: c.meta, audienceKind: c.audienceKind, startsAt: c.startsAt, endsAt: c.endsAt })
    .from(c)
    .where(and(eq(c.kind, 'banner'), eq(c.status, 'published'), audienceFilter(aud, p), or(isNull(c.startsAt), lte(c.startsAt, now)), or(isNull(c.endsAt), gt(c.endsAt, now))))
    .orderBy(sql`${c.startsAt} desc nulls last`, desc(c.createdAt)); // unscheduled banners sort after scheduled ones, newest first
  return rows.map(bannerFromRow);
}
export const getPublicBanners = (now = new Date()) => getBannersForPrincipal(null, now);

export interface PublicItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string | null;
  publishedAt: Date | null;
  tags: string[];
  /** Only set by the principal-aware readers; 'public' | 'employees'. */
  audienceKind?: AudienceKind;
}
const tagsOf = (meta: unknown) => {
  const t = (meta as { tags?: unknown } | null)?.tags;
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
};
const cols = { id: c.id, slug: c.slug, title: c.title, summary: c.summary, body: c.body, publishedAt: c.publishedAt, meta: c.meta };
const colsAud = { ...cols, audienceKind: c.audienceKind };
const toItem = ({ meta, ...r }: { id: string; slug: string; title: string; summary: string | null; body: string | null; publishedAt: Date | null; meta: unknown }): PublicItem => ({ ...r, tags: tagsOf(meta) });

/** Public pages/perspectives/lab: kind + published + EXPLICIT audience 'public' only (employee/org items never appear here). */
export async function listPublicContent(kind: 'perspective' | 'lab' | 'page', limit = 50): Promise<PublicItem[]> {
  const rows = await db.select(cols).from(c).where(and(eq(c.kind, kind), eq(c.status, 'published'), eq(c.audienceKind, 'public'))).orderBy(desc(c.publishedAt), desc(c.createdAt)).limit(limit);
  return rows.map(toItem);
}

export async function getPublicContent(kind: 'perspective' | 'lab' | 'page', slug: string): Promise<PublicItem | null> {
  if (!isSlug(slug)) return null;
  const [row] = await db.select(cols).from(c).where(and(eq(c.kind, kind), eq(c.slug, slug), eq(c.status, 'published'), eq(c.audienceKind, 'public')));
  return row ? toItem(row) : null;
}

/**
 * Readers for the site pages (/perspectives, /lab, /pages): public items for everyone PLUS employees-only items for
 * employees. Same published + audience rule as everywhere (audienceFilter), further limited to the two audiences the
 * publisher console can create. AIRA / search must keep using listPublicContent/getPublicContent (public only).
 */
const siteAudiences = (p: Principal | null) => and(audienceFilter(aud, p), inArray(c.audienceKind, ['public', 'employees']));
const toSiteItem = ({ meta, audienceKind, ...r }: { id: string; slug: string; title: string; summary: string | null; body: string | null; publishedAt: Date | null; meta: unknown; audienceKind: string | null }): PublicItem => ({ ...r, tags: tagsOf(meta), audienceKind: audienceKind as AudienceKind });

export async function listContentForPrincipal(p: Principal | null, kind: 'perspective' | 'lab' | 'page', limit = 50): Promise<PublicItem[]> {
  const rows = await db.select(colsAud).from(c).where(and(eq(c.kind, kind), eq(c.status, 'published'), siteAudiences(p))).orderBy(desc(c.publishedAt), desc(c.createdAt)).limit(limit);
  return rows.map(toSiteItem);
}

export async function getContentForPrincipal(p: Principal | null, kind: 'perspective' | 'lab' | 'page', slug: string): Promise<PublicItem | null> {
  if (!isSlug(slug)) return null;
  const [row] = await db.select(colsAud).from(c).where(and(eq(c.kind, kind), eq(c.slug, slug), eq(c.status, 'published'), siteAudiences(p)));
  return row ? toSiteItem(row) : null;
}
