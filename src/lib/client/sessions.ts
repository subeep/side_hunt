import { and, asc, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '@/lib/auth/principal';
import { audit } from '@/lib/audit';
import { clientAudienceFilter, clientCanSee } from './audience';

const e = schema.events;
const m = schema.media;
const evCols = { kind: e.audienceKind, orgId: e.audienceOrgId, product: e.audienceProduct };
const mediaCols = { kind: m.audienceKind, orgId: m.audienceOrgId, product: m.audienceProduct };

export interface ClientSession {
  id: string;
  title: string;
  description: string | null;
  kind: 'live' | 'webinar' | 'briefing' | 'hackathon_session';
  startsAt: Date;
  endsAt: Date | null;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  audienceKind: string | null;
  audienceProduct: string | null;
  /** Only present while the session can still be joined AND the audience permits this principal. */
  joinInfo: string | null;
  /** /api/media/<id> only when the recording itself is published and visible to this principal. */
  recordingUrl: string | null;
}

const sessionCols = {
  id: e.id, title: e.title, description: e.description, kind: e.kind, startsAt: e.startsAt, endsAt: e.endsAt, status: e.status,
  audienceKind: e.audienceKind, audienceOrgId: e.audienceOrgId, audienceProduct: e.audienceProduct, joinInfo: e.joinInfo, recordingMediaId: e.recordingMediaId,
};
type Row = { id: string; title: string; description: string | null; kind: ClientSession['kind']; startsAt: Date; endsAt: Date | null; status: ClientSession['status']; audienceKind: string | null; audienceOrgId: string | null; audienceProduct: string | null; joinInfo: string | null; recordingMediaId: string | null };

async function visibleRecordings(p: Principal, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.select({ id: m.id }).from(m).where(and(eq(m.status, 'published'), clientAudienceFilter(mediaCols, p, { allowPublic: true })));
  const ok = new Set(rows.map((r) => r.id));
  return new Set(ids.filter((id) => ok.has(id)));
}

async function shape(p: Principal, rows: Row[]): Promise<ClientSession[]> {
  const recs = await visibleRecordings(p, rows.map((r) => r.recordingMediaId).filter((x): x is string => !!x));
  return rows.map((r) => ({
    id: r.id, title: r.title, description: r.description, kind: r.kind, startsAt: r.startsAt, endsAt: r.endsAt, status: r.status,
    audienceKind: r.audienceKind, audienceProduct: r.audienceProduct,
    joinInfo: r.status === 'scheduled' || r.status === 'live' ? r.joinInfo : null,
    recordingUrl: r.recordingMediaId && recs.has(r.recordingMediaId) ? `/api/media/${r.recordingMediaId}` : null,
  }));
}

/** Events visible to this principal (org / entitled product / explicit public), same rule as direct access. Never employee-only. */
export async function listSessions(p: Principal): Promise<ClientSession[]> {
  if (!p.activeOrgId) return [];
  const rows = await db.select(sessionCols).from(e).where(and(ne(e.kind, 'hackathon_session'), clientAudienceFilter(evCols, p, { allowPublic: true }))).orderBy(asc(e.startsAt));
  return shape(p, rows as Row[]);
}

export async function getSession(p: Principal, id: string): Promise<ClientSession | null> {
  if (!p.activeOrgId) return null;
  const [r] = await db.select(sessionCols).from(e).where(eq(e.id, id));
  if (!r) return null;
  if (r.kind === 'hackathon_session' || !clientCanSee(p, { kind: r.audienceKind, orgId: r.audienceOrgId, product: r.audienceProduct }, { allowPublic: true })) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'session.view', outcome: 'deny', resourceType: 'event', resourceId: id });
    return null;
  }
  return (await shape(p, [r as Row]))[0];
}

export const isUpcoming = (s: ClientSession, now = new Date()) => s.status !== 'cancelled' && s.status !== 'ended' && (s.endsAt ?? s.startsAt) >= now;
