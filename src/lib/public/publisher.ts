import { and, asc, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { newId } from '@/db/ids';
import type { Principal } from '../auth/principal';
import { authorize, type Action } from '../authz';
import { audit } from '../audit';
import { fieldErrors } from './lead-schema';
import { isId, isSlug, safeHref } from './links';

/**
 * Publisher console domain logic. Two SEPARATE grants:
 *   content_publisher -> banners + public content   (Action 'content.publish')
 *   video_publisher   -> media audiences/status     (Action 'video.publish')
 * Every function re-checks the grant itself (server actions call a guard first, this is the second, tested line of defence).
 * Nothing here can touch identities, memberships, grants, or any private learning record: only content_items (banner,
 * perspective, lab, page; audience public|employees) and media metadata.
 */
export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: Record<string, string>; denied?: boolean };
const fail = (error: string, errors?: Record<string, string>): { ok: false; error: string; errors?: Record<string, string> } => ({ ok: false, error, errors });

async function gate(p: Principal | null, action: Action, what: string): Promise<{ ok: false; error: string; denied: true } | null> {
  if (authorize(p, action).allow) return null;
  await audit({ actorId: p?.userId ?? null, actorOrgId: p?.activeOrgId ?? null, action: 'authz.deny', outcome: 'deny', meta: { what, needs: action } });
  return { ok: false, error: 'You do not have the grant required for this action.', denied: true };
}

export const publisherTabsFor = (p: Principal | null) => [
  ...(authorize(p, 'content.publish').allow ? [{ href: '/publisher/banners', label: 'Banners' }, { href: '/publisher/content', label: 'Public content' }] : []),
  ...(authorize(p, 'video.publish').allow ? [{ href: '/publisher/media', label: 'Media audiences' }] : []),
];

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optStr = (max: number, label: string) => z.preprocess(blank, z.string().trim().max(max, `${label} must be at most ${max} characters.`).optional());
const parseDate = (v: unknown) => {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const s = v.trim();
  const d = new Date(/(z|[+-]\d\d:?\d\d)$/i.test(s) ? s : `${s}Z`); // datetime-local has no zone: the console states UTC
  return Number.isNaN(d.getTime()) ? v : d;
};
const dateField = (label: string) => z.preprocess(parseDate, z.date({ error: `${label} is not a valid date/time.` }).optional());
const idField = z.preprocess(blank, z.string().refine(isId, 'Invalid id.').optional());
const MANAGED_AUDIENCES = ['public', 'employees'] as const;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'item';

const c = schema.contentItems;

// ---------- banners (content_publisher) ----------
export const bannerSchema = z
  .object({
    id: idField,
    title: z.string().trim().min(3, 'Title needs at least 3 characters.').max(120, 'Title must be at most 120 characters.'),
    summary: optStr(300, 'Summary'),
    eyebrow: optStr(60, 'Eyebrow'),
    ctaLabel: optStr(40, 'Button label'),
    ctaHref: z.preprocess(blank, z.string().trim().refine((s) => safeHref(s) !== null, 'Use a site path like /connect or an https:// link.').optional()),
    audience: z.enum(MANAGED_AUDIENCES, { error: 'Audience must be public or employees.' }),
    startsAt: dateField('Start'),
    endsAt: dateField('End'),
  })
  .refine((v) => !!v.ctaLabel === !!v.ctaHref, { path: ['ctaLabel'], message: 'Provide both a button label and a link, or neither.' })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, { path: ['endsAt'], message: 'End must be after start.' });

