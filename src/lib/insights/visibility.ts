import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { canSeeAudience } from '../authz/audience';
import { sharedPublicColumns, type SharedPublic } from '../learning/columns';

const s = schema.sharedContributions;

/**
 * THE feed visibility rule. The cross-client shared feed (and everything derived from it: search, suggestions, counts,
 * exports, themes, idea evidence, AIRA retrieval) is the 'community' audience: approved-community client members,
 * moderators and product owners. Everyone else (anonymous, other tenants, plain employees) gets nothing.
 */
export const canSeeFeed = (p: Principal | null): boolean => !!p && canSeeAudience(p, { kind: 'community' });

/** Single-row read: the ONLY way a shared item reaches a principal. Re-checks status='published' at read time. */
export async function getVisibleShared(p: Principal | null, id: string): Promise<SharedPublic | null> {
  if (!canSeeFeed(p) || !id) return null;
  const [row] = await db.select(sharedPublicColumns).from(s).where(and(eq(s.id, id), eq(s.status, 'published')));
  return (row as SharedPublic) ?? null;
}

/** Many-row read preserving the caller's order; ids that are unpublished/withdrawn/unknown are silently dropped. */
export async function getVisibleSharedMany(p: Principal | null, ids: string[]): Promise<SharedPublic[]> {
  if (!canSeeFeed(p) || ids.length === 0) return [];
  const uniq = [...new Set(ids)];
  const rows = (await db.select(sharedPublicColumns).from(s).where(and(inArray(s.id, uniq), eq(s.status, 'published')))) as SharedPublic[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return uniq.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/** Subset of `ids` that are currently published AND visible to this principal. */
export async function visiblePublishedIds(p: Principal | null, ids: string[]): Promise<string[]> {
  return (await getVisibleSharedMany(p, ids)).map((r) => r.id);
}

/** Direct object access by id: null (=> 404) when unavailable, with an audit 'deny' when the row exists but is not servable. */
export async function getVisibleSharedAudited(p: Principal | null, id: string): Promise<SharedPublic | null> {
  const row = await getVisibleShared(p, id);
  if (row || !p || !id) return row;
  const [exists] = await db.select({ id: s.id }).from(s).where(eq(s.id, id));
  if (exists) await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'feed.read', resourceType: 'shared_contribution', resourceId: id, outcome: 'deny' });
  return null;
}
