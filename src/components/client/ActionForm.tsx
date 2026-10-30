'use client';
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Alert } from '@/components/ui';

export interface FormState {
  error?: string;
  ok?: string;
  /** One-time secret link (invitations). Shown once; the raw token is never stored. */
  link?: string;
  emailStatus?: string;
}

/**
 * Server-action form with inline feedback. Submitted via onSubmit + transition so a validation error does NOT wipe what the
 * person typed (React would otherwise reset the form). Success clears it. The server action is the only authority.
 */
export function ActionForm({
  action, children, submit, pendingText = 'Working…', className, buttonClass = 'btn-primary', confirm,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children?: ReactNode;
  submit: string;
  pendingText?: string;
  className?: string;
  buttonClass?: string;
  confirm?: string;
}) {
  const [state, run, pending] = useActionState(action, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => run(fd));
  };
  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      {children}
      {state.error && <Alert tone="danger" className="mt-3">{state.error}</Alert>}
      {state.ok && <Alert tone="ok" className="mt-3">{state.ok}</Alert>}
      {state.link && (
        <Alert tone="warn" className="mt-3">
          <p className="font-semibold">Single-use invitation link (shown once, expires in 7 days)</p>
          <input readOnly value={state.link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} className="input mt-2 font-mono text-xs" />
          <p className="mt-2 text-xs">Email hand-off status: <strong>{state.emailStatus ?? 'queued'}</strong>. “Queued” means stored for sending, “sent” means accepted by the mail provider. Neither confirms delivery, so you may also share the link yourself.</p>
        </Alert>
      )}
      <button type="submit" disabled={pending} className={clsx('btn', buttonClass, (state.error || state.ok || state.link) && 'mt-3')}>
        {pending ? pendingText : submit}
      </button>
    </form>
  );
}