export async function saveBanner(p: Principal | null, raw: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const d = await gate(p, 'content.publish', 'banner.save');
  if (d) return d;
  const parsed = bannerSchema.safeParse(raw);
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error));
  const v = parsed.data;
  const values = { title: v.title, summary: v.summary ?? null, audienceKind: v.audience, audienceOrgId: null, audienceProduct: null, startsAt: v.startsAt ?? null, endsAt: v.endsAt ?? null, meta: { eyebrow: v.eyebrow ?? null, ctaLabel: v.ctaLabel ?? null, ctaHref: v.ctaHref ?? null }, updatedAt: new Date() };
  if (v.id) {
    const [cur] = await db.select().from(c).where(and(eq(c.id, v.id), eq(c.kind, 'banner'), inArray(c.audienceKind, [...MANAGED_AUDIENCES])));
    if (!cur) return fail('Banner not found.');
    await db.update(c).set(values).where(eq(c.id, cur.id));
    await audit({ actorId: p!.userId, actorOrgId: p!.activeOrgId, action: 'banner.update', resourceType: 'content', resourceId: cur.id, meta: { status: cur.status, audience: { from: cur.audienceKind, to: v.audience }, startsAt: v.startsAt ?? null, endsAt: v.endsAt ?? null } });
    return { ok: true, id: cur.id };
  }
  const id = newId('cnt');
  await db.insert(c).values({ id, kind: 'banner', slug: `${slugify(v.title)}-${id.slice(-4)}`, status: 'draft', authorId: p!.userId, ...values });
  await audit({ actorId: p!.userId, actorOrgId: p!.activeOrgId, action: 'banner.create', resourceType: 'content', resourceId: id, meta: { audience: v.audience } });
  return { ok: true, id };
}

// ---------- public content (content_publisher) ----------
export const contentSchema = z.object({
  id: idField,
  kind: z.enum(['perspective', 'lab', 'page'], { error: 'Choose perspective, lab or page.' }),
  slug: z.string().trim().toLowerCase().refine(isSlug, 'Slug: 2-80 characters, lowercase letters, numbers and hyphens.'),
  title: z.string().trim().min(3, 'Title needs at least 3 characters.').max(140, 'Title must be at most 140 characters.'),
  summary: optStr(300, 'Summary'),
  body: z.string().trim().min(20, 'Body needs at least 20 characters.').max(8000, 'Body must be at most 8000 characters.'),
  tags: z.preprocess((v) => (typeof v === 'string' ? v.split(',').map((t) => t.trim()).filter(Boolean) : []), z.array(z.string().max(24, 'Tags must be at most 24 characters.')).max(6, 'At most 6 tags.')),
  audience: z.enum(MANAGED_AUDIENCES, { error: 'Audience must be public or employees.' }),
});

export async function saveContent(p: Principal | null, raw: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const d = await gate(p, 'content.publish', 'content.save');
  if (d) return d;
  const parsed = contentSchema.safeParse(raw);
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error));
  const v = parsed.data;
  let cur: typeof c.$inferSelect | undefined;
  if (v.id) {
    [cur] = await db.select().from(c).where(and(eq(c.id, v.id), inArray(c.kind, ['perspective', 'lab', 'page']), inArray(c.audienceKind, [...MANAGED_AUDIENCES])));
    if (!cur) return fail('Content item not found.');
  }
  const kind = cur?.kind ?? v.kind; // kind is fixed once created
  const [dupe] = await db.select({ id: c.id }).from(c).where(and(eq(c.kind, kind), eq(c.slug, v.slug), ne(c.id, cur?.id ?? '')));
  if (dupe) return fail('That slug is already used.', { slug: 'That slug is already used for this content type.' });
  const values = { slug: v.slug, title: v.title, summary: v.summary ?? null, body: v.body, audienceKind: v.audience, audienceOrgId: null, audienceProduct: null, meta: { tags: v.tags }, updatedAt: new Date() };
  if (cur) {
    await db.update(c).set(values).where(eq(c.id, cur.id));
    await audit({ actorId: p!.userId, actorOrgId: p!.activeOrgId, action: 'content.update', resourceType: 'content', resourceId: cur.id, meta: { kind, status: cur.status, audience: { from: cur.audienceKind, to: v.audience } } });
    return { ok: true, id: cur.id };
  }
  const id = newId('cnt');
  await db.insert(c).values({ id, kind, status: 'draft', authorId: p!.userId, ...values });
  await audit({ actorId: p!.userId, actorOrgId: p!.activeOrgId, action: 'content.create', resourceType: 'content', resourceId: id, meta: { kind, audience: v.audience } });
  return { ok: true, id };
}

