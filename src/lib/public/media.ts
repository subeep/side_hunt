import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audienceFilter, canSeeAudience, hasGrant, type AudienceKind } from '../authz';
import { audit } from '../audit';
import { isId, isSlug } from './links';

export type MediaVariant = 'data' | 'poster';
export type MediaDecision = 'ok' | 'not_found' | 'no_audience' | 'audience' | 'draft';

type Row = typeof schema.media.$inferSelect;
const audOf = (r: Pick<Row, 'audienceKind' | 'audienceOrgId' | 'audienceProduct'>) => ({ kind: r.audienceKind, orgId: r.audienceOrgId, product: r.audienceProduct });

/**
 * THE media access rule (REQUIRED ACCESS RULE). Pure.
 *  1. audience metadata must exist (NULL kind => deny for EVERYONE, publishers included)
 *  2. the audience must permit this principal (canSeeAudience: identity, ACTIVE workspace, entitlement)
 *  3. status must be published, unless the principal holds the separate video_publisher grant
 */
export function mediaDecision(row: Pick<Row, 'status' | 'audienceKind' | 'audienceOrgId' | 'audienceProduct'> | undefined, p: Principal | null): MediaDecision {
  if (!row) return 'not_found';
  if (!row.audienceKind) return 'no_audience';
  if (!canSeeAudience(p, audOf(row))) return 'audience';
  if (row.status !== 'published' && !hasGrant(p, 'video_publisher')) return 'draft';
  return 'ok';
}

// Never serve stored text as an active type (html/js). Anything unexpected is downgraded to text/plain.
const SAFE_MIMES = new Set(['image/svg+xml', 'text/plain', 'text/vtt', 'text/markdown', 'application/json']);
export const safeMime = (m: string) => (SAFE_MIMES.has(m) ? m : 'text/plain');

async function load(id: string): Promise<Row | undefined> {
  if (!isId(id)) return undefined;
  const [row] = await db.select().from(schema.media).where(eq(schema.media.id, id));
  return row;
}

async function denyAudit(p: Principal | null, id: string, why: MediaDecision) {
  // Only signed-in probes are audited (anonymous probing would let anyone flood the log); the response is a plain 404 either way.
  if (p && why !== 'not_found') await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'media.deny', resourceType: 'media', resourceId: id, outcome: 'deny', meta: { reason: why } });
}

export interface MediaPayload {
  body: string;
  mime: string;
  audienceKind: AudienceKind;
  /** Safe for shared caches: explicitly public audience AND published. */
  cacheable: boolean;
}

/** Bytes for /api/media/[id]. null => the caller must answer 404 (never 403, never a hint that it exists). */
export async function getMediaForPrincipal(id: string, p: Principal | null, variant: MediaVariant = 'data'): Promise<MediaPayload | null> {
  const row = await load(id);
  const why = mediaDecision(row, p);
  if (why !== 'ok') {
    await denyAudit(p, id, why);
    return null;
  }
  const r = row!;
  const body = variant === 'poster' ? r.posterSvg : r.data;
  if (!body) return null;
  return {
    body,
    mime: variant === 'poster' ? 'image/svg+xml' : safeMime(r.mime),
    audienceKind: r.audienceKind!,
    cacheable: r.audienceKind === 'public' && r.status === 'published',
  };
}

export interface MediaDetail {
  id: string;
  title: string;
  description: string | null;
  kind: Row['kind'];
  durationSec: number | null;
  transcript: string | null;
  chapters: { t: number; title: string }[];
  productSlug: string | null;
  audienceKind: AudienceKind;
  status: Row['status'];
  hasPoster: boolean;
}

/** Metadata for the player page (same rule as the bytes). */
export async function getMediaDetailForPrincipal(id: string, p: Principal | null): Promise<MediaDetail | null> {
  const row = await load(id);
  const why = mediaDecision(row, p);
  if (why !== 'ok') {
    await denyAudit(p, id, why);
    return null;
  }
  const r = row!;
  return {
    id: r.id, title: r.title, description: r.description, kind: r.kind, durationSec: r.durationSec, transcript: r.transcript,
    chapters: Array.isArray(r.chapters) ? r.chapters : [], productSlug: r.productSlug, audienceKind: r.audienceKind!, status: r.status, hasPoster: !!r.posterSvg,
  };
}

export interface MediaListItem {
  id: string;
  title: string;
  description: string | null;
  kind: Row['kind'];
  durationSec: number | null;
  productSlug: string | null;
  audienceKind: AudienceKind;
  hasPoster: boolean;
}

/** Gallery / product-page list. Uses the SQL twin of the audience rule + published-only (drafts are managed in /publisher). */
export async function listMediaForPrincipal(p: Principal | null, opts: { productSlug?: string; limit?: number } = {}): Promise<MediaListItem[]> {
  const m = schema.media;
  const where = [audienceFilter({ kind: m.audienceKind, orgId: m.audienceOrgId, product: m.audienceProduct }, p), eq(m.status, 'published')];
  if (opts.productSlug) {
    if (!isSlug(opts.productSlug)) return [];
    where.push(eq(m.productSlug, opts.productSlug));
  }
  const rows = await db
    .select({ id: m.id, title: m.title, description: m.description, kind: m.kind, durationSec: m.durationSec, productSlug: m.productSlug, audienceKind: m.audienceKind, hasPoster: sql<boolean>`${m.posterSvg} is not null` })
    .from(m)
    .where(and(...where))
    .orderBy(asc(m.createdAt), asc(m.id))
    .limit(Math.min(opts.limit ?? 60, 100));
  return rows.filter((r): r is typeof r & { audienceKind: AudienceKind } => !!r.audienceKind);
}

/** Public showcase strip (anonymous view, always public + published only). */
export const listShowcase = (limit = 4) => listMediaForPrincipal(null, { limit });

/** Is this media id viewable by an anonymous visitor? Used to decide whether a public event may link its recording. */
export async function publicMediaIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const id of ids) {
    const row = await load(id);
    if (mediaDecision(row, null) === 'ok') out.add(id);
  }
  return out;
}

export { fmtDuration, mediaUrl } from './media-format';
