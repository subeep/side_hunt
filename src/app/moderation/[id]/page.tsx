import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireGrant } from '@/lib/authz/guards';
import { moderationDetail } from '@/lib/learning/review';
import { CONFIDENCE_LABELS, CONSENT_COPY, EVIDENCE_TYPES, REPORT_REASONS, offeringName } from '@/lib/learning/constants';
import { CONSENT_PURPOSES } from '@/db/schema/learning';
import { Alert, Badge, Card, PageHeader, fmtDate } from '@/components/ui';
import { StatusBadge, kindLabel } from '@/components/learning/badges';
import { FlagList, SensitiveText } from '@/components/learning/SensitiveText';
import { ActionForm } from '@/components/learning/ActionForm';
import { ReviewForm } from '@/components/learning/ReviewForm';
import { claimAction, clarifyAction, publishAction, reinstateAction, rejectAction, saveRedactionAction, unpublishAction } from '../actions';

export const metadata = { title: 'Review contribution' };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireGrant('learning_moderator');
  const d = await moderationDetail(p, id);
  if (!d) notFound(); // drafts, private and organisation-only items are 404 even for moderators
  const { c, draft, events, shared, reports, orgName, consents } = d;
  const meta: [string, string | null][] = [
    ['Offering', offeringName(c.offeringSlug)], ['Topic', c.topic], ['Industry', c.industry], ['Region', c.region], ['Observation period', c.observationPeriod],
    ['Evidence type', c.evidenceType ? EVIDENCE_TYPES[c.evidenceType] : null], ['Confidence', c.confidence ? CONFIDENCE_LABELS[c.confidence] : null],
  ];
  const flags = c.sensitiveFlags ?? [];
  return (
    <div className="space-y-6">
      <Link href="/moderation" className="text-sm">&larr; Moderation queue</Link>
      <PageHeader
        eyebrow={`${orgName} · version ${c.version}`}
        title={c.title}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={c.status} /><span className="text-sm">{kindLabel(c.kind)} · submitted {fmtDate(c.submittedAt)}</span></span>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 border-clay/30 bg-paper-2/50">
          <div>
            <p className="eyebrow">Private source · never shown to other clients</p>
            <h2 className="mt-1 text-xl">Original</h2>
          </div>
          <SensitiveText text={c.title} />
          <SensitiveText text={c.observation} />
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {meta.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-xs font-semibold uppercase tracking-wider text-muted">{k}</dt><dd><SensitiveText text={v!} /></dd></div>)}
          </dl>
          {(c.supportLinks ?? []).length > 0 && <ul className="list-disc pl-5 text-sm break-all">{c.supportLinks!.map((l) => <li key={l}>{l}</li>)}</ul>}
          <FlagList flags={flags} title="Scan flags stored with this submission" />
          <p className="text-xs text-muted">{c.sensitiveAcknowledged ? 'The author acknowledged the flags before submitting.' : 'No flags were raised at submission.'} The scan is a helper, not a privacy guarantee: read the text yourself.</p>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="eyebrow">Shared representation · what the community would see</p>
            <h2 className="mt-1 text-xl">Reviewed version</h2>
          </div>
          {c.status === 'submitted' && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Claim this contribution to start redacting a shared version. Claiming is audited and notifies the contributor that review has begun.</p>
              <ActionForm action={claimAction} submitLabel="Claim for review"><input type="hidden" name="contributionId" value={id} /></ActionForm>
            </div>
          )}
          {c.status === 'in_review' && draft && (
            <ReviewForm
              contributionId={id}
              source={{ title: c.title, observation: c.observation, industry: c.industry, region: c.region, period: c.observationPeriod }}
              initial={{ title: draft.title, summary: draft.summary, industry: draft.industry ?? '', region: draft.region ?? '', periodLabel: draft.periodLabel ?? '', evidenceQuality: draft.evidenceQuality, includeAttribution: draft.includeAttribution, redactionNotes: draft.redactionNotes ?? '', reviewed: draft.reviewed }}
              attributionConsented={consents.attribution.granted}
              orgName={orgName}
              saveAction={saveRedactionAction}
              publishAction={publishAction}
            />
          )}
          {c.status === 'in_review' && !draft && <Alert tone="warn">No working representation exists for this item. Ask an administrator to investigate.</Alert>}
          {c.status === 'clarification_requested' && <Alert tone="info">Waiting for the contributor. Your question: <em>{c.lastModeratorMessage}</em></Alert>}
          {['rejected', 'withdrawn'].includes(c.status) && <Alert tone="info">This contribution is {c.status}. No further review action is possible.</Alert>}
          {['published', 'unpublished'].includes(c.status) && <p className="text-sm text-muted">Published copies are listed below. A material edit by the author will return here as a new version for renewed review.</p>}
        </Card>
      </div>

      {c.status === 'in_review' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-xl">Request clarification</h2>
            <p className="mb-3 mt-1 text-sm text-muted">The message is shown to the contributor. Do not include internal reasoning in it.</p>
            <ActionForm action={clarifyAction} submitLabel="Send question to contributor" buttonClass="btn-secondary">
              <input type="hidden" name="contributionId" value={id} />
              <div><label className="label" htmlFor="message">Public message</label><textarea id="message" name="message" className="textarea min-h-24" required minLength={5} maxLength={600} /></div>
              <div><label className="label" htmlFor="ci">Internal note (never shown to the contributor)</label><textarea id="ci" name="internalNote" className="textarea min-h-16" maxLength={1000} /></div>
            </ActionForm>
          </Card>
          <Card>
            <h2 className="text-xl">Reject</h2>
            <p className="mb-3 mt-1 text-sm text-muted">The contributor sees the category and your public reason. The internal note stays with moderators.</p>
            <ActionForm action={rejectAction} submitLabel="Reject contribution" buttonClass="btn-danger">
              <input type="hidden" name="contributionId" value={id} />
              <div><label className="label" htmlFor="cat">Category</label><select id="cat" name="category" className="select" required><option value="duplicate">Duplicate</option><option value="unsafe">Unsafe or too identifying</option><option value="not_suitable">Not suitable for sharing</option></select></div>
              <div><label className="label" htmlFor="rp">Public reason</label><textarea id="rp" name="reasonPublic" className="textarea min-h-20" required minLength={5} maxLength={600} /></div>
              <div><label className="label" htmlFor="ri">Internal note</label><textarea id="ri" name="internalNote" className="textarea min-h-16" maxLength={1000} /></div>
            </ActionForm>
          </Card>
        </div>
      )}

      {shared.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-xl">Shared copies</h2>
          {shared.map((s) => (
            <div key={s.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={s.status === 'published' ? 'sage' : s.status === 'unpublished' ? 'clay' : 'neutral'}>{s.status}</Badge><span className="text-xs text-muted">v{s.version} · {fmtDate(s.publishedAt)}</span></div>
              <p className="mt-1 font-medium text-brown-900">{s.title}</p>
              <p className="text-sm text-muted">{s.summary}</p>
              {s.status === 'published' && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-clay">Unpublish temporarily</summary>
                  <ActionForm action={unpublishAction} submitLabel="Unpublish now" buttonClass="btn-danger" className="mt-2">
                    <input type="hidden" name="sharedId" value={s.id} />
                    <div><label className="label" htmlFor={`up-${s.id}`}>Public reason (shown to the contributor)</label><textarea id={`up-${s.id}`} name="reasonPublic" className="textarea min-h-16" required minLength={5} maxLength={600} /></div>
                    <div><label className="label" htmlFor={`ui-${s.id}`}>Internal note</label><textarea id={`ui-${s.id}`} name="internalNote" className="textarea min-h-16" maxLength={1000} /></div>
                  </ActionForm>
                </details>
              )}
              {s.status === 'unpublished' && (
                <ActionForm action={reinstateAction} submitLabel="Reinstate" buttonClass="btn-secondary" className="mt-2">
                  <input type="hidden" name="sharedId" value={s.id} />
                  <div><label className="label" htmlFor={`ri-${s.id}`}>Internal note</label><input id={`ri-${s.id}`} name="internalNote" className="input" maxLength={1000} /></div>
                </ActionForm>
              )}
            </div>
          ))}
          {reports.length > 0 && (
            <div>
              <p className="eyebrow mb-1">Reports on these copies</p>
              <ul className="space-y-1 text-sm">{reports.map((r) => <li key={r.id}><Link href={`/moderation/reports/${r.id}`}>{REPORT_REASONS[r.reason]}</Link> · <Badge tone={r.status === 'open' ? 'amber' : 'neutral'}>{r.status}</Badge> · {fmtDate(r.createdAt)}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      <Card>
        <h2 className="text-xl">Consent state</h2>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {CONSENT_PURPOSES.map((k) => <li key={k} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"><span>{CONSENT_COPY[k].label}</span><Badge tone={consents[k].granted ? 'sage' : 'neutral'}>{consents[k].granted ? 'granted' : 'not granted'}</Badge></li>)}
        </ul>
      </Card>

      <Card>
        <h2 className="text-xl">Decision history</h2>
        <p className="mt-1 text-sm text-muted">Internal. Internal notes are visible to moderators only: contributors see public reasons, other clients see nothing.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="table-basic">
            <thead><tr><th>When</th><th>Event</th><th>By</th><th>Public reason</th><th>Internal note</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{fmtDate(e.at)}</td>
                  <td>{e.decision.replace(/_/g, ' ')}{e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus ? <span className="text-xs text-muted"> ({e.fromStatus} → {e.toStatus})</span> : null}</td>
                  <td>{e.actorRole}</td>
                  <td>{e.reasonPublic ?? ''}</td>
                  <td className="text-muted">{e.internalNote ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
