import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { audienceFilter, canSeeAudience, authorize } from '../authz';
import { assertAction, assertEmployee, InputError, optText, parse, text } from './common';

export type EventRow = typeof schema.events.$inferSelect;
const A = 'broadcast.configure';
/** Audiences a publisher may choose for a session. 'org'/'community' audiences belong to the client and learning areas. */
export const SESSION_AUDIENCES = ['employees', 'public', 'product'] as const;
export const canConfigure = (p: Principal | null) => authorize(p, 'broadcast.configure').allow;

/** Internal sessions this employee may see (SQL audience twin). Publishers also see the sessions they can configure for other audiences. */
export async function listSessions(p: Principal | null) {
  await assertEmployee(p, 'employee.live.list');
  // Everyone: employees-audience sessions through the audience rule. Configurers additionally manage the other audiences they may set.
  const visible = audienceFilter({ kind: schema.events.audienceKind, orgId: schema.events.audienceOrgId, product: schema.events.audienceProduct }, p);
  const manage = inArray(schema.events.audienceKind, [...SESSION_AUDIENCES]);
  const rows = await db.select().from(schema.events).where(canConfigure(p) ? manage : and(visible, eq(schema.events.audienceKind, 'employees'))).orderBy(asc(schema.events.startsAt));
  const now = Date.now();
  const isUpcoming = (r: EventRow) => r.status !== 'ended' && r.status !== 'cancelled' && (r.endsAt ?? r.startsAt).getTime() >= now - 3 * 3600_000;
  return { upcoming: rows.filter(isUpcoming), past: rows.filter((r) => !isUpcoming(r)).reverse() };
}

/** Direct object access: returns null (404) unless the audience permits this principal and the event is one this area manages. */
export async function getSession(p: Principal | null, id: string) {
  await assertEmployee(p, 'employee.live.view');
  const [e] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  const managed = !!e && canConfigure(p) && SESSION_AUDIENCES.includes(e.audienceKind as never); // configurers manage sessions of the audiences they may set
  const seen = !!e && e.audienceKind === 'employees' && canSeeAudience(p, { kind: e.audienceKind, orgId: e.audienceOrgId, product: e.audienceProduct });
  if (!e || !(managed || seen)) {
    if (e) await audit({ actorId: p!.userId, action: 'employee.live.view', outcome: 'deny', resourceType: 'event', resourceId: id });
    return null;
  }
  return e;
}

const audienceSchema = z.object({ audience: z.enum(SESSION_AUDIENCES, { message: 'Choose an audience' }), product: z.string().max(80).optional() });
async function resolveAudience(raw: unknown) {
  const a = parse(audienceSchema, raw);
  if (a.audience !== 'product') return { audienceKind: a.audience, audienceOrgId: null, audienceProduct: null } as const;
  const [prod] = a.product ? await db.select({ slug: schema.products.slug }).from(schema.products).where(eq(schema.products.slug, a.product)) : [];
  if (!prod) throw new InputError('Choose a valid product for a product audience.');
  return { audienceKind: 'product', audienceOrgId: null, audienceProduct: prod.slug } as const;
}

const when = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date and time').transform((s) => new Date(s));
const sessionSchema = z.object({
  title: text(3, 140, 'Title'),
  description: optText(1000, 'Description'),
  kind: z.enum(['live', 'webinar', 'briefing', 'hackathon_session'], { message: 'Choose a session type' }),
  startsAt: when,
  endsAt: z.string().optional().transform((s) => (s ? new Date(s) : undefined)).refine((d) => !d || !Number.isNaN(d.getTime()), 'Enter a valid end time'),
  joinInfo: optText(300, 'Join info'),
});

export async function createSession(p: Principal | null, raw: unknown) {
  await assertAction(p, 'broadcast.configure', 'broadcast.create');
  const i = parse(sessionSchema, raw);
  if (i.endsAt && i.endsAt <= i.startsAt) throw new InputError('The end time must be after the start time.');
  const aud = await resolveAudience(raw);
  const [row] = await db.insert(schema.events).values({ title: i.title, description: i.description, kind: i.kind, startsAt: i.startsAt, endsAt: i.endsAt, joinInfo: i.joinInfo, hostId: p!.userId, ...aud }).returning();
  await audit({ actorId: p!.userId, action: 'broadcast.create', resourceType: 'event', resourceId: row.id, meta: { audience: aud.audienceKind } });
  return row;
}

export async function updateSession(p: Principal | null, id: string, raw: unknown) {
  await assertAction(p, 'broadcast.configure', 'broadcast.update');
  const e = await getSession(p, id);
  if (!e) throw new InputError('Session not found.');
  const i = parse(sessionSchema.extend({ status: z.enum(['scheduled', 'live', 'ended', 'cancelled']) }), raw);
  if (i.endsAt && i.endsAt <= i.startsAt) throw new InputError('The end time must be after the start time.');
  await db.update(schema.events).set({ title: i.title, description: i.description ?? null, kind: i.kind, startsAt: i.startsAt, endsAt: i.endsAt ?? null, joinInfo: i.joinInfo ?? null, status: i.status }).where(eq(schema.events.id, id));
  await audit({ actorId: p!.userId, action: 'broadcast.update', resourceType: 'event', resourceId: id, meta: { status: i.status } });
}

