import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, EmptyState, PageHeader, fmtDate } from '@/components/ui';
import { ActionForm } from '@/components/client/ActionForm';
import { RunForm } from '@/components/client/RunForm';
import { requireClientAccepted } from '@/lib/client/guard';
import { getEntitledOffering, getRun, listRuns, listSavedScenarios, scenariosFor, SIMULATED_LABEL } from '@/lib/client/sandbox';
import { deleteSavedAction, runAction } from '../actions';

export const metadata = { title: 'Sandbox scenario' };

export default async function OfferingSandbox({ params, searchParams }: { params: Promise<{ offering: string }>; searchParams: Promise<{ scenario?: string; saved?: string; run?: string }> }) {
  const p = await requireClientAccepted();
  const { offering: slug } = await params;
  const sp = await searchParams;
  const offering = await getEntitledOffering(p, slug); // entitlement via authorize('sandbox.use'); a non-entitled slug is denied + audited
  if (!offering) notFound();

  const scenarios = scenariosFor(slug);
  const def = scenarios.find((s) => s.slug === sp.scenario) ?? scenarios[0];
  const [saved, runs] = await Promise.all([listSavedScenarios(p, slug), listRuns(p, { offeringSlug: slug, limit: 5 })]);
  let values: Record<string, unknown> = {};
  const savedPick = saved.find((s) => s.id === sp.saved && s.scenarioSlug === def?.slug);
  if (savedPick) values = savedPick.inputs;
  else if (sp.run) {
    const r = await getRun(p, sp.run); // org + user checked
    if (r && r.offeringSlug === slug && r.scenarioSlug === def?.slug) values = r.inputs;
  }
  const admin = p.activeOrgRole === 'client_admin';

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={offering.category} title={offering.name} description={offering.summary} actions={<Link href="/client/sandbox" className="btn btn-secondary btn-sm">All sandboxes</Link>} />
      <Alert tone="warn"><strong>Synthetic sandbox.</strong> {SIMULATED_LABEL} Inputs and outputs here use sample data only.</Alert>

      {!def ? (
        <EmptyState title="No scenarios are published for this offering yet">Check back soon. Nothing is wrong with your access.</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-5">
            {scenarios.length > 1 && (
              <nav aria-label="Scenarios" className="subnav flex flex-wrap gap-1">
                {scenarios.map((s) => (<Link key={s.slug} href={`/client/sandbox/${slug}?scenario=${s.slug}`} aria-current={s.slug === def.slug ? 'page' : undefined}>{s.title}</Link>))}
              </nav>
            )}
            <Card>
              <h2 className="text-xl">{def.title}</h2>
              <p className="mt-1 text-sm text-muted">{def.description}</p>
              <p className="mt-2 text-xs text-muted"><Badge tone="amber">Synthetic data</Badge> {def.syntheticDataNote}</p>
              <div className="mt-5"><RunForm key={`${def.slug}-${sp.saved ?? sp.run ?? ''}`} def={def} values={values} action={runAction} /></div>
            </Card>
          </div>
          <aside className="space-y-5">
            <Card>
              <h2 className="text-lg">Saved scenarios</h2>
              {saved.length === 0 ? <p className="mt-2 text-sm text-muted">None yet. After a run you can save its inputs under a name. Saved scenarios are private to you.</p> : (
                <ul className="mt-3 space-y-3">
                  {saved.map((s) => (
                    <li key={s.id} className="flex items-start justify-between gap-2 text-sm">
                      <div><Link href={`/client/sandbox/${slug}?scenario=${s.scenarioSlug}&saved=${s.id}`} className="font-medium">{s.name}</Link><p className="text-xs text-muted">{fmtDate(s.createdAt)}</p></div>
                      <ActionForm action={deleteSavedAction} submit="Delete" buttonClass="btn-ghost btn-sm" confirm="Delete this saved scenario?"><input type="hidden" name="id" value={s.id} /></ActionForm>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="text-lg">{admin ? 'Recent runs (organisation)' : 'My recent runs'}</h2>
              {runs.length === 0 ? <p className="mt-2 text-sm text-muted">No runs of this offering yet.</p> : (
                <ul className="mt-3 space-y-2 text-sm">{runs.map((r) => (<li key={r.id}><Link href={`/client/sandbox/runs/${r.id}`}>{fmtDate(r.createdAt)}</Link>{admin && r.userName ? <span className="text-muted"> · {r.userName}</span> : null}</li>))}</ul>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