const TRANSITIONS: Record<string, string[]> = { draft: ['published', 'archived'], published: ['draft', 'archived'], archived: ['draft'] };
const statusSchema = z.enum(['draft', 'published', 'archived']);

/** Publish / unpublish / archive a banner or public content item. */
export async function setContentStatus(p: Principal | null, group: 'banner' | 'content', id: string, status: unknown): Promise<Result<{ status: string }>> {
  const d = await gate(p, 'content.publish', `${group}.status`);
  if (d) return d;
  const s = statusSchema.safeParse(status);
  if (!s.success || !isId(id)) return fail('Invalid request.');
  const kinds = group === 'banner' ? ['banner' as const] : ['perspective' as const, 'lab' as const, 'page' as const];
  const [cur] = await db.select().from(c).where(and(eq(c.id, id), inArray(c.kind, kinds), inArray(c.audienceKind, [...MANAGED_AUDIENCES])));
  if (!cur) return fail('Item not found.');
  if (!TRANSITIONS[cur.status]?.includes(s.data)) return fail(`Cannot move from ${cur.status} to ${s.data}.`);
  await db.update(c).set({ status: s.data, updatedAt: new Date(), ...(s.data === 'published' ? { publishedAt: cur.publishedAt ?? new Date() } : {}) }).where(eq(c.id, cur.id));
  await audit({ actorId: p!.userId, actorOrgId: p!.activeOrgId, action: `${group}.${s.data === 'published' ? 'publish' : s.data === 'archived' ? 'archive' : 'unpublish'}`, resourceType: 'content', resourceId: cur.id, meta: { from: cur.status, to: s.data, audience: cur.audienceKind } });
  return { ok: true, status: s.data };
}

export async function listBannersForManage(p: Principal | null) {
  if (!authorize(p, 'content.publish').allow) return [];
  return db.select().from(c).where(and(eq(c.kind, 'banner'), inArray(c.audienceKind, [...MANAGED_AUDIENCES]))).orderBy(desc(c.updatedAt));
}
export async function listContentForManage(p: Principal | null) {
  if (!authorize(p, 'content.publish').allow) return [];
  return db.select().from(c).where(and(inArray(c.kind, ['perspective', 'lab', 'page']), inArray(c.audienceKind, [...MANAGED_AUDIENCES]))).orderBy(desc(c.updatedAt));
}

// ---------- media audiences (video_publisher) ----------
const m = schema.media;
/**
 * A video_publisher is an EMPLOYEE grant: it never gives access to client-private material. The console therefore only
 * touches media that is NOT tenant-private: audience public, employees or product (entitled demos), or no audience yet.
 * Org-audience rows are invisible to the console ("not found"), exactly like org-audience content on the content side.
 */
const MANAGED_MEDIA = ['public', 'employees', 'product'] as const;
const managedMedia = or(isNull(m.audienceKind), inArray(m.audienceKind, [...MANAGED_MEDIA]));
export const mediaAudienceSchema = z
  .object({
    id: z.string().refine(isId, 'Invalid id.'),
    kind: z.enum(['public', 'employees', 'org', 'product'], { error: 'Choose public, employees, organisation or product.' }),
    orgId: z.preprocess(blank, z.string().refine(isId, 'Invalid organisation.').optional()),
    product: z.preprocess(blank, z.string().refine(isSlug, 'Invalid product.').optional()),
    confirmPublic: z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean()),
  })
  .refine((v) => v.kind !== 'org' || !!v.orgId, { path: ['orgId'], message: 'Select the organisation.' })
  .refine((v) => v.kind !== 'product' || !!v.product, { path: ['product'], message: 'Select the product.' });

