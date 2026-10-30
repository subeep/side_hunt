import Link from 'next/link';
import { Badge, EmptyState, fmtDate, PageHeader } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { requireGrant } from '@/lib/authz/guards';
import { listLeads } from '@/lib/admin/views';

export const metadata = { title: 'Public enquiries' };
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const p = await requireGrant('portal_admin');
  const sp = await searchParams;
  const r = await listLeads(p, { kind: one(sp.kind), page: one(sp.page) });
  const page = (n: number) => `/admin/leads?${new URLSearchParams({ ...(r.kind ? { kind: r.kind } : {}), page: String(n) })}`;
  return (
    <div>
      <PageHeader eyebrow="Portal administration" title="Public enquiries" description="Demo requests, hackathon interest and contact messages. They contain personal data, so each view is audited." />
      <AdminNav current="/admin/leads" />
      <p className="mb-4 flex flex-wrap gap-2 text-sm">
        {[['', 'All'], ['demo', 'Demo'], ['hackathon', 'Hackathon'], ['contact', 'Contact']].map(([k, l]) => <Link key={k} href={k ? `/admin/leads?kind=${k}` : '/admin/leads'} className={`btn btn-sm ${(r.kind ?? '') === k ? 'btn-primary' : 'btn-secondary'}`}>{l}</Link>)}
      </p>
      <p className="mb-3 text-sm text-muted">{r.total} enquir{r.total === 1 ? 'y' : 'ies'} · page {r.page} of {r.pages}</p>
      {r.rows.length === 0 ? <EmptyState title="No enquiries yet">Public form submissions appear here.</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="table-basic">
            <thead><tr><th scope="col">When</th><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Company</th><th scope="col">Message</th><th scope="col">Status</th></tr></thead>
            <tbody>{r.rows.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{fmtDate(l.createdAt)}</td><td><Badge tone="neutral">{l.kind}</Badge></td><td>{l.name}</td><td>{l.email}</td><td>{l.company ?? '—'}</td><td className="max-w-sm text-muted">{l.message ?? '—'}</td><td>{l.status}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <nav className="mt-4 flex gap-3" aria-label="Pagination">
        {r.page > 1 && <Link href={page(r.page - 1)} className="btn btn-secondary btn-sm">Previous</Link>}
        {r.page < r.pages && <Link href={page(r.page + 1)} className="btn btn-secondary btn-sm">Next</Link>}
      </nav>
    </div>
  );
}
