'use client';
import { useActionState } from 'react';
import type { FormState } from '@/lib/learning/result';
import { LIMITS, REPORT_REASONS } from '@/lib/learning/constants';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { reportSharedAction } from '@/lib/learning/report-actions';

/**
 * Report a shared observation (misleading / confidential / inappropriate). The server re-checks that the signed-in user
 * can see the item. Reporters are never required to identify another client, and the contributor is never told who reported.
 */
export function ReportButton({ sharedId }: { sharedId: string }) {
  const [state, action] = useActionState(reportSharedAction, {} as FormState);
  if (state.ok) return <Alert tone="ok">{state.message}</Alert>;
  return (
    <details className="rounded-xl border border-line bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold text-brown-700">Report this observation</summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="sharedId" value={sharedId} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <fieldset className="space-y-1.5">
          <legend className="label">What is the concern?</legend>
          {Object.entries(REPORT_REASONS).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" value={k} required /> {l}</label>
          ))}
        </fieldset>
        <div>
          <label className="label" htmlFor={`rd-${sharedId}`}>Details (optional)</label>
          <textarea id={`rd-${sharedId}`} name="details" className="textarea min-h-20" maxLength={LIMITS.details.max} />
          <p className="hint">You do not need to name any client, customer or person. Describe the concern in general terms. Moderators see who reported; the contributor never does.</p>
        </div>
        <SubmitButton className="btn-secondary" pendingText="Sending…">Send report</SubmitButton>
      </form>
    </details>
  );
}
