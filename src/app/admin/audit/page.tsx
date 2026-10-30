import Link from 'next/link';
import { Badge, EmptyState, Field, fmtDate, PageHeader } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { requireGrant } from '@/lib/authz/guards';
import { listAudit } from '@/lib/admin/views';

export const metadata = { title: 'Audit viewer' };
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const p = await requireGrant('portal_admin');
  const sp = await searchParams;
  const q = Object.fromEntries(['action', 'actor', 'outcome', 'from', 'to', 'page'].map((k) => [k, one(sp[k])]));
  const r = await listAudit(p, q);
  const link = (page: number) => {
    const u = new URLSearchParams(Object.entries(r.filters).map(([k, v]) => [k, String(v)]));
    u.set('page', String(page));
    return `/admin/audit?${u}`;
  };
  return (
    <div>
      <PageHeader eyebrow="Portal administration" title="Audit viewer" description="Privileged actions and denied attempts. Invalid filter values are ignored." />
      <AdminNav current="/admin/audit" />
      <form method="get" className="card mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filter audit events">
        <Field label="Action starts with" htmlFor="action"><input id="action" name="action" className="input" defaultValue={r.filters.action} placeholder="admin.grant" maxLength={80} /></Field>
        <Field label="Actor (email or id)" htmlFor="actor"><input id="actor" name="actor" className="input" defaultValue={r.filters.actor} maxLength={120} /></Field>
        <Field label="Outcome" htmlFor="outcome"><select id="outcome" name="outcome" className="select" defaultValue={r.filters.outcome ?? ''}><option value="">Any</option><option value="ok">ok</option><option value="deny">deny</option></select></Field>
        <Field label="From" htmlFor="from"><input id="from" name="from" type="date" className="input" defaultValue={r.filters.from} /></Field>
        <Field label="To" htmlFor="to"><input id="to" name="to" type="date" className="input" defaultValue={r.filters.to} /></Field>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5"><button className="btn btn-primary btn-sm" type="submit">Apply filters</button><Link href="/admin/audit" className="btn btn-ghost btn-sm">Clear</Link></div>
      </form>
      <p className="mb-3 text-sm text-muted" aria-live="polite">{r.total} event{r.total === 1 ? '' : 's'} · page {r.page} of {r.pages}</p>
      {r.rows.length === 0 ? <EmptyState title="No matching events">Try widening the filters.</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="table-basic">
            <thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Actor</th><th scope="col">Target</th><th scope="col">Details</th></tr></thead>
            <tbody>
              {r.rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDate(e.at)}</td>
                  <td><code className="text-xs">{e.action}</code></td>
                  <td><Badge tone={e.outcome === 'ok' ? 'sage' : 'clay'}>{e.outcome}</Badge></td>
                  <td>{e.actorEmail ?? <span className="text-muted">{e.actorId ?? 'anonymous'}</span>}</td>
                  <td className="text-xs">{[e.resourceType, e.resourceId, e.orgId].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="max-w-xs break-words text-xs text-muted">{e.meta ? JSON.stringify(e.meta).slice(0, 200) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="mt-4 flex items-center gap-3" aria-label="Pagination">
        {r.page > 1 && <Link href={link(r.page - 1)} className="btn btn-secondary btn-sm">Previous</Link>}
        {r.page < r.pages && <Link href={link(r.page + 1)} className="btn btn-secondary btn-sm">Next</Link>}
      </nav>
    </div>
  );
}
