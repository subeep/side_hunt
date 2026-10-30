import { Alert, Badge, EmptyState, Field, fmtDay, PageHeader } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireGrant } from '@/lib/authz/guards';
import { listGrantCandidates, listGrantHolders } from '@/lib/admin/people';
import { GRANTS } from '@/db/schema/core';
import { grantAction, revokeGrantAction } from './actions';

export const metadata = { title: 'Platform grants' };
const WHAT: Record<string, string> = {
  portal_admin: 'Organisations, grants, config and operational controls',
  learning_moderator: 'Review submitted observations and publish shared copies',
  content_publisher: 'Website banners, public content and release notes',
  video_publisher: 'Live sessions, recordings and video audiences',
  product_owner: 'Improvement ideas linked to permitted evidence',
};

export default async function GrantsPage() {
  const p = await requireGrant('portal_admin');
  const [holders, candidates] = await Promise.all([listGrantHolders(p), listGrantCandidates(p)]);
  return (
    <div>
      <PageHeader eyebrow="Portal administration" title="Platform grants" description="Five separate permissions. They can only be given to verified employees: client users, client administrators and unverified accounts are refused." />
      <AdminNav current="/admin/grants" />
      <Alert tone="info" className="mb-6">You cannot revoke your own portal_admin grant, and the last portal administrator cannot be removed.</Alert>
      {holders.length === 0 ? <EmptyState title="No active grants" /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="table-basic">
            <thead><tr><th scope="col">Person</th><th scope="col">Grant</th><th scope="col">Since</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {holders.map((h) => (
                <tr key={h.id}>
                  <td><strong className="text-brown-900">{h.name}</strong><br /><span className="text-xs text-muted">{h.email}</span></td>
                  <td><Badge tone="brown">{h.permission}</Badge></td>
                  <td>{fmtDay(h.at)}</td>
                  <td>{!(h.permission === 'portal_admin' && h.userId === p.userId) && <ActionForm action={revokeGrantAction} submit="Revoke" variant="danger" inline confirmText={`Revoke ${h.permission} from ${h.email}?`}><input type="hidden" name="userId" value={h.userId} /><input type="hidden" name="permission" value={h.permission} /></ActionForm>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="card mt-10 max-w-2xl" aria-labelledby="new"><h2 id="new" className="mb-4 text-lg">Grant a permission</h2>
        <ActionForm action={grantAction} submit="Grant">
          <Field label="Employee" htmlFor="userId">
            <select id="userId" name="userId" className="select" required defaultValue="">
              <option value="" disabled>Choose an employee…</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
            </select>
          </Field>
          <Field label="Permission" htmlFor="permission">
            <select id="permission" name="permission" className="select" required defaultValue="">
              <option value="" disabled>Choose a permission…</option>
              {GRANTS.map((g) => <option key={g} value={g}>{g} — {WHAT[g]}</option>)}
            </select>
          </Field>
        </ActionForm>
      </section>
    </div>
  );
}
