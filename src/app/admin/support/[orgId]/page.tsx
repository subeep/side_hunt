import Link from 'next/link';
import { Alert, Badge, EmptyState, fmtDate, PageHeader, Stat } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { requireGrant } from '@/lib/authz/guards';
import { getSupportSummary } from '@/lib/admin/support';
import { forbidden } from 'next/navigation';
import { AuthzError } from '@/lib/employee/common';

export const metadata = { title: 'Support summary' };

export default async function SupportSummaryPage({ params }: { params: Promise<{ orgId: string }> }) {
  const p = await requireGrant('portal_admin');
  const { orgId } = await params;
  let s;
  try {
    s = await getSupportSummary(p, orgId); // audits support.access (ok) or a deny, and refuses without an active authorisation
  } catch (e) {
    if (e instanceof AuthzError) forbidden();
    throw e;
  }
  const c = s.counts;
  return (
    <div>
      <PageHeader eyebrow="Support summary" title={s.org.name} description="A minimised summary. Draft titles, observation text, authors and attachments are never shown here." actions={<Link href="/admin/support" className="btn btn-secondary btn-sm">Support authorisations</Link>} />
      <AdminNav current="/admin/support" />
      <Alert tone="warn" className="mb-6">This view was recorded in the audit trail. Authorisation expires {fmtDate(s.authorisation?.expiresAt)}. Reason: {s.authorisation?.reason}</Alert>
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Active members" value={c.activeMembers} />
        <Stat label="Sandbox runs" value={c.sandboxRuns} />
        <Stat label="Open support tickets" value={c.openTickets} />
      </div>
      <h2 className="mb-3 text-xl">Contributions by status</h2>
      {Object.keys(c.contributionsByStatus).length === 0 ? <EmptyState title="No contributions" /> : (
        <p className="mb-8 flex flex-wrap gap-2">{Object.entries(c.contributionsByStatus).map(([k, n]) => <Badge key={k} tone="neutral">{k.replace('_', ' ')} · {n}</Badge>)}</p>
      )}
      <h2 className="mb-3 text-xl">Submitted contribution titles</h2>
      {s.contributionTitles.length === 0 ? <EmptyState title="No submitted contributions">Drafts are private to their authors and are never listed, even here.</EmptyState> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="table-basic">
            <thead><tr><th scope="col">Title</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Updated</th></tr></thead>
            <tbody>{s.contributionTitles.map((t) => <tr key={t.id}><td>{t.title}</td><td>{t.kind.replace('_', ' ')}</td><td><Badge tone="neutral">{t.status.replace('_', ' ')}</Badge></td><td>{fmtDate(t.updatedAt)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
