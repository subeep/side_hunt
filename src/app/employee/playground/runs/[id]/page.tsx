import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, Field, fmtDate, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { DataTable, Stepper, SYNTHETIC_BANNER } from '@/components/employee/DataTable';
import { requireAction } from '@/lib/authz/guards';
import { getMyRun, FEEDBACK_RATINGS } from '@/lib/employee/playground';
import { getScenario } from '@/lib/scenarios';
import { feedbackAction } from '../../actions';

export const metadata = { title: 'Playground run' };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireAction('playground.use');
  const run = await getMyRun(p, (await params).id);
  if (!run) notFound(); // someone else's run looks exactly like a missing one
  const def = getScenario(run.scenarioSlug);
  const r = run.result;
  return (
    <div>
      <PageHeader eyebrow="Playground run" title={def?.title ?? run.scenarioSlug} description={`Run on ${fmtDate(run.createdAt)}. Saved to your run history only.`} actions={<Link href={`/employee/playground/${run.scenarioSlug}`} className="btn btn-secondary btn-sm">Run again</Link>} />
      <EmployeeNav current="/employee/playground" />
      <Stepper steps={['Choose offering', 'Inspect inputs', 'Run', 'Review evidence', 'Feedback']} current={run.feedback?.rating ? 4 : 3} />
      <Alert tone="warn" className="mb-6"><strong>{r.label}</strong> {SYNTHETIC_BANNER.split('. ').slice(1).join('. ')}</Alert>

      <section aria-labelledby="result" className="mb-8">
        <h2 id="result" className="mb-3 text-xl">Simulated result</h2>
        <Card><p className="text-[1.02rem] leading-relaxed">{r.summary}</p></Card>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {r.metrics.map((m) => (
            <div key={m.label} className="card"><dt className="text-xs font-semibold uppercase tracking-wider text-muted">{m.label}</dt><dd className="mt-1 font-serif text-xl text-brown-900">{m.value}</dd></div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="evidence" className="mb-8">
        <h2 id="evidence" className="mb-3 text-xl">Evidence</h2>
        <ul className="space-y-2">
          {r.evidence.map((e) => (
            <li key={e.title} className="card"><p className="font-medium text-brown-900">{e.title}</p><p className="mt-1 text-sm text-muted">{e.detail}</p></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="data" className="mb-8 space-y-5">
        <h2 id="data" className="text-xl">Synthetic data inspected</h2>
        {r.sampleData.map((s) => <DataTable key={s.title} title={s.title} rows={s.rows} />)}
        <p className="text-sm text-muted">Inputs used: {Object.entries(r.inputs).map(([k, v]) => `${k} = ${v}`).join(', ')}</p>
      </section>

      <section aria-labelledby="explain" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2"><h2 id="explain" className="text-xl">Plain-language explanation</h2><Badge tone="neutral">{run.explanation.mode}</Badge></div>
        <Card><p className="text-sm leading-relaxed">{run.explanation.text}</p><p className="hint mt-2">Generated deterministically from the result above. No external AI service was called and no data left this application.</p></Card>
      </section>

      <section aria-labelledby="feedback" className="card max-w-2xl">
        <h2 id="feedback" className="mb-1 text-xl">Your feedback</h2>
        <p className="mb-4 text-sm text-muted">{run.feedback?.rating ? 'You can update your feedback at any time.' : 'Was this scenario useful for understanding the offering?'}</p>
        <ActionForm action={feedbackAction} submit="Save feedback">
          <input type="hidden" name="runId" value={run.id} />
          <fieldset>
            <legend className="label">Rating</legend>
            <div className="flex flex-wrap gap-4">
              {FEEDBACK_RATINGS.map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="rating" value={v} defaultChecked={run.feedback?.rating === v} required /> {v.replace('_', ' ')}</label>
              ))}
            </div>
          </fieldset>
          <Field label="Comment (optional)" htmlFor="comment" hint="Up to 1000 characters. Do not paste real customer data."><textarea id="comment" name="comment" className="textarea" maxLength={1000} defaultValue={run.feedback?.comment ?? ''} /></Field>
        </ActionForm>
      </section>
    </div>
  );
}