type Aud = { audienceKind: (typeof schema.media.$inferInsert)['audienceKind']; audienceOrgId: string | null; audienceProduct: string | null };
/** The narrowest audience that covers no one outside any of the sessions: identical audiences stay as they are, otherwise employees-only unless every session targets the same product (or the public). */
export function narrowestAudience(auds: Aud[]): Aud {
  const key = (a: Aud) => `${a.audienceKind}|${a.audienceProduct ?? ''}`;
  if (new Set(auds.map(key)).size === 1) return { audienceKind: auds[0].audienceKind, audienceOrgId: null, audienceProduct: auds[0].audienceProduct };
  const nonPublic = auds.filter((a) => a.audienceKind !== 'public');
  if (nonPublic.length && nonPublic.every((a) => a.audienceKind === 'product' && a.audienceProduct === nonPublic[0].audienceProduct)) return { audienceKind: 'product', audienceOrgId: null, audienceProduct: nonPublic[0].audienceProduct };
  return { audienceKind: 'employees', audienceOrgId: null, audienceProduct: null };
}

/** A recording may be attached to several sessions; the shared media row always carries the NARROWEST audience of every session that references it, so no session widens another's recording. */
async function alignRecording(mediaId: string, extra: { publish?: boolean } = {}) {
  const refs = await db.select({ audienceKind: schema.events.audienceKind, audienceOrgId: schema.events.audienceOrgId, audienceProduct: schema.events.audienceProduct }).from(schema.events).where(eq(schema.events.recordingMediaId, mediaId));
  if (!refs.length) return null;
  const aud = narrowestAudience(refs);
  await db.update(schema.media).set({ ...aud, ...(extra.publish ? { status: 'published' as const } : {}) }).where(eq(schema.media.id, mediaId));
  return aud;
}

/** Changing the audience also re-aligns an attached recording, so a recording is never visible to a wider audience than its session. */
export async function setSessionAudience(p: Principal | null, id: string, raw: unknown) {
  await assertAction(p, 'broadcast.configure', 'broadcast.audience');
  const e = await getSession(p, id);
  if (!e) throw new InputError('Session not found.');
  const aud = await resolveAudience(raw);
  await db.update(schema.events).set(aud).where(eq(schema.events.id, id));
  if (e.recordingMediaId) await alignRecording(e.recordingMediaId);
  await audit({ actorId: p!.userId, action: 'broadcast.audience', resourceType: 'event', resourceId: id, meta: { from: e.audienceKind, to: aud.audienceKind, product: aud.audienceProduct, recordingAligned: !!e.recordingMediaId } });
}

export async function attachRecording(p: Principal | null, id: string, mediaId: unknown) {
  await assertAction(p, 'broadcast.configure', 'broadcast.recording');
  const mid = parse(text(1, 80, 'Recording'), mediaId);
  const e = await getSession(p, id);
  if (!e) throw new InputError('Session not found.');
  const [m] = await db.select({ id: schema.media.id, kind: schema.media.kind, audienceKind: schema.media.audienceKind }).from(schema.media).where(eq(schema.media.id, mid));
  const [shared] = await db.select({ id: schema.events.id }).from(schema.events).where(and(eq(schema.events.recordingMediaId, mid), ne(schema.events.id, id))).limit(1);
  // Tenant-private ('org'), community and metadata-less media can never be re-audienced by a publisher: refuse, and say nothing more.
  if (!m || m.kind !== 'video' || !SESSION_AUDIENCES.includes(m.audienceKind as never)) throw new InputError('Choose an existing video recording.');
  const previous = e.recordingMediaId;
  await db.update(schema.events).set({ recordingMediaId: mid }).where(eq(schema.events.id, id));
  // Media already used by another session keeps its status; the audience becomes the narrowest across all sessions using it.
  const aud = await alignRecording(mid, { publish: !shared });
  if (previous && previous !== mid) await alignRecording(previous);
  await audit({ actorId: p!.userId, action: 'broadcast.recording', resourceType: 'event', resourceId: id, meta: { mediaId: mid, audience: e.audienceKind, mediaAudience: aud?.audienceKind, sharedWithOtherSession: !!shared } });
}

export async function detachRecording(p: Principal | null, id: string) {
  await assertAction(p, 'broadcast.configure', 'broadcast.recording');
  const e = await getSession(p, id);
  if (!e) throw new InputError('Session not found.');
  await db.update(schema.events).set({ recordingMediaId: null }).where(eq(schema.events.id, id));
  if (e.recordingMediaId) await alignRecording(e.recordingMediaId); // remaining sessions (if any) define the audience
  await audit({ actorId: p!.userId, action: 'broadcast.recording', resourceType: 'event', resourceId: id, meta: { detached: e.recordingMediaId } });
}

/** Videos a publisher may attach (titles only). Client-private, community and metadata-less media are never listed. */
export async function listAttachableVideos(p: Principal | null) {
  await assertAction(p, 'broadcast.configure', 'broadcast.recording_list');
  return db.select({ id: schema.media.id, title: schema.media.title }).from(schema.media).where(and(eq(schema.media.kind, 'video'), inArray(schema.media.audienceKind, [...SESSION_AUDIENCES]))).orderBy(desc(schema.media.createdAt)).limit(100);
}
