import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireGrant } from '@/lib/authz/guards';
import { investigateReport } from '@/lib/learning/review';
import { REPORT_REASONS } from '@/lib/learning/constants';
import { Alert, Badge, Card, PageHeader, fmtDate } from '@/components/ui';
import { ActionForm } from '@/components/learning/ActionForm';
import { decideReportAction, reinstateAction, unpublishAction } from '../../actions';

export const metadata = { title: 'Investigate report' };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireGrant('learning_moderator');
  const d = await investigateReport(p, id);
  if (!d || !d.shared) notFound();
  const { report: r, shared: s, reporterOrgName, siblings } = d;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/moderation" className="text-sm">&larr; Moderation queue</Link>
      <PageHeader eyebrow="Report" title={REPORT_REASONS[r.reason]} description={<span className="flex flex-wrap items-center gap-2"><Badge tone={r.status === 'open' ? 'amber' : 'neutral'}>{r.status}</Badge><span className="text-sm">received {fmtDate(r.createdAt)}</span></span>} />
      <Alert tone="info">Reporter: <strong>{reporterOrgName ?? 'unknown organisation'}</strong>. This is visible to moderators only. Never share it with the contributor or other clients. The reporter was not asked to identify any other client.</Alert>

      <Card className="space-y-2">
        <h2 className="text-xl">What was reported</h2>
        <div className="flex flex-wrap items-center gap-2"><Badge tone={s.status === 'published' ? 'sage' : 'clay'}>{s.status}</Badge><span className="text-xs text-muted">version {s.version}</span></div>
        <p className="font-serif text-lg text-brown-900">{s.title}</p>
        <p className="text-sm">{s.summary}</p>
        <p className="text-sm"><span className="font-semibold">Reporter’s details:</span> {r.details || <span className="text-muted">none given</span>}</p>
        <p className="text-sm"><Link href={`/moderation/${s.contributionId}`}>Open the private source and history for this item</Link></p>
        {siblings.length > 1 && <p className="text-xs text-muted">{siblings.length} reports exist for this item ({siblings.filter((x) => x.status === 'open').length} open).</p>}
      </Card>

      {s.status === 'published' && (
        <Card>
          <h2 className="text-xl">Take it offline while you investigate</h2>
          <p className="mb-3 mt-1 text-sm text-muted">Temporary. It leaves search and caches immediately; the contributor is told with your public reason (never who reported).</p>
          <ActionForm action={unpublishAction} submitLabel="Unpublish temporarily" buttonClass="btn-danger">
            <input type="hidden" name="sharedId" value={s.id} />
            <input type="hidden" name="reportId" value={r.id} />
            <div><label className="label" htmlFor="rp">Public reason</label><textarea id="rp" name="reasonPublic" className="textarea min-h-16" required minLength={5} maxLength={600} defaultValue="We are reviewing a concern about this observation and have taken the shared version offline in the meantime." /></div>
            <div><label className="label" htmlFor="ri">Internal note</label><textarea id="ri" name="internalNote" className="textarea min-h-16" maxLength={1000} /></div>
          </ActionForm>
        </Card>
      )}
      {s.status === 'unpublished' && (
        <Card>
          <h2 className="text-xl">Reinstate</h2>
          <ActionForm action={reinstateAction} submitLabel="Reinstate shared copy" buttonClass="btn-secondary" className="mt-2"><input type="hidden" name="sharedId" value={s.id} /></ActionForm>
        </Card>
      )}

      {r.status === 'open' ? (
        <Card>
          <h2 className="text-xl">Record your decision</h2>
          <ActionForm action={decideReportAction} submitLabel="Record decision" className="mt-3">
            <input type="hidden" name="reportId" value={r.id} />
            <fieldset className="space-y-1.5">
              <legend className="label">Decision</legend>
              <label className="flex gap-2 text-sm"><input type="radio" name="decision" value="actioned" required /> Actioned: the concern is upheld (the item is taken offline if still published)</label>
              <label className="flex gap-2 text-sm"><input type="radio" name="decision" value="dismissed" required /> Dismissed: no change to the item</label>
            </fieldset>
            <div><label className="label" htmlFor="note">Decision note (internal)</label><textarea id="note" name="note" className="textarea min-h-20" required minLength={5} maxLength={600} /></div>
            <div><label className="label" htmlFor="rpub">Public reason for the contributor, if actioned (optional)</label><textarea id="rpub" name="reasonPublic" className="textarea min-h-16" maxLength={600} /></div>
          </ActionForm>
        </Card>
      ) : (
        <Alert tone="ok">Decided {fmtDate(r.decidedAt)}: <strong>{r.status}</strong>. Note: {r.decisionNote}</Alert>
      )}
    </div>
  );
}
