'use client';
import { useActionState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { ActionState } from '@/lib/insights/state';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** A form bound to a server action with inline success/error feedback. */
export function InsightsForm({ action, children, submitLabel, pendingText, className, buttonClass }: { action: Action; children?: ReactNode; submitLabel: string; pendingText?: string; className?: string; buttonClass?: string }) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className={clsx('space-y-3', className)}>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="ok">{state.message}</Alert>}
      {children}
      <SubmitButton className={buttonClass} pendingText={pendingText}>{submitLabel}</SubmitButton>
    </form>
  );
}

/** A one-button form (vote, bookmark, hide, delete...) with hidden fields and inline error text. */
export function ActionButton({ action, fields, label, className = 'btn btn-secondary btn-sm', pressed, confirm }: { action: Action; fields: Record<string, string>; label: string; className?: string; pressed?: boolean; confirm?: string }) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className="inline-flex flex-col gap-1" onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" disabled={pending} aria-pressed={pressed} className={clsx(className, pressed && 'ring-2 ring-brown-500')}>{label}</button>
      {state.error && <span role="alert" className="text-xs font-medium text-clay">{state.error}</span>}
    </form>
  );
}
