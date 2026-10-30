import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader, fmtDate } from '@/components/ui';
import { listPublicEvents, type PublicEvent } from '@/lib/public/events';
import { mediaUrl } from '@/lib/public/media';

export const metadata = { title: 'Live', description: 'Public webinars and recordings.' };

function EventCard({ e }: { e: PublicEvent }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2"><Badge tone={e.status === 'live' ? 'clay' : 'neutral'}>{e.status === 'live' ? 'Live now' : e.kind}</Badge><span className="text-sm text-muted">{fmtDate(e.startsAt)}</span></div>
      <h3 className="mt-2 text-lg font-semibold">{e.title}</h3>
      {e.description && <p className="mt-1 text-sm text-muted">{e.description}</p>}
      {e.joinInfo && <p className="mt-3 rounded-lg bg-brown-50 px-3 py-2 text-sm text-brown-800">{e.joinInfo}</p>}
      {e.recordingId && <p className="mt-3 flex flex-wrap gap-3 text-sm font-semibold"><Link href={`/media/${e.recordingId}`}>Watch recording</Link><a href={mediaUrl(e.recordingId)} className="font-normal text-muted">Raw file</a></p>}
    </Card>
  );
}

export default async function LivePage() {
  const { upcoming, past } = await listPublicEvents();
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="azentio.ai Live" title="Conversations Where Intelligence Comes Alive." description="Public sessions only. Client briefings and internal broadcasts are available after signing in, to the audiences they are meant for." />
      <section aria-labelledby="up"><h2 id="up" className="mb-3 text-xl font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? <EmptyState title="No public sessions scheduled">Check back soon, or <Link href="/connect">tell us what you would like to see</Link>.</EmptyState> : <ul className="grid gap-4 md:grid-cols-2">{upcoming.map((e) => <li key={e.id}><EventCard e={e} /></li>)}</ul>}
      </section>
      {past.length > 0 && <section aria-labelledby="past"><h2 id="past" className="mb-3 text-xl font-semibold">Recent</h2><ul className="grid gap-4 md:grid-cols-2">{past.map((e) => <li key={e.id}><EventCard e={e} /></li>)}</ul></section>}
    </div>
  );
}
