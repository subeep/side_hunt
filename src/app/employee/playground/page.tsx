import Link from 'next/link';
import { Alert, Badge, Card, EmptyState, fmtDate, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { Stepper, SYNTHETIC_BANNER } from '@/components/employee/DataTable';
import { requireEmployee } from '@/lib/authz/guards';
import { listMyRuns, listPlaygroundOfferings } from '@/lib/employee/playground';

export const metadata = { title: 'Playground' };

export default async function PlaygroundPage() {
  const p = await requireEmployee();
  const [offerings, runs] = await Promise.all([listPlaygroundOfferings(p), listMyRuns(p)]);
  const titleOf = new Map(offerings.flatMap((o) => o.scenarios.map((s) => [s.slug, s.title] as const)));
  return (
    <div>
      <PageHeader eyebrow="Employee portal" title="Playground" description="Choose an offering, inspect the synthetic inputs, run the scenario, review the evidence and tell us whether it helped." />
      <EmployeeNav current="/employee/playground" />
      <Stepper steps={['Choose offering', 'Inspect inputs', 'Run', 'Review evidence', 'Feedback']} current={0} />
      <Alert tone="warn" className="mb-6">{SYNTHETIC_BANNER}</Alert>

      <h2 className="mb-3 text-xl">1. Choose an offering</h2>
      {offerings.length === 0 ? <EmptyState title="No scenarios available">No active product has a scenario yet.</EmptyState> : (
        <div className="grid gap-4 md:grid-cols-2">
          {offerings.map((o) => (
            <Card key={o.slug}>
              <p className="font-serif text-lg text-brown-900">{o.name}</p>
              <p className="mt-1 text-sm text-muted">{o.tagline}</p>
              <ul className="mt-4 space-y-2">
                {o.scenarios.map((s) => (
                  <li key={s.slug} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm"><strong className="text-brown-900">{s.title}</strong><br /><span className="text-muted">{s.description}</span></span>
                    <Link href={`/employee/playground/${s.slug}`} className="btn btn-primary btn-sm">Start</Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-12 text-xl">My run history</h2>
      <p className="mb-3 text-sm text-muted">Only your own runs are listed. Other employees cannot open them.</p>
      {runs.length === 0 ? <EmptyState title="No runs yet">Your saved runs will appear here.</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="table-basic">
            <thead><tr><th scope="col">Scenario</th><th scope="col">When</th><th scope="col">Feedback</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{titleOf.get(r.scenarioSlug) ?? r.scenarioSlug}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td>{r.feedback?.rating ? <Badge tone="sage">{r.feedback.rating.replace('_', ' ')}</Badge> : <Badge tone="neutral">Not given</Badge>}</td>
                  <td><Link href={`/employee/playground/runs/${r.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
