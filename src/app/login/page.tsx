import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader, Card } from '@/components/ui';
import { getPrincipal } from '@/lib/auth/session';
import { safeNext } from '@/lib/auth/login';
import { isDemoMode } from '@/lib/env';
import { isTestLogin, TEST_ACCOUNTS } from '@/lib/auth/testlogin';
import { LoginForm, PasswordForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getPrincipal()) redirect(safeNext(next) ?? '/');
  return (
    <div className="mx-auto max-w-md">
      <PageHeader eyebrow="Sign in" title="Welcome back" description="Sign in with the test account, or get an emailed one-time code." />
      {isTestLogin() && <Card className="mb-4"><PasswordForm next={safeNext(next) ?? undefined} accounts={TEST_ACCOUNTS} /></Card>}
      <details className="card" open={!isTestLogin()}>
        <summary className="cursor-pointer text-sm font-medium text-brown-800">Use an emailed code instead</summary>
        <div className="mt-4"><LoginForm next={safeNext(next) ?? undefined} /></div>
      </details>
      {isDemoMode() && (
        <p className="mt-4 text-sm text-muted">Judging the demo? <Link href="/demo">Sign in as a seeded persona</Link>.</p>
      )}
    </div>
  );
}
