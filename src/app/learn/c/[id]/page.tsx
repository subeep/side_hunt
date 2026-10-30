import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/authz/guards';
import { enforceClientTerms } from '@/lib/client/guard';
import { authorTimeline, getContributionForViewer } from '@/lib/learning/access';
import { consentHistory, stateFromHistory } from '@/lib/learning/consent';
import { sharedVersions } from '@/lib/learning/publish';
import { submissionGaps } from '@/lib/learning/validation';
import { CONFIDENCE_LABELS, EVIDENCE_TYPES, offeringName, statusBody } from '@/lib/learning/constants';
import { Alert, Card, PageHeader, fmtDate } from '@/components/ui';
import { LearnNav } from '@/components/learning/LearnNav';
import { SharingChip, StatusBadge, kindLabel } from '@/components/learning/badges';
import { FlagList } from '@/components/learning/SensitiveText';
import { SubmitPanel } from '@/components/learning/SubmitPanel';
import { WithdrawPanel } from '@/components/learning/WithdrawPanel';
import { ConsentPassport } from '@/components/learning/ConsentPassport';
import { submitContributionAction, withdrawAction } from './actions';

export const metadata = { title: 'Observation' };

const EVENT_LABEL: Record<string, string> = {
  submitted: 'Submitted for review', resubmitted: 'Resubmitted after amendment', revision_submitted: 'New version submitted for renewed review', claimed: 'A moderator started the review',
  redacted: 'A moderator prepared the shared version', clarification_requested: 'A moderator asked for clarification', published: 'Published', rejected: 'Not published', unpublished: 'Temporarily unpublished',
  reinstated: 'Published again', withdrawn: 'Withdrawn', shared_with_organisation: 'Shared with your organisation',
};

