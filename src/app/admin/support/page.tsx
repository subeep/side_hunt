import Link from 'next/link';
import { Alert, Badge, EmptyState, Field, fmtDate, PageHeader } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireGrant } from '@/lib/authz/guards';
import { listClientOrgsLite, listSupportAuthorisations, SUPPORT_HOURS } from '@/lib/admin/support';
import { authoriseAction, revokeSupportAction } from './actions';

export const metadata = { title: 'Support access' };
const tone = { active: 'sage', expired: 'neutral', revoked: 'clay' } as const;

export default async function SupportPage() {
  const p = await requireGrant('portal_admin');
  const [rows, orgs] = await Promise.all([listSupportAuthorisations(p), listClientOrgsLite(p)]);
  return (
    <div>
      <PageHeader eyebrow="Portal administration" title="Support authorisations" description="A portal administrator sees a summary of a client organisation's private content only under an explicit, reasoned, time-boxed authorisation. Each use is audited and the client's administrators are notified." />
      <AdminNav current="/admin/support" />
      <Alert tone="warn" className="mb-6">Without an active authorisation for you and that organisation, the summary page returns 403 and the attempt is recorded.</Alert>
      {rows.length === 0 ? <EmptyState title="No support authorisations">Nothing has been authorised. Create one below when a support case needs it.</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="table-basic">
            <thead><tr><th scope="col">Organisation</th><th scope="col">Administrator</th><th scope="col">Reason</th><th scope="col">Expires</th><th scope="col">State</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.orgName}</td><td>{r.adminEmail}{r.mine && <Badge tone="neutral" className="ml-1">you</Badge>}</td><td className="max-w-xs">{r.reason}</td><td>{fmtDate(r.expiresAt)}</td>
                  <td><Badge tone={tone[r.state]}>{r.state}</Badge></td>
                  <td>
                    {r.state === 'active' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {r.mine && <Link href={`/admin/support/${r.orgId}`} className="btn btn-secondary btn-sm">Open summary</Link>}
                        <ActionForm action={revokeSupportAction} submit="Revoke" variant="danger" inline><input type="hidden" name="id" value={r.id} /></ActionForm>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="card mt-10 max-w-2xl" aria-labelledby="new"><h2 id="new" className="mb-4 text-lg">Authorise support access</h2>
        <ActionForm action={authoriseAction} submit="Authorise">
          <Field label="Organisation" htmlFor="orgId"><select id="orgId" name="orgId" className="select" required defaultValue=""><option value="" disabled>Choose an organisation…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
          <Field label="Reason (mandatory)" htmlFor="reason" hint="At least 15 characters. Stored in the audit trail and shown to the client's administrators."><textarea id="reason" name="reason" className="textarea !min-h-20" required minLength={15} maxLength={500} /></Field>
          <Field label="Duration" htmlFor="hours"><select id="hours" name="hours" className="select" defaultValue="1">{SUPPORT_HOURS.map((h) => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}</select></Field>
        </ActionForm>
      </section>
    </div>
  );
}
