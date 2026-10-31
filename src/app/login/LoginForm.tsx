'use client';
import { useActionState } from 'react';
import { useState } from 'react';
import { passwordLoginAction, requestCodeAction, verifyCodeAction, type LoginState } from '@/lib/auth/actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Alert, Field } from '@/components/ui';

export function PasswordForm({ next, accounts }: { next?: string; accounts: readonly { email: string; label: string }[] }) {
  const [state, action] = useActionState<{ error?: string }, FormData>(passwordLoginAction, {});
  const [email, setEmail] = useState('');
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" htmlFor="pw-email">
        <input id="pw-email" name="email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="pw-password">
        <input id="pw-password" name="password" type="password" required autoComplete="current-password" className="input" />
      </Field>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      <div className="rounded-lg bg-brown-50 p-3 text-sm text-brown-800">
        <p className="font-medium">Test accounts (password: <code className="font-mono">Azentio@2026</code>)</p>
        <ul className="mt-1 space-y-1">
          {accounts.map((a) => (
            <li key={a.email}><button type="button" className="text-left underline" onClick={() => setEmail(a.email)}>{a.email}</button> <span className="text-muted">{a.label}</span></li>
          ))}
        </ul>
      </div>
    </form>
  );
}

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
