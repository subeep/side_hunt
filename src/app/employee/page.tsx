import Link from 'next/link';
import { Alert, AudienceChip, Badge, Card, EmptyState, fmtDate, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { requireEmployee } from '@/lib/authz/guards';
import { getDashboard } from '@/lib/employee/dashboard';
import { myAssignedIdeas } from '@/lib/employee/ideas';

export const metadata = { title: 'Employee portal' };

const LINKS = [
  { href: '/employee/playground', title: 'Playground', text: 'Guided synthetic scenarios with evidence and feedback.' },
  { href: '/employee/live', title: 'Internal live sessions', text: 'Employees-only sessions and recordings.' },
  { href: '/employee/experiments', title: 'Experiments', text: 'Submit and review internal experiments.' },
  { href: '/employee/teams', title: 'Hackathon teams', text: 'Team spaces and shared notes.' },
  { href: '/employee/release-notes', title: 'Release notes', text: 'What changed in the prototype.' },
  { href: '/employee/knowledge', title: 'Knowledge library', text: 'Owned articles with review dates.' },
  { href: '/learn', title: 'Learning hub', text: 'Approved shared observations and themes.' },
];

export default async function EmployeeDashboard() {
  const p = await requireEmployee();
  const [d, ideas] = await Promise.all([getDashboard(p), myAssignedIdeas(p.userId)]);
  const grants = [...p.grants];
  return (
    <div>
      <PageHeader eyebrow="Employee portal" title={`Welcome, ${p.name.split(' ')[0]}`} description="Internal experiments, broadcasts and the synthetic Playground. Employee status does not give you access to any client's private information." />
      <EmployeeNav current="/employee" />
      <section aria-labelledby="links" className="mb-10">
        <h2 id="links" className="sr-only">Quick links</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LINKS.map((l) => (
            <Card key={l.href} href={l.href}>
              <p className="font-serif text-lg text-brown-900">{l.title}</p>
              <p className="mt-1 text-sm text-muted">{l.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="sessions">
          <h2 id="sessions" className="mb-3 text-xl">Upcoming internal sessions</h2>
          {d.upcoming.length === 0 ? <EmptyState title="No internal sessions scheduled">Publishers with the video_publisher grant schedule these.</EmptyState> : (
            <ul className="space-y-2">
              {d.upcoming.map((e) => (
                <li key={e.id}><Card href={`/employee/live/${e.id}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-brown-900">{e.title}</span><AudienceChip kind="employees" /></div><p className="mt-1 text-sm text-muted">{fmtDate(e.startsAt)}</p></Card></li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ideas">
          <h2 id="ideas" className="mb-3 text-xl">Improvement ideas assigned to me</h2>
          {ideas.length === 0 ? <EmptyState title="No ideas assigned">Ideas appear here when a product owner assigns you as owner.</EmptyState> : (
            <ul className="space-y-2">
              {ideas.map((i) => (
                <li key={i.id}><Card href={`/learn/ideas/${i.id}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-brown-900">{i.title}</span><Badge tone="neutral">{i.status}</Badge></div>{i.latestUpdate && <p className="mt-1 text-sm text-muted">{i.latestUpdate}</p>}</Card></li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="mine">
          <h2 id="mine" className="mb-3 text-xl">My experiments</h2>
          {d.experiments.length === 0 ? <EmptyState title="You have not submitted an experiment" action={<Link href="/employee/experiments" className="btn btn-secondary btn-sm">Submit one</Link>} /> : (
            <ul className="space-y-2">
              {d.experiments.map((x) => (
                <li key={x.id}><Card href={`/employee/experiments/${x.id}`}><div className="flex items-center justify-between gap-2"><span className="font-medium text-brown-900">{x.title}</span><Badge tone="brown">{x.status}</Badge></div></Card></li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="public">
          <h2 id="public" className="mb-3 text-xl">Public product information</h2>
          <Card>
            <div className="mb-2 flex items-center gap-2"><AudienceChip kind="public" /></div>
            <p className="text-sm text-muted">What customers and visitors can see. Use this wording externally.</p>
            <Link href="/products" className="btn btn-secondary btn-sm mt-3">Open public products</Link>
          </Card>
        </section>
      </div>

      <section aria-labelledby="internal" className="mt-10 rounded-2xl border-2 border-brown-700/70 bg-brown-50 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="internal" className="text-xl">Internal prototype notes (employees only)</h2>
          <AudienceChip kind="employees" />
        </div>
        <Alert tone="warn" className="mb-4">Internal notes can describe unreleased behaviour. Do not copy them into public, client or search-indexed content.</Alert>
        {d.notes.length === 0 ? <p className="text-sm text-muted">No release notes yet.</p> : (
          <ul className="space-y-3">
            {d.notes.map((n) => (
              <li key={n.id}><p className="font-medium text-brown-900">{n.title}</p><p className="text-sm text-muted">{n.body}</p></li>
            ))}
          </ul>
        )}
        <Link href="/employee/release-notes" className="mt-4 inline-block text-sm font-semibold">All release notes</Link>
      </section>

      <section className="mt-8 text-sm text-muted" aria-label="Your permissions">
        <p>
          Your platform grants: {grants.length ? grants.map((g) => <Badge key={g} tone="neutral" className="mr-1">{g}</Badge>) : <strong>none</strong>}.
          {grants.length === 0 && ' Grants are given separately by a portal administrator.'}
        </p>
      </section>
    </div>
  );
}