export async function setMediaAudience(p: Principal | null, raw: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const d = await gate(p, 'video.publish', 'media.audience');
  if (d) return d;
  const parsed = mediaAudienceSchema.safeParse(raw);
  if (!parsed.success) return fail('Please fix the highlighted fields.', fieldErrors(parsed.error));
  const v = parsed.data;
  const [cur] = await db.select({ id: m.id, status: m.status, kind: m.audienceKind, orgId: m.audienceOrgId, product: m.audienceProduct }).from(m).where(and(eq(m.id, v.id), managedMedia));
  if (!cur) return fail('Media not found.');
  if (v.kind === 'org') {
    const [o] = await db.select({ id: schema.organisations.id }).from(schema.organisations).where(and(eq(schema.organisations.id, v.orgId!), eq(schema.organisations.kind, 'client'), eq(schema.organisations.status, 'active')));
    if (!o) return fail('Please fix the highlighted fields.', { orgId: 'Unknown client organisation.' });
  }
  if (v.kind === 'product') {
    const [pr] = await db.select({ slug: schema.products.slug }).from(schema.products).where(eq(schema.products.slug, v.product!));
    if (!pr) return fail('Please fix the highlighted fields.', { product: 'Unknown product.' });
  }
  if (v.kind === 'public' && cur.kind !== 'public' && !v.confirmPublic) return fail('Please fix the highlighted fields.', { confirmPublic: 'Confirm that this media is safe for anyone on the internet.' });
  const to = { kind: v.kind, orgId: v.kind === 'org' ? v.orgId! : null, product: v.kind === 'product' ? v.product! : null };
  await db.update(m).set({ audienceKind: to.kind, audienceOrgId: to.orgId, audienceProduct: to.product }).where(eq(m.id, cur.id));
  await audit({ actorId: p!.userId, actorOrgId: p!.activeOrgId, action: 'media.audience', resourceType: 'media', resourceId: cur.id, orgId: to.orgId, meta: { status: cur.status, from: { kind: cur.kind, orgId: cur.orgId, product: cur.product }, to } });
  return { ok: true, id: cur.id };
}

export async function setMediaStatus(p: Principal | null, id: string, status: unknown): Promise<Result<{ status: string }>> {
  const d = await gate(p, 'video.publish', 'media.status');
  if (d) return d;
  const s = z.enum(['draft', 'published']).safeParse(status);
  if (!s.success || !isId(id)) return fail('Invalid request.');
  const [cur] = await db.select({ id: m.id, status: m.status, kind: m.audienceKind }).from(m).where(and(eq(m.id, id), managedMedia));
  if (!cur) return fail('Media not found.');
  if (s.data === 'published' && !cur.kind) return fail('Set an audience before publishing. Media without audience metadata is denied to everyone.');
  await db.update(m).set({ status: s.data }).where(eq(m.id, cur.id));
  await audit({ actorId: p!.userId, actorOrgId: p!.activeOrgId, action: s.data === 'published' ? 'media.publish' : 'media.unpublish', resourceType: 'media', resourceId: cur.id, meta: { from: cur.status, to: s.data, audience: cur.kind } });
  return { ok: true, status: s.data };
}

/** Metadata only (never the payload, transcript or poster) for the audiences tab. */
export async function listMediaForManage(p: Principal | null) {
  if (!authorize(p, 'video.publish').allow) return [];
  return db
    .select({ id: m.id, title: m.title, kind: m.kind, status: m.status, durationSec: m.durationSec, productSlug: m.productSlug, audienceKind: m.audienceKind, audienceOrgId: m.audienceOrgId, audienceProduct: m.audienceProduct })
    .from(m)
    .where(managedMedia)
    .orderBy(asc(m.createdAt), asc(m.id));
}

/** Selector options for the audience form: client organisation names + product names only. */
export async function audienceOptions(p: Principal | null) {
  if (!authorize(p, 'video.publish').allow) return { orgs: [], products: [] };
  const orgs = await db.select({ id: schema.organisations.id, name: schema.organisations.name }).from(schema.organisations).where(and(eq(schema.organisations.kind, 'client'), eq(schema.organisations.status, 'active'))).orderBy(asc(schema.organisations.name));
  const products = await db.select({ slug: schema.products.slug, name: schema.products.name }).from(schema.products).orderBy(asc(schema.products.sortOrder));
  return { orgs, products };
}

/** Feedback shape for the console forms (client components import the type only). */
export interface PubState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
}
