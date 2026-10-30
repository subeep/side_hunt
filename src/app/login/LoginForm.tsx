'use client';
import { useActionState } from 'react';
import { requestCodeAction, verifyCodeAction, type LoginState } from '@/lib/auth/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Alert, Field } from '@/components/ui';

export function LoginForm({ next }: { next?: string }) {
  const [req, requestAction] = useActionState<LoginState, FormData>(requestCodeAction, { step: 'email' });
  const [ver, verifyAction] = useActionState<LoginState, FormData>(verifyCodeAction, req);
  const state = ver.step === 'code' && ver.error ? ver : req;

  if (req.step === 'email') {
    return (
      <form action={requestAction} className="space-y-4">
        {req.error && <Alert tone="danger">{req.error}</Alert>}
        <Field label="Work email" htmlFor="email" hint="Employees use their @azentio.com address. Clients need an invitation.">
          <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@company.com" />
        </Field>
        <SubmitButton pendingText="Sending code…">Email me a sign-in code</SubmitButton>
      </form>
    );
  }
  return (
    <form action={verifyAction} className="space-y-4">
      <input type="hidden" name="email" value={req.email} />
      {next && <input type="hidden" name="next" value={next} />}
      <Alert tone="info">{req.message}</Alert>
      {req.demoCode && (
        <Alert tone="warn">
          <strong>Demo environment:</strong> this is a seeded demo persona, so its code is shown here: <code className="rounded bg-white px-1.5 py-0.5 font-mono text-base">{req.demoCode}</code>. Real accounts never see their code on screen.
        </Alert>
      )}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="6-digit code" htmlFor="code">
        <input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" className="input tracking-[0.4em]" />
      </Field>
      <SubmitButton pendingText="Verifying…">Verify and sign in</SubmitButton>
    </form>
  );
}
