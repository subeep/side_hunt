import type { Principal } from './auth/principal';

export interface NavLink {
  href: string;
  label: string;
}

/** UI hint only. Visibility of a link NEVER grants access: every route and API re-checks on the server. */
export function navFor(p: Principal | null): NavLink[] {
  if (!p) {
    return [
      { href: '/products', label: 'Products' },
      { href: '/media', label: 'Demos' },
      { href: '/connect', label: 'Contact' },
    ];
  }
  const links: NavLink[] = [{ href: '/products', label: 'Products' }, { href: '/media', label: 'Demos' }];
  if (p.isEmployee) {
    links.push({ href: '/employee', label: 'Employee' }, { href: '/learn', label: 'AI Insights' });
  }
  if (p.memberships.some((m) => m.orgKind === 'client')) {
    links.push({ href: '/client', label: 'Workspace' }, { href: '/learn', label: 'AI Insights' });
  }
  if (p.grants.has('learning_moderator')) links.push({ href: '/moderation', label: 'Moderation' });
  if (p.grants.has('content_publisher') || p.grants.has('video_publisher')) links.push({ href: '/publisher', label: 'Publisher' });
  if (p.grants.has('product_owner')) links.push({ href: '/product', label: 'Product ideas' });
  if (p.grants.has('portal_admin')) links.push({ href: '/admin', label: 'Admin' }, { href: '/admin/trust', label: 'Trust console' });
  const seen = new Set<string>();
  return links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)));
}
