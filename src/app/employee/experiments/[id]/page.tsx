import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, EmptyState, Field, fmtDate, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireEmployee } from '@/lib/authz/guards';
import { EXPERIMENT_STATUSES, getItem, listFeedback, RATINGS } from '@/lib/employee/items';
import { experimentFeedbackAction, statusAction } from '../actions';

export const metadata = { title: 'Experiment' };

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireEmployee();
  const x = await getItem(p, 'experiment', (await params).id);
  if (!x) notFound();
  const fb = await listFeedback(p, 'experiment', x.id);
  const owner = x.ownerId === p.userId;
  const hypothesis = (x.meta as { hypothesis?: string } | null)?.hypothesis;
  return (
    <div>
      <PageHeader eyebrow="Experiment" title={x.title} description={`Owner ${x.ownerName} · updated ${fmtDate(x.updatedAt)}`} actions={<Link href="/employee/experiments" className="btn btn-secondary btn-sm">All experiments</Link>} />
      <EmployeeNav current="/employee/experiments" />
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <div className="space-y-6">
          <Card>
            <Badge tone="brown">{x.status}</Badge>
            <p className="mt-3 whitespace-pre-line leading-relaxed">{x.body}</p>
            {hypothesis && <p className="mt-4 rounded-lg bg-brown-50 p-3 text-sm"><strong>Hypothesis:</strong> {hypothesis}</p>}
          </Card>
          {owner && (
            <section className="card" aria-labelledby="status"><h2 id="status" className="mb-3 text-lg">Update status</h2>
              <ActionForm action={statusAction} submit="Update" inline>
                <input type="hidden" name="id" value={x.id} />
                <label className="sr-only" htmlFor="status-select">Status</label>
                <select id="status-select" name="status" className="select !w-auto" defaultValue={x.status}>{EXPERIMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              </ActionForm>
            </section>
          )}
          <section aria-labelledby="fb"><h2 id="fb" className="mb-3 text-xl">Feedback</h2>
            {Object.keys(fb.tally).length > 0 && <p className="mb-3 flex flex-wrap gap-2 text-sm">{Object.entries(fb.tally).map(([k, n]) => <Badge key={k} tone="neutral">{k.replace('_', ' ')} · {n}</Badge>)}</p>}
            {fb.rows.length === 0 ? <EmptyState title="No feedback yet">Be the first to respond.</EmptyState> : (
              <ul className="space-y-2">{fb.rows.map((r, i) => <li key={i} className="card"><p className="text-sm"><strong>{r.name ?? 'Colleague'}</strong> <Badge tone="neutral">{r.rating?.replace('_', ' ')}</Badge></p>{r.comment && <p className="mt-1 text-sm text-muted">{r.comment}</p>}</li>)}</ul>
            )}
          </section>
        </div>
        <section className="card h-fit" aria-labelledby="give"><h2 id="give" className="mb-4 text-lg">{fb.mine ? 'Update your feedback' : 'Give feedback'}</h2>
          <ActionForm action={experimentFeedbackAction} submit="Save feedback">
            <input type="hidden" name="id" value={x.id} />
            <fieldset><legend className="label">Your view</legend>
              <div className="flex flex-col gap-2">{RATINGS.experiment.map((v) => <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="rating" value={v} defaultChecked={fb.mine?.rating === v} required /> {v.replace('_', ' ')}</label>)}</div>
            </fieldset>
            <Field label="Comment (optional)" htmlFor="comment"><textarea id="comment" name="comment" className="textarea" maxLength={1000} defaultValue={fb.mine?.comment ?? ''} /></Field>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
