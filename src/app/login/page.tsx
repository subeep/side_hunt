import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader, Card } from '@/components/ui';
import { getPrincipal } from '@/lib/auth/session';
import { safeNext } from '@/lib/auth/login';
import { isDemoMode } from '@/lib/env';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getPrincipal()) redirect(safeNext(next) ?? '/');
  return (
    <div className="mx-auto max-w-md">
      <PageHeader eyebrow="Sign in" title="Welcome back" description="We email a single-use code. No passwords to remember." />
      <Card><LoginForm next={safeNext(next) ?? undefined} /></Card>
      {isDemoMode() && (
        <p className="mt-4 text-sm text-muted">Judging the demo? <Link href="/demo">Sign in as a seeded persona</Link>.</p>
      )}
    </div>
  );
}
