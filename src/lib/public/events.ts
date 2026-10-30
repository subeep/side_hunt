import { and, asc, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/db';
import { publicMediaIds } from './media';

const e = schema.events;
export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  joinInfo: string | null;
  recordingId: string | null;
}

/**
 * /live: PUBLIC events only (explicit audience 'public'). A recording link is included only if that media is itself
 * visible to an anonymous visitor (public + published), so an event can never leak a private recording id.
 */
export async function listPublicEvents(now = new Date()): Promise<{ upcoming: PublicEvent[]; past: PublicEvent[] }> {
  const rows = await db
    .select({ id: e.id, title: e.title, description: e.description, kind: e.kind, startsAt: e.startsAt, endsAt: e.endsAt, status: e.status, joinInfo: e.joinInfo, recordingMediaId: e.recordingMediaId })
    .from(e)
    .where(and(eq(e.audienceKind, 'public'), ne(e.status, 'cancelled')))
    .orderBy(asc(e.startsAt));
  const visible = await publicMediaIds(rows.map((r) => r.recordingMediaId).filter((x): x is string => !!x));
  const all: PublicEvent[] = rows.map(({ recordingMediaId, ...r }) => ({
    ...r,
    joinInfo: r.status === 'ended' ? null : r.joinInfo,
    recordingId: recordingMediaId && visible.has(recordingMediaId) ? recordingMediaId : null,
  }));
  const isPast = (x: PublicEvent) => x.status === 'ended' || (x.endsAt ?? x.startsAt) < now;
  return { upcoming: all.filter((x) => !isPast(x)), past: all.filter(isPast).reverse() };
}
