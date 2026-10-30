import { notFound } from 'next/navigation';
import { PageHeader, Card, Alert } from '@/components/ui';
import { DEMO_PERSONAS } from '@/db/seed/core';
import { demoSignInAction } from '@/lib/auth/actions';
import { isDemoMode } from '@/lib/env';

export const metadata = { title: 'Demo personas' };

export default function DemoPage() {
  if (!isDemoMode()) notFound();
  return (
    <div>
      <PageHeader eyebrow="Judging environment" title="Sign in as a demo persona" description="These are seeded synthetic identities. Each creates a real server-side session, and every permission below is enforced on the server, not by what you can see in the menu." />
      <Alert tone="warn" className="mb-6">DEMO_MODE is on. In production this page returns 404 and sign-in is by emailed one-time code only.</Alert>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {DEMO_PERSONAS.map((p) => (
          <Card key={p.id}>
            <p className="eyebrow">{p.label}</p>
            <p className="mt-1 font-serif text-lg text-brown-900">{p.name}</p>
            <p className="text-xs text-muted">{p.email}</p>
            <p className="mt-2 min-h-12 text-sm text-ink/80">{p.description}</p>
            <form action={demoSignInAction} className="mt-3">
              <input type="hidden" name="userId" value={p.id} />
              <button className="btn btn-primary btn-sm" type="submit">Sign in as {p.name.split(' ')[0]}</button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
