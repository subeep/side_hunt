import Link from 'next/link';
import { Badge, EmptyState, Field, fmtDay, PageHeader } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireGrant } from '@/lib/authz/guards';
import { listOrgs } from '@/lib/admin/orgs';
import { createOrgAction, orgStatusAction } from './actions';

export const metadata = { title: 'Organisations' };

export default async function OrgsPage() {
  const p = await requireGrant('portal_admin');
  const orgs = await listOrgs(p);
  return (
    <div>
      <PageHeader eyebrow="Portal administration" title="Organisations" description="Client organisations and the internal organisation. Suspending a client organisation removes its workspace from every member on their next request." />
      <AdminNav current="/admin/orgs" />
      {orgs.length === 0 ? <EmptyState title="No organisations" /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="table-basic">
            <thead><tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Status</th><th scope="col">Members</th><th scope="col">Products</th><th scope="col">Community</th><th scope="col">Created</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td><strong className="text-brown-900">{o.name}</strong><br /><span className="text-xs text-muted">{[o.industry, o.region].filter(Boolean).join(' · ')}</span></td>
                  <td>{o.kind}</td>
                  <td><Badge tone={o.status === 'active' ? 'sage' : 'clay'}>{o.status}</Badge></td>
                  <td>{o.members}</td>
                  <td>{o.kind === 'client' ? o.entitlementCount : '—'}</td>
                  <td>{o.kind === 'client' ? <Badge tone={o.community === 'approved' ? 'sage' : 'neutral'}>{o.community}</Badge> : '—'}</td>
                  <td>{fmtDay(o.createdAt)}</td>
                  <td>
                    {o.kind === 'client' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/orgs/${o.id}`} className="btn btn-secondary btn-sm">Manage</Link>
                        <ActionForm action={orgStatusAction} submit={o.status === 'active' ? 'Suspend' : 'Reactivate'} variant={o.status === 'active' ? 'danger' : 'secondary'} inline confirmText={o.status === 'active' ? `Suspend ${o.name}? Members lose access immediately.` : undefined}>
                          <input type="hidden" name="orgId" value={o.id} /><input type="hidden" name="status" value={o.status === 'active' ? 'suspended' : 'active'} />
                        </ActionForm>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="card mt-10 max-w-2xl" aria-labelledby="new"><h2 id="new" className="mb-4 text-lg">Create a client organisation</h2>
        <ActionForm action={createOrgAction} submit="Create organisation">
          <Field label="Name" htmlFor="name"><input id="name" name="name" className="input" required minLength={2} maxLength={80} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Industry (optional)" htmlFor="industry"><input id="industry" name="industry" className="input" maxLength={60} /></Field>
            <Field label="Region (optional)" htmlFor="region"><input id="region" name="region" className="input" maxLength={60} /></Field>
          </div>
          <p className="hint">New organisations start with no products and no community participation.</p>
        </ActionForm>
      </section>
    </div>
  );
}
