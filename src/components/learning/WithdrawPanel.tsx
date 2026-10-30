'use client';
import { useActionState } from 'react';
import type { FormState } from '@/lib/learning/result';
import { PRODUCTION_PROPAGATION_SLA, WITHDRAWAL_CAVEATS } from '@/lib/learning/constants';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function WithdrawPanel({ action, contributionId, kind, available }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; contributionId: string; kind: 'live' | 'pending' | 'org'; available: boolean }) {
  const [state, formAction] = useActionState(action, {} as FormState);
  if (state.ok)
    return (
      <div className="card space-y-3 border-sage/40">
        <h2 className="text-xl">Withdrawal complete</h2>
        <Alert tone="ok">{state.message}</Alert>
        {state.trace && (
          <ol className="space-y-1 text-sm" aria-label="Invalidation trace">
            {state.trace.map((t, i) => (
              <li key={i} className="flex gap-3"><code className="shrink-0 text-xs text-muted">+{t.ms_since_start}ms</code><span>{t.step}</span></li>
            ))}
          </ol>
        )}
        <ul className="list-disc pl-5 text-sm text-muted">{WITHDRAWAL_CAVEATS.map((c) => <li key={c}>{c}</li>)}</ul>
      </div>
    );
  if (!available) return null;
  return (
    <details className="card border-clay/40">
      <summary className="cursor-pointer font-serif text-lg text-brown-900">Withdraw this contribution</summary>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="contributionId" value={contributionId} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <p className="text-sm">
          {kind === 'live'
            ? 'Withdrawing removes the shared copy immediately: it is taken out of the search index and the retrieval caches in the same request, and your publication consent is recorded as withdrawn. You will see a step-by-step trace.'
            : kind === 'pending'
              ? 'Withdrawing takes this proposal back before a moderator decides. Nothing was published, your publication consent is recorded as withdrawn, it leaves the moderation queue and moderators can no longer open your private text.'
              : 'Withdrawing removes this contribution from your organisation’s view: colleagues can no longer open it or see it in the organisation list.'}
        </p>
        <Alert tone="warn">
          <p className="font-semibold">What withdrawal cannot do</p>
          <ul className="mt-1 list-disc pl-5">{WITHDRAWAL_CAVEATS.map((c) => <li key={c}>{c}</li>)}</ul>
        </Alert>
        <p className="text-xs text-muted">{PRODUCTION_PROPAGATION_SLA}</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" required className="mt-1" /> I understand, and I want to withdraw this contribution.</label>
        <SubmitButton className="btn-danger" pendingText="Withdrawing…">Withdraw now</SubmitButton>
      </form>
    </details>
  );
}
