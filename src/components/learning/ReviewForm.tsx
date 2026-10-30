'use client';
import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import clsx from 'clsx';
import type { FormState } from '@/lib/learning/result';
import { EVIDENCE_QUALITY, LIMITS } from '@/lib/learning/constants';
import { scanShared } from '@/lib/learning/sensitive';
import { Alert, Field } from '@/components/ui';
import { FlagList } from './SensitiveText';
import { DiffView } from './DiffView';

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
export interface SharedDraftValues { title: string; summary: string; industry: string; region: string; periodLabel: string; evidenceQuality: 'unassessed' | 'weak' | 'moderate' | 'strong'; includeAttribution: boolean; redactionNotes: string; reviewed: boolean }

function Btn({ formAction, className, children }: { formAction: (fd: FormData) => void; className?: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" formAction={formAction} disabled={pending} className={clsx('btn', className)}>{pending ? 'Working…' : children}</button>;
}

/** Editable SHARED representation with live original-vs-shared diff and residual-flag scan. Publish saves, then publishes. */
export function ReviewForm({
  contributionId, source, initial, attributionConsented, orgName, saveAction, publishAction,
}: {
  contributionId: string;
  source: { title: string; observation: string; industry: string | null; region: string | null; period: string | null };
  initial: SharedDraftValues;
  attributionConsented: boolean;
  orgName: string;
  saveAction: Action;
  publishAction: Action;
}) {
  const [save, saveFA] = useActionState(saveAction, {} as FormState);
  const [pub, pubFA] = useActionState(publishAction, {} as FormState);
  const [v, setV] = useState({ ...initial, evidenceQuality: initial.evidenceQuality === 'unassessed' ? '' : initial.evidenceQuality });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const flags = useMemo(() => scanShared(v), [v]);
  const err = { ...(save.errors ?? {}), ...(pub.errors ?? {}) };
  const state = pub.error || pub.errors ? pub : save;
  return (
    <form className="space-y-4">
      <input type="hidden" name="contributionId" value={contributionId} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="ok">{state.message}</Alert>}
      {!initial.reviewed && <Alert tone="warn">These fields are pre-filled from the private source. Redact and generalise them, then save: nothing pre-filled counts as reviewed until you save.</Alert>}
      <Field label="Shared title" htmlFor="title" error={err.title}><input id="title" name="title" className="input" required minLength={LIMITS.title.min} maxLength={LIMITS.title.max} value={v.title} onChange={set('title')} /></Field>
      <Field label="Shared summary" htmlFor="summary" error={err.summary} hint={`${v.summary.length}/${LIMITS.summary.max}. Describe the pattern only: no names, places, amounts, identifiers.`}>
        <textarea id="summary" name="summary" className="textarea min-h-40" required minLength={LIMITS.summary.min} maxLength={LIMITS.summary.max} value={v.summary} onChange={set('summary')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Industry (generalised)" htmlFor="industry" error={err.industry}><input id="industry" name="industry" className="input" maxLength={LIMITS.industry.max} value={v.industry} onChange={set('industry')} /></Field>
        <Field label="Region (generalised)" htmlFor="region" error={err.region}><input id="region" name="region" className="input" maxLength={LIMITS.region.max} value={v.region} onChange={set('region')} /></Field>
        <Field label="Period (generalised)" htmlFor="periodLabel" error={err.periodLabel}><input id="periodLabel" name="periodLabel" className="input" maxLength={LIMITS.period.max} value={v.periodLabel} onChange={set('periodLabel')} /></Field>
      </div>
      <Field label="Evidence quality (reviewer assessment)" htmlFor="evidenceQuality" error={err.evidenceQuality}>
        <select id="evidenceQuality" name="evidenceQuality" className="select" required value={v.evidenceQuality} onChange={set('evidenceQuality')}>
          <option value="" disabled>Assess…</option>
          {(['weak', 'moderate', 'strong'] as const).map((q) => <option key={q} value={q}>{EVIDENCE_QUALITY[q]}</option>)}
        </select>
      </Field>
      <label className={clsx('flex gap-2 text-sm', !attributionConsented && 'opacity-60')}>
        <input type="checkbox" name="includeAttribution" disabled={!attributionConsented} defaultChecked={initial.includeAttribution} className="mt-1" />
        <span>Credit “{orgName}” by name. {attributionConsented ? 'The contributor consented. Only tick this if the observation is still not identifying once credited.' : 'The contributor did not consent to attribution, so this is unavailable.'}</span>
      </label>
      <Field label="Redaction notes (internal, never shown to the contributor or other clients)" htmlFor="redactionNotes" error={err.redactionNotes}>
        <textarea id="redactionNotes" name="redactionNotes" className="textarea min-h-20" maxLength={LIMITS.note.max} value={v.redactionNotes} onChange={(e) => setV((x) => ({ ...x, redactionNotes: e.target.value }))} />
      </Field>
      <FlagList flags={flags} title="The shared text still contains possibly sensitive items" />
      {flags.length > 0 && <label className="flex gap-2 text-sm"><input type="checkbox" name="acknowledgeResidualFlags" className="mt-1" /> I have judged the flagged items safe to publish (required to publish while flags remain).</label>}

      <div className="space-y-2">
        <h3 className="text-base">Original vs shared (live)</h3>
        <DiffView original={source.title} shared={v.title} />
        <DiffView original={source.observation} shared={v.summary} />
        <DiffView original={[source.industry, source.region, source.period].filter(Boolean).join(' | ')} shared={[v.industry, v.region, v.periodLabel].filter(Boolean).join(' | ')} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn formAction={saveFA} className="btn-secondary">Save redaction</Btn>
        <Btn formAction={pubFA} className="btn-primary">Save and publish</Btn>
      </div>
      <p className="text-xs text-muted">Publishing creates a shared copy from the fields above only. The private source, the author and the organisation are never copied into it.</p>
    </form>
  );
}
