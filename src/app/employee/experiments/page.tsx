import { Badge, Card, EmptyState, Field, fmtDay, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireEmployee } from '@/lib/authz/guards';
import { feedbackCounts, listItems } from '@/lib/employee/items';
import { createExperimentAction } from './actions';

export const metadata = { title: 'Experiments' };
const tone = { proposed: 'amber', running: 'sage', concluded: 'brown', parked: 'neutral' } as const;

export default async function ExperimentsPage() {
  const p = await requireEmployee();
  const [items, counts] = await Promise.all([listItems(p, 'experiment'), feedbackCounts(p, 'experiment')]);
  return (
    <div>
      <PageHeader eyebrow="Employee portal" title="Experiments" description="Internal experiments with their hypothesis, status and peer feedback. Employees only: never shown to clients or indexed for search." />
      <EmployeeNav current="/employee/experiments" />
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <section aria-labelledby="list">
          <h2 id="list" className="mb-3 text-xl">All experiments</h2>
          {items.length === 0 ? <EmptyState title="No experiments yet">Submit the first one using the form.</EmptyState> : (
            <ul className="space-y-3">
              {items.map((x) => (
                <li key={x.id}>
                  <Card href={`/employee/experiments/${x.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-serif text-lg text-brown-900">{x.title}</span><Badge tone={tone[x.status as keyof typeof tone] ?? 'neutral'}>{x.status}</Badge></div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{x.body}</p>
                    <p className="mt-2 text-xs text-muted">Owner {x.ownerName} · updated {fmtDay(x.updatedAt)} · {counts.get(x.id) ?? 0} feedback</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="new" className="card h-fit">
          <h2 id="new" className="mb-4 text-lg">Submit an experiment</h2>
          <ActionForm action={createExperimentAction} submit="Submit experiment">
            <Field label="Title" htmlFor="title"><input id="title" name="title" className="input" required minLength={3} maxLength={120} /></Field>
            <Field label="What are you trying?" htmlFor="body" hint="10 to 4000 characters. Use synthetic data only."><textarea id="body" name="body" className="textarea" required minLength={10} maxLength={4000} /></Field>
            <Field label="Hypothesis (optional)" htmlFor="hypothesis"><input id="hypothesis" name="hypothesis" className="input" maxLength={500} /></Field>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
