import { Badge, EmptyState, Field, fmtDay, PageHeader } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireGrant } from '@/lib/authz/guards';
import { listAllowlist } from '@/lib/admin/people';
import { addAllowlistAction, revokeAllowlistAction } from './actions';

export const metadata = { title: 'Employee allowlist' };

export default async function EmployeesPage() {
  const p = await requireGrant('portal_admin');
  const rows = await listAllowlist(p);
  return (
    <div>
      <PageHeader eyebrow="Portal administration" title="Employee allowlist" description="Employee access needs a verified @azentio.com identity and an active entry here. An email suffix alone never grants access, and employees start with no platform grants." />
      <AdminNav current="/admin/employees" />
      {rows.length === 0 ? <EmptyState title="The allowlist is empty" /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="table-basic">
            <thead><tr><th scope="col">Person</th><th scope="col">Status</th><th scope="col">Signed in</th><th scope="col">Added</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email}>
                  <td><strong className="text-brown-900">{r.name}</strong><br /><span className="text-xs text-muted">{r.email}</span></td>
                  <td><Badge tone={r.status === 'active' ? 'sage' : 'clay'}>{r.status}</Badge></td>
                  <td>{r.signedIn ? 'Yes' : 'Not yet'}</td>
                  <td>{fmtDay(r.createdAt)}</td>
                  <td>{r.status === 'active' && r.email !== p.email && <ActionForm action={revokeAllowlistAction} submit="Revoke" variant="danger" inline confirmText={`Revoke ${r.email}? Their grants and sessions end immediately.`}><input type="hidden" name="email" value={r.email} /></ActionForm>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="card mt-10 max-w-2xl" aria-labelledby="new"><h2 id="new" className="mb-4 text-lg">Add an employee</h2>
        <ActionForm action={addAllowlistAction} submit="Add to allowlist">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Work email" htmlFor="email" hint="Must end with @azentio.com."><input id="email" name="email" type="email" className="input" required maxLength={200} /></Field>
            <Field label="Name" htmlFor="name"><input id="name" name="name" className="input" required minLength={2} maxLength={80} /></Field>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
