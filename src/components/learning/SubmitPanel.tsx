'use client';
import { useActionState } from 'react';
import type { FormState } from '@/lib/learning/result';
import type { SensitiveFlag } from '@/lib/learning/sensitive';
import { CONSENT_COPY, SCAN_DISCLAIMER } from '@/lib/learning/constants';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FlagList } from './SensitiveText';

/** The explicit submit step: separate consent controls, flag acknowledgement. Nothing is shared until this is submitted. */
export function SubmitPanel({
  action, contributionId, sharingChoice, flags, gaps, resubmit,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  contributionId: string;
  sharingChoice: 'organisation' | 'community';
  flags: SensitiveFlag[];
  gaps: string[];
  resubmit: boolean;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const community = sharingChoice === 'community';
  const check = (name: 'store_process' | 'publish_shared' | 'attribution' | 'training', required: boolean) => (
    <label className="flex gap-3 rounded-xl border border-line p-3 text-sm">
      <input type="checkbox" name={name} required={required} className="mt-1" />
      <span>
        <span className="block font-medium text-brown-900">{CONSENT_COPY[name].label}{required && <span className="ml-1 text-clay">*</span>}</span>
        <span className="block text-muted">{CONSENT_COPY[name].body}</span>
        <span className="mt-0.5 block text-xs font-medium text-brown-600">{CONSENT_COPY[name].required}</span>
      </span>
    </label>
  );
  return (
    <form action={formAction} className="card space-y-4 border-brown-300">
      <input type="hidden" name="contributionId" value={contributionId} />
      <div>
        <h2 className="text-xl">{resubmit ? 'Resubmit for review' : community ? 'Submit for moderator review' : 'Share with my organisation'}</h2>
        <p className="mt-1 text-sm text-muted">
          {community
            ? 'A moderator will review your private original and prepare a redacted, de-identified version. You will be notified at each step. Nothing is shared with other clients until a moderator approves it.'
            : 'This makes the contribution visible to members of your own organisation. It is not reviewed by moderators and is never shared with other clients.'}
        </p>
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {gaps.length > 0 && <Alert tone="warn">Before submitting, add: {gaps.join(', ')}. Use “Edit” above.</Alert>}
      <FlagList flags={flags} title="The scan flagged possibly sensitive content in your text" />
      {flags.length > 0 && (
        <label className="flex gap-2 text-sm"><input type="checkbox" name="acknowledgeFlags" required className="mt-1" /> I have reviewed the flagged text. I understand {community ? 'the moderator will see these flags' : 'members of my organisation will see this text as written'}, and that {SCAN_DISCLAIMER.toLowerCase()}</label>
      )}
      <div className="space-y-2">
        <p className="eyebrow">Your consents (each is separate)</p>
        {check('store_process', true)}
        {community && check('publish_shared', true)}
        {community && check('attribution', false)}
        {check('training', false)}
      </div>
      <SubmitButton pendingText="Submitting…" className={gaps.length ? 'opacity-60' : ''}>{resubmit ? 'Resubmit for review' : community ? 'Submit for review' : 'Share with my organisation'}</SubmitButton>
    </form>
  );
}
