'use client';
import { useActionState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { PubState } from '@/lib/public/publisher';

type Values = Record<string, string>;

/**
 * React 19 resets a <form> when its action finishes, success or not. When the server rejects a submission we must not
 * throw away what the user typed (an 8000-character body, say), so we remember the submitted values and write them back
 * into the visible fields once the reset has happened. Hidden inputs (ids, status) are never touched.
 */
function restore(form: HTMLFormElement, values: Values) {
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || !el.name) continue;
    if (el instanceof HTMLInputElement) {
      if (el.type === 'hidden' || el.type === 'file' || el.type === 'submit' || el.type === 'button') continue;
      if (el.type === 'checkbox') { el.checked = el.name in values; continue; }
      if (el.type === 'radio') { el.checked = values[el.name] === el.value; continue; }
    }
    if (el.name in values) el.value = values[el.name];
  }
}

/** Wraps a server action with feedback. The action is authoritative: it re-checks the grant and validates all input. */
export function ActionForm({ action, children, submitLabel, className, variant = 'primary' }: { action: (prev: PubState, fd: FormData) => Promise<PubState>; children?: ReactNode; submitLabel: string; className?: string; variant?: 'primary' | 'secondary' | 'danger' }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<Values | null>(null);
  const wrapped = useCallback(async (prev: PubState, fd: FormData) => {
    const v: Values = {};
    fd.forEach((val, k) => { if (typeof val === 'string') v[k] = val; });
    submitted.current = v;
    return action(prev, fd);
  }, [action]);
  const [s, formAction] = useActionState(wrapped, {} as PubState);
  useEffect(() => {
    if (s.ok === false && submitted.current && formRef.current) restore(formRef.current, submitted.current);
  }, [s]);
  const errs = Object.values(s.errors ?? {});
  return (
    <form ref={formRef} action={formAction} className={clsx('space-y-3', className)}>
      {children}
      {s.message && !s.ok && <Alert tone="danger">{s.message}{errs.length > 0 && <ul className="mt-1 list-disc pl-5">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}</Alert>}
      {s.ok && <Alert tone="ok">{s.message ?? 'Saved.'}</Alert>}
      <SubmitButton className={variant === 'secondary' ? '!bg-card !text-brown-800 border-brown-300 hover:!bg-brown-50' : variant === 'danger' ? '!bg-clay hover:!bg-[#8a3622]' : undefined}>{submitLabel}</SubmitButton>
    </form>
  );
}
