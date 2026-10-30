import Link from 'next/link';
import { requireGrant } from '@/lib/authz/guards';
import { moderationQueue, openReports } from '@/lib/learning/review';
import { Alert, Badge, EmptyState, PageHeader, Stat, fmtDate } from '@/components/ui';
import { StatusBadge, kindLabel } from '@/components/learning/badges';
import { REPORT_REASONS } from '@/lib/learning/constants';

export const metadata = { title: 'Moderation' };

export default async function ModerationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await requireGrant('learning_moderator');
  const sp = await searchParams;
  const [queue, reports] = await Promise.all([moderationQueue(p), openReports(p)]);
  const count = (s: string) => queue.filter((q) => q.status === s).length;
  const banner = sp.published ? 'Published. A reviewed, de-identified copy is now live and indexed.' : sp.clarification ? 'Clarification requested. The contributor was notified.' : sp.rejected ? 'Rejected. The contributor was notified with your public reason.' : sp.reportDecided ? 'Report decision recorded.' : null;
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Learning moderation" title="Moderation queue" description="Review observations that authors explicitly submitted for community sharing, prepare a de-identified shared version, and handle reports. You can only open items that were submitted: drafts, private items and organisation-only items are not visible to moderators." />
      {banner && <Alert tone="ok">{banner}</Alert>}
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Awaiting claim" value={count('submitted')} />
        <Stat label="In review" value={count('in_review')} />
        <Stat label="Waiting on contributor" value={count('clarification_requested')} />
        <Stat label="Open reports" value={reports.length} />
      </div>

      <section aria-labelledby="queue">
        <h2 id="queue" className="mb-3 text-2xl">Review queue</h2>
        {queue.length === 0 ? (
          <EmptyState title="The queue is empty">Nothing has been submitted for community review. New submissions appear here and notify you in-app.</EmptyState>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table-basic">
              <thead><tr><th>Contribution</th><th>Organisation</th><th>Status</th><th>Submitted</th><th>Scan flags</th><th /></tr></thead>
              <tbody>
                {queue.map((q) => (
                  <tr key={q.id}>
                    <td><p className="font-medium text-brown-900">{q.title}</p><p className="text-xs text-muted">{kindLabel(q.kind)}{q.version > 1 ? ` · version ${q.version}` : ''}</p></td>
                    <td>{q.orgName}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td className="whitespace-nowrap">{fmtDate(q.submittedAt)}</td>
                    <td>{(q.flags?.length ?? 0) > 0 ? <Badge tone="amber">{q.flags!.length} flagged</Badge> : <span className="text-xs text-muted">none</span>}</td>
                    <td><Link className="btn btn-secondary btn-sm" href={`/moderation/${q.id}`}>{q.status === 'submitted' ? 'Review' : 'Open'}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="reports">
        <h2 id="reports" className="mb-3 text-2xl">Open reports</h2>
        {reports.length === 0 ? (
          <EmptyState title="No open reports">Reports on shared observations appear here. Reporters are visible only to moderators.</EmptyState>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table-basic">
              <thead><tr><th>Shared item</th><th>Concern</th><th>Item status</th><th>Reported</th><th /></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium text-brown-900">{r.sharedTitle}</td>
                    <td>{REPORT_REASONS[r.reason]}</td>
                    <td><Badge tone={r.sharedStatus === 'published' ? 'sage' : 'clay'}>{r.sharedStatus}</Badge></td>
                    <td className="whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                    <td><Link className="btn btn-secondary btn-sm" href={`/moderation/reports/${r.id}`}>Investigate</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
