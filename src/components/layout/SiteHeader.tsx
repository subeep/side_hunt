import Link from 'next/link';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getPrincipal } from '@/lib/auth/session';
import { logoutAction, selectWorkspaceAction } from '@/lib/auth/actions';
import { navFor } from '@/lib/nav';
import { isDemoMode } from '@/lib/env';

export function Brand() {
  return (
    <Link href="/" className="flex items-baseline text-xl font-semibold tracking-tight no-underline" aria-label="azentio.ai home">
      <span className="font-serif text-brown-900">azentio</span>
      <span className="font-serif text-brown-500">.ai</span>
    </Link>
  );
}

export async function SiteHeader() {
  const p = await getPrincipal();
  const links = navFor(p);
  let unread = 0;
  if (p) {
    const [r] = await db.select({ n: count() }).from(schema.notifications).where(and(eq(schema.notifications.userId, p.userId), isNull(schema.notifications.readAt)));
    unread = r?.n ?? 0;
  }
  const clientMemberships = p?.memberships.filter((m) => m.orgKind === 'client') ?? [];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
        <Brand />
        <nav aria-label="Primary" className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1">
          {links.map((l) => (
            <Link key={l.href + l.label} href={l.href} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-brown-700 no-underline hover:bg-brown-100">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {p && clientMemberships.length > 0 && (
            <form action={selectWorkspaceAction} className="flex items-center gap-1">
              <label className="sr-only" htmlFor="ws">Active workspace</label>
              <select id="ws" name="orgId" defaultValue={p.activeOrgId ?? ''} className="select !w-auto !py-1 text-xs" title="Active workspace">
                {!p.activeOrgId && <option value="" disabled>Select workspace…</option>}
                {clientMemberships.map((m) => (
                  <option key={m.orgId} value={m.orgId}>{m.orgName}</option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm" type="submit">Switch</button>
            </form>
          )}
          {p ? (
            <>
              <Link href="/notifications" className="btn btn-ghost btn-sm relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                Notifications
                {unread > 0 && <span className="ml-1 rounded-full bg-brown-700 px-1.5 text-[10px] text-white">{unread}</span>}
              </Link>
              <span className="hidden text-xs text-muted md:inline" title={p.email}>{p.name}</span>
              <form action={logoutAction}><button className="btn btn-secondary btn-sm" type="submit">Sign out</button></form>
            </>
          ) : (
            <>
              {isDemoMode() && <Link href="/demo" className="btn btn-ghost btn-sm">Demo personas</Link>}
              <Link href="/login" className="btn btn-primary btn-sm">Sign in</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-paper-2">
      <div className="container-page flex flex-wrap items-center justify-between gap-3 py-8 text-sm text-muted">
        <p><span className="font-serif text-brown-800">azentio.ai</span> — Build intelligence. Create shared value.</p>
        <p>Synthetic data only in this environment. Sample outputs are not credit or business decisions.</p>
      </div>
    </footer>
  );
}
