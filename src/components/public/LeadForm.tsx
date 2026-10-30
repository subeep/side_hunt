'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert, Field } from '@/components/ui';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { HACKATHON_TRACKS, PRODUCT_INTERESTS, PRODUCT_LABEL, leadSchemas, type LeadFormState, type LeadKind } from '@/lib/public/lead-schema';

type Action = (prev: LeadFormState, fd: FormData) => Promise<LeadFormState>;
const IDLE: LeadFormState = { status: 'idle' };

/**
 * Client-side hints only (same zod schema as the server, validated on blur). The server action is authoritative:
 * it re-validates everything, checks the honeypot and rate-limits.
 */
export function LeadForm({ kind, action }: { kind: LeadKind; action: Action }) {
  const [state, formAction] = useActionState(action, IDLE);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [len, setLen] = useState(0);
  const v = state.values ?? {};
  const err = (k: string) => state.errors?.[k] ?? hints[k];
  const demo = kind === 'demo';

  function validate(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    const shape = (leadSchemas[kind].shape as Record<string, { safeParse: (x: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }>)[name];
    if (!shape) return;
    const r = shape.safeParse(value);
    setHints((h) => ({ ...h, [name]: r.success ? '' : (r.error?.issues[0]?.message ?? 'Check this field.') }));
  }

  if (state.status === 'ok') {
    return (
      <Alert tone="ok" className="!p-6">
        <p className="font-serif text-xl text-brown-900">{demo ? 'Request received' : 'Interest registered'}</p>
        <p className="mt-2">{state.message}</p>
        <p className="mt-3"><Link href="/" className="font-semibold">Back to home</Link></p>
      </Alert>
    );
  }

  const options = demo ? PRODUCT_INTERESTS.map((s) => ({ value: s as string, label: PRODUCT_LABEL[s] })) : HACKATHON_TRACKS.map((t) => ({ value: t as string, label: t }));
  return (
    <form action={formAction} className="space-y-5" aria-describedby={state.status === 'error' ? 'form-error' : undefined}>
      {state.status === 'error' && state.errors?.form && <Alert tone="danger"><span id="form-error">{state.errors.form}</span></Alert>}
      {state.status === 'error' && !state.errors?.form && <Alert tone="danger"><span id="form-error">Please check the highlighted fields.</span></Alert>}

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Leave this field empty<input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={err('name')}>
          <input id="name" name="name" required minLength={2} maxLength={100} autoComplete="name" className="input" defaultValue={v.name} onBlur={validate} aria-invalid={!!err('name')} />
        </Field>
        <Field label="Work email" htmlFor="email" error={err('email')}>
          <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" className="input" defaultValue={v.email} onBlur={validate} aria-invalid={!!err('email')} />
        </Field>
        <Field label={demo ? 'Organisation' : 'Organisation (optional)'} htmlFor="company" error={err('company')}>
          <input id="company" name="company" required={demo} minLength={demo ? 2 : undefined} maxLength={120} autoComplete="organization" className="input" defaultValue={v.company} onBlur={validate} aria-invalid={!!err('company')} />
        </Field>
        <Field label="Role (optional)" htmlFor="role" error={err('role')}>
          <input id="role" name="role" maxLength={100} autoComplete="organization-title" className="input" defaultValue={v.role} onBlur={validate} aria-invalid={!!err('role')} />
        </Field>
      </div>

      <fieldset>
        <legend className="label">{demo ? 'Which products interest you? (optional)' : 'Which areas would you like to build in? (optional)'}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm has-[:checked]:border-brown-500 has-[:checked]:bg-brown-50">
              <input type="checkbox" name="interests" value={o.value} defaultChecked={v.interests?.includes(o.value)} className="accent-brown-700" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={demo ? 'What are you trying to solve?' : 'Anything you would like to build or learn? (optional)'} htmlFor="message" error={err('message')} hint={`${len}/${demo ? 2000 : 1000} characters${demo ? ' (min 10)' : ''}. Please do not include customer data, account numbers or credentials.`}>
        <textarea id="message" name="message" required={demo} minLength={demo ? 10 : undefined} maxLength={demo ? 2000 : 1000} className="textarea" defaultValue={v.message} onInput={(e) => setLen(e.currentTarget.value.length)} onBlur={validate} aria-invalid={!!err('message')} />
      </Field>

      <div className="space-y-2 rounded-xl border border-line bg-brown-50/60 p-4 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="consent" required defaultChecked={v.consent} className="mt-1 accent-brown-700" aria-invalid={!!err('consent')} />
          <span>{demo ? 'I agree that azentio.ai may use these details to reply to my request.' : 'I agree that azentio.ai may use these details to contact me about the hackathon.'} <Link href="/about#privacy" className="font-semibold">How we handle enquiries</Link>.</span>
        </label>
        {err('consent') && <p className="text-xs font-medium text-clay">{err('consent')}</p>}
        {demo && (
          <label className="flex items-start gap-2">
            <input type="checkbox" name="marketing" defaultChecked={v.marketing} className="mt-1 accent-brown-700" />
            <span>Optional and separate: keep me posted about azentio.ai events and publications.</span>
          </label>
        )}
      </div>

      <SubmitButton pendingText="Sending...">{demo ? 'Request a demo' : 'Register interest'}</SubmitButton>
    </form>
  );
}
