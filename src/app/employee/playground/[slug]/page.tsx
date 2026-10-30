import { notFound } from 'next/navigation';
import { Alert, Field, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { DataTable, Stepper, SYNTHETIC_BANNER } from '@/components/employee/DataTable';
import { requireAction } from '@/lib/authz/guards';
import { getScenario, runScenario } from '@/lib/scenarios';
import { runAction } from '../actions';

export const metadata = { title: 'Playground scenario' };

export default async function ScenarioPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAction('playground.use');
  const def = getScenario((await params).slug);
  if (!def) notFound();
  const preview = runScenario(def.slug, {}); // default inputs: lets the employee inspect the synthetic data before running
  return (
    <div>
      <PageHeader eyebrow="Playground" title={def.title} description={def.description} />
      <EmployeeNav current="/employee/playground" />
      <Stepper steps={['Choose offering', 'Inspect inputs', 'Run', 'Review evidence', 'Feedback']} current={1} />
      <Alert tone="warn" className="mb-6">{SYNTHETIC_BANNER} {def.syntheticDataNote}</Alert>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section aria-labelledby="inputs" className="card h-fit">
          <h2 id="inputs" className="mb-4 text-lg">2. Set the inputs</h2>
          <ActionForm action={runAction} submit="Run scenario" pendingText="Running…">
            <input type="hidden" name="slug" value={def.slug} />
            {def.fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.help} htmlFor={f.key}>
                {f.type === 'select' ? (
                  <select id={f.key} name={f.key} defaultValue={String(f.default)} className="select">
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input id={f.key} name={f.key} className="input" type={f.type === 'number' ? 'number' : 'text'} defaultValue={f.default} min={f.min} max={f.max} step={f.step} required />
                )}
              </Field>
            ))}
            <p className="hint">Values are validated and clamped on the server. The same inputs always give the same output.</p>
          </ActionForm>
        </section>
        <section aria-labelledby="data" className="min-w-0 space-y-5">
          <h2 id="data" className="text-lg">Synthetic data preview (default inputs)</h2>
          {preview.sampleData.map((s) => <DataTable key={s.title} title={s.title} rows={s.rows} />)}
        </section>
      </div>
    </div>
  );
}
