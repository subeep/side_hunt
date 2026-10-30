'use client';
import { useActionState, useMemo, useState } from 'react';
import { Alert, Field } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { CONFIDENCE_LABELS, EVIDENCE_TYPES, KIND_HINTS, KIND_LABELS, LIMITS, OFFERINGS, PRIVACY_PROMPT, SHARING, TOPICS } from '@/lib/learning/constants';
import { scanFields } from '@/lib/learning/sensitive';
import type { FormState } from '@/lib/learning/result';
import { FlagList } from './SensitiveText';

export interface ContributionValues {
  kind: string; title: string; observation: string; offeringSlug: string; industry: string; region: string; observationPeriod: string;
  evidenceType: string; confidence: string; topic: string; supportLinks: string; sharingChoice: 'private' | 'organisation' | 'community';
}
export const EMPTY_VALUES: ContributionValues = { kind: 'market_observation', title: '', observation: '', offeringSlug: '', industry: '', region: '', observationPeriod: '', evidenceType: '', confidence: '', topic: '', supportLinks: '', sharingChoice: 'private' };

/**
 * Capture / edit form. Client-side constraints mirror the server zod schema (lengths, enums, required) but the server is
 * the authority. Saving NEVER shares: the button says so, and sharing is a separate explicit "Submit" step.
 */
