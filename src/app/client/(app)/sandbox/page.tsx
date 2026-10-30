import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader, fmtDate } from '@/components/ui';
import { requireClientAccepted } from '@/lib/client/guard';
import { listEntitledOfferings } from '@/lib/client/dashboard';
import { listRuns, scenariosFor } from '@/lib/client/sandbox';

export const metadata = { title: 'Sandbox' };

export default async function SandboxIndex() {
  const p = await requireClientAccepted();
  const [offerings, runs] = await Promise.all([listEntitledOfferings(p), listRuns(p, { limit: 5 })]);
  const admin = p.activeOrgRole === 'client_admin';
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Sandbox" title="Entitled sandboxes" description="Try your entitled offerings on synthetic scenarios. Outputs are simulated illustrations, never credit or business decisions. Runs are private to you; administrators can see all runs of this organisation." />
      {offerings.length === 0 ? (
        <EmptyState title="No sandboxes are available to your organisation" action={<Link className="btn btn-secondary btn-sm" href="/client/support">Contact support</Link>}>Your organisation has no enabled offerings yet. Entitlements are managed by Azentio.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {offerings.map((o) => {
            const n = scenariosFor(o.slug).length;
            return (
              <Card key={o.slug} href={`/client/sandbox/${o.slug}`}>
                <div className="flex items-start justify-between gap-2"><p className="eyebrow">{o.category}</p><Badge tone="amber">Synthetic data</Badge></div>
                <p className="mt-1 font-serif text-xl text-brown-900">{o.name}</p>
                <p className="mt-1 text-sm text-muted">{o.summary}</p>
                <p className="mt-3 text-sm font-semibold text-brown-700">{n ? `${n} scenario${n > 1 ? 's' : ''} →` : 'No scenarios published yet'}</p>
              </Card>
            );
          })}
        </div>
      )}
      <section aria-labelledby="runs-h">
        <div className="mb-3 flex items-baseline justify-between"><h2 id="runs-h" className="text-2xl">{admin ? `Recent runs in ${p.activeOrgName}` : 'My recent runs'}</h2><Link href="/client/sandbox/runs" className="text-sm">All runs</Link></div>
        {runs.length === 0 ? (
          <EmptyState title="No runs yet">Run a scenario and it is saved here automatically.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {runs.map((r) => (
              <li key={r.id}><Card href={`/client/sandbox/runs/${r.id}`}><p className="font-medium text-brown-900">{r.scenarioSlug}</p><p className="text-sm text-muted">{r.offeringSlug} · {fmtDate(r.createdAt)}{admin && r.userName ? ` · ${r.userName}` : ''}</p></Card></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
