import { Card, PageHeader, Stat } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { requireGrant } from '@/lib/authz/guards';
import { adminOverview } from '@/lib/admin/views';

export const metadata = { title: 'Portal admin' };

const AREAS = [
  { href: '/admin/orgs', t: 'Organisations', d: 'Client orgs, members, entitlements and community status.' },
  { href: '/admin/employees', t: 'Employee allowlist', d: 'Who may become an employee (@azentio.com only).' },
  { href: '/admin/grants', t: 'Platform grants', d: 'Separate, explicit permissions for verified employees.' },
  { href: '/admin/support', t: 'Support access', d: 'Time-boxed, reasoned authorisations to see a client summary.' },
  { href: '/admin/audit', t: 'Audit viewer', d: 'Filter privileged actions and denied attempts.' },
  { href: '/admin/leads', t: 'Public enquiries', d: 'Demo requests and hackathon interest.' },
  { href: '/admin/config', t: 'Configuration', d: 'Read-only operational settings.' },
];

export default async function AdminHome() {
  const p = await requireGrant('portal_admin');
  const o = await adminOverview(p);
  return (
    <div>
      <PageHeader eyebrow="Portal administration" title="Administration console" description="Operational controls. Being a portal administrator does not let you read any client's private content: that needs a support authorisation." />
      <AdminNav current="/admin" />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Client organisations" value={o.orgs} />
        <Stat label="Active employees" value={o.employees} />
        <Stat label="Active support authorisations" value={o.activeSupport} />
        <Stat label="Denied attempts (24h)" value={o.denials24h} />
        <Stat label="Public enquiries" value={o.leads} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((a) => <Card key={a.href} href={a.href}><p className="font-serif text-lg text-brown-900">{a.t}</p><p className="mt-1 text-sm text-muted">{a.d}</p></Card>)}
      </div>
    </div>
  );
}
