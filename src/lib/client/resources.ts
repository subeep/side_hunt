import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '@/lib/auth/principal';
import { audit } from '@/lib/audit';
import { clientAudienceFilter, clientCanSee } from './audience';

const c = schema.contentItems;
const cols = { kind: c.audienceKind, orgId: c.audienceOrgId, product: c.audienceProduct };
export const RESOURCE_KINDS = ['resource', 'briefing', 'release_note'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const KIND_LABEL: Record<ResourceKind, string> = { resource: 'Resource', briefing: 'Briefing', release_note: 'Release note' };

const summaryCols = { id: c.id, kind: c.kind, title: c.title, summary: c.summary, audienceKind: c.audienceKind, audienceProduct: c.audienceProduct, publishedAt: c.publishedAt };
const now = () => new Date();
const live = () => and(eq(c.status, 'published'), inArray(c.kind, [...RESOURCE_KINDS]), or(isNull(c.startsAt), lte(c.startsAt, now())), or(isNull(c.endsAt), gt(c.endsAt, now())));

/** Published client resources, briefings and release notes visible to this principal. Client-specific: org or entitled-product audience only. */
export async function listResources(p: Principal) {
  if (!p.activeOrgId) return [];
  return db.select(summaryCols).from(c).where(and(live(), clientAudienceFilter(cols, p))).orderBy(desc(c.publishedAt));
}

export async function getResource(p: Principal, id: string) {
  if (!p.activeOrgId) return null;
  const [r] = await db.select({ ...summaryCols, body: c.body, audienceOrgId: c.audienceOrgId }).from(c).where(and(eq(c.id, id), live()));
  if (!r) return null;
  if (!clientCanSee(p, { kind: r.audienceKind, orgId: r.audienceOrgId, product: r.audienceProduct })) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'resource.view', outcome: 'deny', resourceType: 'content_item', resourceId: id });
    return null;
  }
  const { audienceOrgId: _omit, ...safe } = r;
  return safe;
}