export function ContributionForm({
  action, initial = EMPTY_VALUES, contributionId, communityApproved, sharingLocked = false, needsFlagAck = false, orgOnlyLive = false, submitLabel, backHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial?: ContributionValues;
  contributionId?: string;
  communityApproved: boolean;
  /** After the first submission the sharing choice can no longer change (it can never be silently widened). */
  sharingLocked?: boolean;
  /** Editing a PUBLISHED contribution re-enters review immediately, so flags must be acknowledged here. */
  needsFlagAck?: boolean;
  /** Editing a published organisation-only item updates it in place for the organisation: no moderation. */
  orgOnlyLive?: boolean;
  submitLabel: string;
  backHref: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const [v, setV] = useState<ContributionValues>(initial);
  const set = (k: keyof ContributionValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const links = useMemo(() => v.supportLinks.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), [v.supportLinks]);
  const flags = useMemo(() => scanFields({ title: v.title, observation: v.observation, industry: v.industry, region: v.region, observationPeriod: v.observationPeriod, supportLinks: links }), [v, links]);
  const err = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {contributionId && <input type="hidden" name="contributionId" value={contributionId} />}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Alert tone="warn">
        <p className="font-semibold">Before you write: leave these out</p>
        <ul className="mt-1 list-disc pl-5">{PRIVACY_PROMPT.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="mt-1">Describe the pattern, not the customer. Attachments are not supported in this release; add support links instead.</p>
      </Alert>

      <fieldset className="card space-y-4">
        <legend className="px-1 font-serif text-lg text-brown-900">What did you observe?</legend>
        <Field label="Type of contribution" htmlFor="kind" error={err.kind} hint={KIND_HINTS[v.kind as keyof typeof KIND_HINTS]}>
          <select id="kind" name="kind" className="select" value={v.kind} onChange={set('kind')} required>
            {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Title" htmlFor="title" error={err.title} hint={`${v.title.length}/${LIMITS.title.max}`}>
          <input id="title" name="title" className="input" required minLength={LIMITS.title.min} maxLength={LIMITS.title.max} value={v.title} onChange={set('title')} placeholder="A short, general headline" />
        </Field>
        <Field label="Observation" htmlFor="observation" error={err.observation} hint={`${v.observation.length}/${LIMITS.observation.max} characters (at least ${LIMITS.observation.min}). What happened, how often, and what difference it made.`}>
          <textarea id="observation" name="observation" className="textarea min-h-44" required minLength={LIMITS.observation.min} maxLength={LIMITS.observation.max} value={v.observation} onChange={set('observation')} />
        </Field>
        <Field label="Support links (optional, one per line)" htmlFor="supportLinks" error={err.supportLinks} hint={`Up to ${LIMITS.link.count} https links to public or internal references. No file attachments in this release.`}>
          <textarea id="supportLinks" name="supportLinks" className="textarea min-h-20" maxLength={LIMITS.link.count * (LIMITS.link.max + 1)} value={v.supportLinks} onChange={set('supportLinks')} placeholder="https://" />
        </Field>
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="px-1 font-serif text-lg text-brown-900">Context for reviewers and readers</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Offering concerned" htmlFor="offeringSlug" error={err.offeringSlug}>
            <select id="offeringSlug" name="offeringSlug" className="select" value={v.offeringSlug} onChange={set('offeringSlug')}>
              <option value="">Not specific to one offering</option>
              {OFFERINGS.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Topic" htmlFor="topic" error={err.topic} hint="Needed for community proposals.">
            <select id="topic" name="topic" className="select" value={v.topic} onChange={set('topic')}>
              <option value="">Choose a topic…</option>
              {TOPICS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Industry" htmlFor="industry" error={err.industry} hint="A moderator will generalise this before anything is shared.">
            <input id="industry" name="industry" className="input" maxLength={LIMITS.industry.max} value={v.industry} onChange={set('industry')} />
          </Field>
          <Field label="Region" htmlFor="region" error={err.region} hint="Prefer a broad region. Rare places make a story identifiable.">
            <input id="region" name="region" className="input" maxLength={LIMITS.region.max} value={v.region} onChange={set('region')} />
          </Field>
          <Field label="Observation period" htmlFor="observationPeriod" error={err.observationPeriod} hint="For example “last two winters”. Needed for community proposals.">
            <input id="observationPeriod" name="observationPeriod" className="input" maxLength={LIMITS.period.max} value={v.observationPeriod} onChange={set('observationPeriod')} />
          </Field>
          <Field label="Evidence type" htmlFor="evidenceType" error={err.evidenceType} hint="Needed for community proposals.">
            <select id="evidenceType" name="evidenceType" className="select" value={v.evidenceType} onChange={set('evidenceType')}>
              <option value="">Choose…</option>
              {Object.entries(EVIDENCE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="How confident are you?" htmlFor="confidence" error={err.confidence} hint="Needed for community proposals.">
            <select id="confidence" name="confidence" className="select" value={v.confidence} onChange={set('confidence')}>
              <option value="">Choose…</option>
              {Object.entries(CONFIDENCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="card space-y-3" disabled={sharingLocked}>
        <legend className="px-1 font-serif text-lg text-brown-900">Who may see this?</legend>
        <p className="text-sm text-muted">Saving never shares anything. This is the intended audience; you confirm it in a separate submit step with your consents.</p>
        {err.sharingChoice && <p className="text-xs font-medium text-clay">{err.sharingChoice}</p>}
        {(['private', 'organisation', 'community'] as const).map((k) => {
          const disabled = k === 'community' && !communityApproved;
          return (
            <label key={k} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${v.sharingChoice === k ? 'border-brown-500 bg-brown-50' : 'border-line'} ${disabled ? 'opacity-60' : ''}`}>
              <input type="radio" name="sharingChoice" value={k} checked={v.sharingChoice === k} disabled={disabled} onChange={set('sharingChoice')} className="mt-1" />
              <span>
                <span className="block font-medium text-brown-900">{SHARING[k].label}</span>
                <span className="block text-sm text-muted">{SHARING[k].body}{disabled && ' Your organisation is not an approved participant in the learning community, so this is unavailable.'}</span>
              </span>
            </label>
          );
        })}
        {sharingLocked && <Alert tone="info">The sharing choice is locked after submission so an audience can never be silently widened. To share more widely, create a new contribution.</Alert>}
      </fieldset>
      {sharingLocked && <input type="hidden" name="sharingChoice" value={v.sharingChoice} />}

      <FlagList flags={flags} title="Heads-up: this text may contain sensitive details" />
      {needsFlagAck && flags.length > 0 && (
        <label className="flex gap-2 text-sm"><input type="checkbox" name="acknowledgeFlags" required className="mt-1" /> {orgOnlyLive ? 'I have reviewed the flagged text and it is safe for my organisation to see.' : 'I have reviewed the flagged text and it is safe to send for renewed moderator review.'}</label>
      )}
      {needsFlagAck && orgOnlyLive && <Alert tone="info">Saving updates this for your organisation straight away. Moderators do not review or see organisation-only items, and it is never shared with other clients.</Alert>}
      {needsFlagAck && !orgOnlyLive && <Alert tone="info">Saving a change to a published contribution creates a new version and sends it for renewed review. The version that is live now stays as it is until the new one is approved.</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
        <a className="btn btn-ghost" href={backHref}>Cancel</a>
        {!needsFlagAck && <p className="text-xs text-muted">Saving keeps this private to you. Nothing is shared or sent for review.</p>}
      </div>
    </form>
  );
}
