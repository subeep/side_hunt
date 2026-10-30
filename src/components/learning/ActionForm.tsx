'use client';
import { useActionState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { FormState } from '@/lib/learning/result';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';

/** A form bound to a server action with inline success / error feedback. */
export function ActionForm({
  action, children, submitLabel, pendingText, className, buttonClass, hideButton, initial,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel?: string;
  pendingText?: string;
  className?: string;
  buttonClass?: string;
  hideButton?: boolean;
  initial?: FormState;
}) {
  const [state, formAction] = useActionState(action, initial ?? {});
  return (
    <form action={formAction} className={clsx('space-y-3', className)}>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="ok">{state.message}</Alert>}
      {state.errors && Object.keys(state.errors).length > 0 && (
        <Alert tone="danger">
          <ul className="list-disc pl-4">{Object.entries(state.errors).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
        </Alert>
      )}
      {children}
      {!hideButton && submitLabel && <SubmitButton className={buttonClass} pendingText={pendingText}>{submitLabel}</SubmitButton>}
    </form>
  );
}
