'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/client', label: 'Dashboard' },
  { href: '/client/sandbox', label: 'Sandbox' },
  { href: '/client/sessions', label: 'Sessions' },
  { href: '/client/resources', label: 'Resources' },
  { href: '/learn/mine', label: 'My observations' },
  { href: '/client/support', label: 'Support' },
];

/** UI hint only: every destination re-checks access on the server. */
export function ClientNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  if (path.startsWith('/client/terms')) return null;
  const links = isAdmin ? [...LINKS, { href: '/client/admin', label: 'Organisation admin' }] : LINKS;
  const current = (href: string) => (href === '/client' ? path === '/client' : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="subnav mb-6 flex gap-1 overflow-x-auto border-b border-line pb-3" aria-label="Workspace">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={current(l.href) ? 'page' : undefined} className="whitespace-nowrap">{l.label}</Link>
      ))}
    </nav>
  );
}