export default async function ContributionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const p = await requireUser(`/learn/c/${id}`);
  await enforceClientTerms(p);
  const found = await getContributionForViewer(p, id);
  if (!found) notFound(); // never reveal whether the id exists
  const { c, role } = found;
  const isAuthorView = role === 'author';
  const privileged = role === 'author' || role === 'support';
  const [history, shared, timeline] = privileged ? await Promise.all([consentHistory(id), sharedVersions(id), authorTimeline(id)]) : [[], [], []];
  const consents = stateFromHistory(history);
  const flags = c.sensitiveFlags ?? [];
  const live = shared.find((s) => s.status === 'published' || s.status === 'unpublished');
  const gaps = submissionGaps(c);
  const canEdit = isAuthorView && ['draft', 'clarification_requested', 'published'].includes(c.status);
  const canSubmit = isAuthorView && ['draft', 'clarification_requested'].includes(c.status) && c.sharingChoice !== 'private';
  const pendingCommunity = c.sharingChoice === 'community' && ['submitted', 'in_review', 'clarification_requested'].includes(c.status);
  const canWithdraw = isAuthorView && (!!live || pendingCommunity || (c.sharingChoice === 'organisation' && c.status === 'published'));
  const withdrawKind = live ? 'live' : pendingCommunity ? 'pending' : 'org';
  const meta: [string, string | null][] = [
    ['Offering', offeringName(c.offeringSlug)], ['Topic', c.topic], ['Industry', c.industry], ['Region', c.region], ['Observation period', c.observationPeriod],
    ['Evidence type', c.evidenceType ? EVIDENCE_TYPES[c.evidenceType] : null], ['Confidence', c.confidence ? CONFIDENCE_LABELS[c.confidence] : null],
  ];
  const back = c.sharingChoice === 'private' || isAuthorView ? '/learn/mine' : '/learn/org';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <LearnNav current={back} />
      <PageHeader
        eyebrow={role === 'author' ? 'Your private source' : role === 'org_member' ? `Organisation-only · ${p.activeOrgName}` : 'Support view (read-only, audited)'}
        title={c.title}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={c.status} /><SharingChip choice={c.sharingChoice} status={c.status} />{c.version > 1 && <span className="badge badge-neutral">Version {c.version}</span>}<span className="text-sm">{kindLabel(c.kind)}</span></span>}
        actions={canEdit ? <Link className="btn btn-secondary" href={`/learn/c/${id}/edit`}>{c.status === 'published' ? 'Edit (creates a new version)' : 'Edit'}</Link> : undefined}
      />
      {sp.saved && <Alert tone="ok">Saved. This is still private to you: nothing was shared or sent for review.</Alert>}
      {sp.submitted && <Alert tone="ok">{c.sharingChoice === 'community' ? 'Submitted for moderator review. You will be notified in-app at each step (email is not part of this release).' : 'Shared with your organisation.'}</Alert>}
      {sp.renewed && <Alert tone="ok">New version saved and sent for renewed review. The version that is live now stays as it is until the new one is approved.</Alert>}
      {role === 'support' && <Alert tone="warn">You are viewing this under an active support authorisation. This access is audited.</Alert>}

      <Card>
        <p className="text-sm">{statusBody(c.status, c.sharingChoice)}</p>
        {isAuthorView && c.lastModeratorMessage && ['clarification_requested', 'rejected', 'unpublished'].includes(c.status) && (
          <Alert tone={c.status === 'clarification_requested' ? 'warn' : 'danger'} className="mt-3">
            <p className="font-semibold">Message from the moderator</p>
            <p className="mt-1 whitespace-pre-wrap">{c.lastModeratorMessage}</p>
          </Alert>
        )}
        {isAuthorView && c.status === 'clarification_requested' && <p className="mt-3 text-sm">Use <Link href={`/learn/c/${id}/edit`}>Edit</Link> to amend, then resubmit below.</p>}
        {isAuthorView && c.sharingChoice === 'private' && <p className="mt-3 text-sm text-muted">This is private to you. To share it, edit it and choose “within my organisation” or “propose sharing with the learning community”, then submit.</p>}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl">Observation</h2>
        <p className="whitespace-pre-wrap leading-relaxed">{c.observation}</p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {meta.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-xs font-semibold uppercase tracking-wider text-muted">{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {(c.supportLinks ?? []).length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Support links</p>
            <ul className="list-disc pl-5 text-sm">{c.supportLinks!.map((l) => <li key={l} className="break-all">{/^https?:\/\//i.test(l) ? <a href={l} rel="noopener noreferrer nofollow" target="_blank">{l}</a> : l}</li>)}</ul>
          </div>
        )}
        {privileged && <FlagList flags={flags} title="Scan flags (shown to you and to the moderator)" />}
      </Card>

      {canSubmit && <SubmitPanel action={submitContributionAction} contributionId={id} sharingChoice={c.sharingChoice as 'organisation' | 'community'} flags={flags} gaps={gaps} resubmit={c.status === 'clarification_requested'} />}

      {privileged && live && (
        <Card className="space-y-2 border-sage/40">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl">What the community sees</h2><span className="badge badge-sage">Shared reviewed copy · v{live.version}</span>{live.status === 'unpublished' && <span className="badge badge-clay">Offline</span>}</div>
          <p className="text-sm text-muted">This is the moderator-approved version. It does not contain your original text, your name or your organisation{live.attributionLabel ? ' except the attribution you agreed to' : ''}.</p>
          <p className="font-serif text-lg text-brown-900">{live.title}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{live.summary}</p>
          <p className="text-xs text-muted">{[live.industry, live.region, live.periodLabel, live.attributionLabel && `Credit: ${live.attributionLabel}`].filter(Boolean).join(' · ')}</p>
        </Card>
      )}

      {privileged && (
        <ConsentPassport contributionId={id} version={c.version} sharingChoice={c.sharingChoice} status={c.status} state={consents} history={history} shared={shared} canEdit={isAuthorView} />
      )}

      {/* Stays mounted right after withdrawal (status 'withdrawn') so the invalidation trace in its action state is not discarded by the re-render. */}
      {isAuthorView && (canWithdraw || c.status === 'withdrawn') && <WithdrawPanel action={withdrawAction} contributionId={id} kind={withdrawKind} available={canWithdraw} />}

      {privileged && (
        <Card>
          <h2 className="text-xl">History</h2>
          {timeline.length === 0 ? <p className="mt-2 text-sm text-muted">No events yet. This is a private draft.</p> : (
            <ol className="mt-3 space-y-3">
              {timeline.filter((t) => t.decision !== 'redacted').map((t) => (
                <li key={t.id} className="border-l-2 border-brown-200 pl-3">
                  <p className="text-sm font-medium text-brown-900">{EVENT_LABEL[t.decision] ?? t.decision}</p>
                  <p className="text-xs text-muted">{fmtDate(t.at)}{t.actorRole === 'moderator' ? ' · moderation team' : ''}</p>
                  {t.reasonPublic && <p className="mt-1 text-sm">{t.reasonPublic}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}
