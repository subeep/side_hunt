import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader, fmtDate } from '@/components/ui';
import { requireClientAccepted } from '@/lib/client/guard';
import { listRuns } from '@/lib/client/sandbox';

export const metadata = { title: 'Run history' };

export default async function RunHistory() {
  const p = await requireClientAccepted();
  const runs = await listRuns(p, { limit: 100 });
  const admin = p.activeOrgRole === 'client_admin';
  return (
    <div>
      <PageHeader eyebrow="Sandbox" title={admin ? `All runs in ${p.activeOrgName}` : 'My runs'} description={admin ? 'As an administrator you can read every run of this organisation. Other organisations’ runs are never visible.' : 'You see only the runs you made. Administrators of your organisation can also read them.'} actions={<Link href="/client/sandbox" className="btn btn-secondary btn-sm">Sandbox</Link>} />
      {runs.length === 0 ? (
        <EmptyState title="No runs yet" action={<Link className="btn btn-primary btn-sm" href="/client/sandbox">Start a scenario</Link>}>Your simulated runs are saved here automatically.</EmptyState>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => (
            <Card key={r.id} href={`/client/sandbox/runs/${r.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-brown-900">{r.scenarioSlug}</p><div className="flex gap-2"><Badge tone="amber">Simulated</Badge>{r.feedback?.rating && <Badge tone="sage">Feedback given</Badge>}</div></div>
              <p className="mt-1 text-sm text-muted">{r.offeringSlug} · {fmtDate(r.createdAt)}{admin && r.userName ? ` · run by ${r.userName}` : ''}</p>
              {typeof r.output.summary === 'string' && <p className="mt-2 text-sm">{r.output.summary}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
