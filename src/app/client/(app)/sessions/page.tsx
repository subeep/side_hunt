import { AudienceChip, Badge, Card, EmptyState, PageHeader, fmtDate } from '@/components/ui';
import { requireClientAccepted } from '@/lib/client/guard';
import { isUpcoming, listSessions, type ClientSession } from '@/lib/client/sessions';

export const metadata = { title: 'Sessions' };
const KIND: Record<string, string> = { live: 'Live session', webinar: 'Webinar', briefing: 'Briefing' };

function SessionCard({ s, orgName }: { s: ClientSession; orgName: string }) {
  return (
    <Card href={`/client/sessions/${s.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-brown-900">{s.title}</p>
        <div className="flex gap-2"><Badge tone="neutral">{KIND[s.kind] ?? s.kind}</Badge><AudienceChip kind={s.audienceKind} orgName={orgName} /></div>
      </div>
      <p className="mt-1 text-sm text-muted">{fmtDate(s.startsAt)}{s.status === 'live' ? ' · live now' : ''}{s.status === 'cancelled' ? ' · cancelled' : ''}</p>
      {s.description && <p className="mt-2 text-sm">{s.description}</p>}
      {s.recordingUrl && <p className="mt-2 text-sm font-semibold text-brown-700">Recording available →</p>}
    </Card>
  );
}

export default async function SessionsPage() {
  const p = await requireClientAccepted();
  const all = await listSessions(p);
  const upcoming = all.filter((s) => isUpcoming(s));
  const past = all.filter((s) => !isUpcoming(s)).reverse();
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Sessions" title="Sessions, briefings and webinars" description="Only sessions your organisation or entitled products qualify for are listed. Join details appear on the session page while it can still be joined, and only to people its audience permits." />
      <section aria-labelledby="up-h">
        <h2 id="up-h" className="mb-3 text-2xl">Upcoming</h2>
        {upcoming.length === 0 ? <EmptyState title="No upcoming sessions">Nothing is scheduled for your workspace right now.</EmptyState> : <div className="grid gap-4 md:grid-cols-2">{upcoming.map((s) => <SessionCard key={s.id} s={s} orgName={p.activeOrgName!} />)}</div>}
      </section>
      <section aria-labelledby="past-h">
        <h2 id="past-h" className="mb-3 text-2xl">Past sessions and recordings</h2>
        {past.length === 0 ? <EmptyState title="No past sessions yet">Recordings you are permitted to watch will appear here.</EmptyState> : <div className="grid gap-4 md:grid-cols-2">{past.map((s) => <SessionCard key={s.id} s={s} orgName={p.activeOrgName!} />)}</div>}
      </section>
    </div>
  );
}
