import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, Field, PageHeader, fmtDate } from '@/components/ui';
import { ActionForm } from '@/components/client/ActionForm';
import { RunResult } from '@/components/client/RunResult';
import { requireClientAccepted } from '@/lib/client/guard';
import { FEEDBACK_RATINGS, FEEDBACK_TOPICS, getRun, scenariosFor } from '@/lib/client/sandbox';
import { feedbackAction, saveScenarioAction } from '../../actions';

export const metadata = { title: 'Sandbox run' };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireClientAccepted();
  const { id } = await params;
  const run = await getRun(p, id); // verifies ORG and USER (owner or this org's administrator); anything else is a 404
  if (!run) notFound();
  const def = scenariosFor(run.offeringSlug).find((s) => s.slug === run.scenarioSlug);
  const labels = Object.fromEntries((def?.fields ?? []).map((f) => [f.key, f.label]));
  const mine = run.userId === p.userId;
  const fb = run.feedback;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sandbox run" title={def?.title ?? run.scenarioSlug} description={`${run.offeringSlug} · ${fmtDate(run.createdAt)}${mine ? '' : ` · run by ${run.userName ?? 'a colleague'}`}`} actions={<><Link href="/client/sandbox/runs" className="btn btn-secondary btn-sm">Run history</Link><Link href={`/client/sandbox/${run.offeringSlug}?scenario=${run.scenarioSlug}&run=${run.id}`} className="btn btn-primary btn-sm">Run again with these inputs</Link></>} />
      <RunResult run={run} labels={labels} />

      <Card>
        <h2 className="text-xl">Feedback on this run</h2>
        {!mine ? (
          <p className="mt-2 text-sm text-muted">{fb?.rating ? `Rated “${FEEDBACK_RATINGS[fb.rating as keyof typeof FEEDBACK_RATINGS] ?? fb.rating}” by ${run.userName ?? 'the person who ran it'}.` : 'Only the person who ran this scenario can leave feedback on it.'}</p>
        ) : (
          <>
            {fb?.rating && <Alert tone="ok" className="mt-3">Saved: <strong>{FEEDBACK_RATINGS[fb.rating as keyof typeof FEEDBACK_RATINGS] ?? fb.rating}</strong>{fb.topic ? ` · ${FEEDBACK_TOPICS[fb.topic as keyof typeof FEEDBACK_TOPICS] ?? fb.topic}` : ''}{fb.comment ? ` · “${fb.comment}”` : ''}. You can update it below.</Alert>}
            <ActionForm action={feedbackAction} submit={fb?.rating ? 'Update feedback' : 'Send feedback'} className="mt-3 space-y-3">
              <input type="hidden" name="runId" value={run.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="How useful was this run?" htmlFor="rating"><select id="rating" name="rating" required defaultValue={fb?.rating ?? ''} className="select"><option value="" disabled>Choose…</option>{Object.entries(FEEDBACK_RATINGS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="What is it about?" htmlFor="topic"><select id="topic" name="topic" required defaultValue={fb?.topic ?? ''} className="select"><option value="" disabled>Choose…</option>{Object.entries(FEEDBACK_TOPICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              </div>
              <Field label="Comment (optional)" htmlFor="comment" hint="Up to 500 characters. Please do not include real customer data."><textarea id="comment" name="comment" maxLength={500} rows={2} defaultValue={fb?.comment ?? ''} className="textarea !min-h-[4.5rem]" /></Field>
            </ActionForm>
          </>
        )}
      </Card>

      {def && (
        <Card>
          <h2 className="text-xl">Save these inputs</h2>
          <p className="mt-1 text-sm text-muted">Keep the inputs of this run as a named scenario. Saved scenarios are private to you in <Badge tone="neutral">{p.activeOrgName}</Badge>.</p>
          <ActionForm action={saveScenarioAction} submit="Save scenario" buttonClass="btn-secondary" className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="runId" value={run.id} />
            <Field label="Scenario name" htmlFor="name"><input id="name" name="name" required minLength={2} maxLength={80} className="input" /></Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
