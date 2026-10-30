import { asc, eq, and } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { isSlug } from './links';

const p = schema.products;
export interface PublicProduct {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  summary: string;
  capabilities: string[];
  workflow: string[];
}

// Explicit column list: only public marketing fields ever leave this module (no sandbox wiring, no internal notes).
const cols = { slug: p.slug, name: p.name, category: p.category, tagline: p.tagline, summary: p.summary, details: p.details };
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const toProduct = (r: { slug: string; name: string; category: string; tagline: string; summary: string; details: unknown }): PublicProduct => {
  const d = (r.details ?? {}) as { capabilities?: unknown; workflow?: unknown };
  return { slug: r.slug, name: r.name, category: r.category, tagline: r.tagline, summary: r.summary, capabilities: strs(d.capabilities), workflow: strs(d.workflow) };
};

export async function listPublicProducts(): Promise<PublicProduct[]> {
  return (await db.select(cols).from(p).where(eq(p.status, 'active')).orderBy(asc(p.sortOrder))).map(toProduct);
}
export async function getPublicProduct(slug: string): Promise<PublicProduct | null> {
  if (!isSlug(slug)) return null;
  const [r] = await db.select(cols).from(p).where(and(eq(p.slug, slug), eq(p.status, 'active')));
  return r ? toProduct(r) : null;
}

/** Which "go deeper" links to offer. UI hint only: /client/sandbox and /employee/playground re-check on the server. */
export function productLinks(pr: Principal | null, slug: string) {
  return {
    sandbox: !!pr?.activeOrgId && pr.entitlements.has(slug),
    playground: !!pr?.isEmployee,
    needsWorkspace: !!pr && !pr.activeOrgId && pr.memberships.some((m) => m.orgKind === 'client'),
  };
}
