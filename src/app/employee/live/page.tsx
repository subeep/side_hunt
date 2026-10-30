import Link from 'next/link';
import { Alert, AudienceChip, Badge, Card, EmptyState, fmtDate, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { AudienceFields, SessionFields } from '@/components/employee/SessionForm';
import { requireEmployee } from '@/lib/authz/guards';
import { canConfigure, listSessions, type EventRow } from '@/lib/employee/live';
import { db, schema } from '@/db';
import { createSessionAction } from './actions';

export const metadata = { title: 'Internal live sessions' };

function Row({ e }: { e: EventRow }) {
  return (
    <li>
      <Card href={`/employee/live/${e.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-brown-900">{e.title}</span>
          <span className="flex gap-2"><AudienceChip kind={e.audienceKind} />{e.status !== 'scheduled' && <Badge tone={e.status === 'live' ? 'sage' : 'neutral'}>{e.status}</Badge>}{e.recordingMediaId && <Badge tone="amber">Recording</Badge>}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{fmtDate(e.startsAt)} {e.description ? `· ${e.description}` : ''}</p>
      </Card>
    </li>
  );
}

export default async function LivePage() {
  const p = await requireEmployee();
  const { upcoming, past } = await listSessions(p);
  const manage = canConfigure(p);
  const products = manage ? await db.select({ slug: schema.products.slug, name: schema.products.name }).from(schema.products) : [];
  return (
    <div>
      <PageHeader eyebrow="Employee portal" title="Internal live sessions" description="Employees-only sessions and their recordings. Recordings play through an authorising media route, never a public link." />
      <EmployeeNav current="/employee/live" />
      {manage ? (
        <Alert tone="info" className="mb-6">You hold the <strong>video_publisher</strong> grant, so you can create and configure sessions, attach recordings and set audiences.</Alert>
      ) : (
        <Alert tone="info" className="mb-6">Sessions are read-only for you. Creating or changing a session needs the video_publisher grant from a portal administrator.</Alert>
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="up">
          <h2 id="up" className="mb-3 text-xl">Upcoming</h2>
          {upcoming.length ? <ul className="space-y-2">{upcoming.map((e) => <Row key={e.id} e={e} />)}</ul> : <EmptyState title="Nothing scheduled">New internal sessions show up here.</EmptyState>}
        </section>
        <section aria-labelledby="past">
          <h2 id="past" className="mb-3 text-xl">Past sessions and recordings</h2>
          {past.length ? <ul className="space-y-2">{past.map((e) => <Row key={e.id} e={e} />)}</ul> : <EmptyState title="No past sessions yet" />}
        </section>
      </div>
      {manage && (
        <section aria-labelledby="new" className="card mt-10 max-w-2xl">
          <h2 id="new" className="mb-4 text-xl">Create a session</h2>
          <ActionForm action={createSessionAction} submit="Create session">
            <SessionFields />
            <AudienceFields products={products} />
          </ActionForm>
        </section>
      )}
      <p className="mt-8 text-sm text-muted">Looking for public events? <Link href="/live">Public live page</Link>.</p>
    </div>
  );
}
