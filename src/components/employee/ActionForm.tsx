'use client';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import clsx from 'clsx';
import type { FormState } from '@/lib/employee/common';

function Submit({ children, variant, pendingText }: { children: ReactNode; variant: string; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx('btn btn-sm', variant === 'danger' ? 'btn-danger' : variant === 'secondary' ? 'btn-secondary' : 'btn-primary')}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Server-action form with inline success / error feedback. The server action does all authorisation and validation. */
export function ActionForm({ action, children, submit, variant = 'primary', className, inline = false, pendingText = 'Working…', confirmText }: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children?: ReactNode;
  submit: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  inline?: boolean;
  pendingText?: string;
  confirmText?: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className={clsx(inline ? 'inline-flex flex-wrap items-center gap-2' : 'space-y-3', className)} onSubmit={confirmText ? (e) => { if (!window.confirm(confirmText)) e.preventDefault(); } : undefined}>
      {children}
      <div className={clsx('flex flex-wrap items-center gap-3', inline && 'contents')}>
        <Submit variant={variant} pendingText={pendingText}>{submit}</Submit>
        {state.error && <p role="alert" className="text-sm font-medium text-clay">{state.error}</p>}
        {state.ok && <p role="status" className="break-all text-sm font-medium text-sage">{state.ok}</p>}
      </div>
    </form>
  );
}
