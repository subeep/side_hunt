import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireFeed } from '@/lib/insights/guards';
import { getVisibleSharedAudited } from '@/lib/insights/visibility';
import { isBookmarked, listComments, myVote, voteSummary } from '@/lib/insights/engage';
import { ideasForEvidence } from '@/lib/insights/ideas';
import { themesForItem } from '@/lib/insights/themes';
import { authorize } from '@/lib/authz/policy';
import { AudienceChip, Alert, Badge, Card, fmtDay, PageHeader } from '@/components/ui';
import { EvidenceBadge, InsightsNav, StatusBadge } from '@/components/insights/parts';
import { ActionButton, InsightsForm } from '@/components/insights/Forms';
import { ReportSlot } from '@/components/insights/ReportSlot';
import { bookmarkAction, commentAction, moderateCommentAction, reportCommentAction, voteAction } from '../actions';

export const metadata = { title: 'Shared observation' };
const CONF: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const EVID: Record<string, string> = { first_hand: 'First-hand', aggregate_metric: 'Aggregate metric', external_report: 'External report', anecdotal: 'Anecdotal' };

export default async function FeedDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requireFeed(`/learn/feed/${id}`);
  const item = await getVisibleSharedAudited(p, id);
  if (!item) notFound(); // unknown, unpublished, withdrawn: indistinguishable
  const [comments, vote, marked, ideas, themes, summary] = await Promise.all([listComments(p, id), myVote(p, id), isBookmarked(p, 'shared', id), ideasForEvidence(p, id), themesForItem(p, id), voteSummary(p, id)]);
  const canModerate = authorize(p, 'learning.moderate').allow;
  const meta: [string, string | null][] = [
    ['Offering', item.offeringSlug], ['Industry (generalised)', item.industry], ['Region (generalised)', item.region], ['Observation period', item.periodLabel], ['Topic', item.topic],
    ['Type of evidence', item.evidenceType ? EVID[item.evidenceType] ?? item.evidenceType : null], ['Contributor’s confidence', item.confidence ? CONF[item.confidence] ?? item.confidence : null], ['Approved', fmtDay(item.publishedAt)],
  ];
  return (
    <div>
      <InsightsNav current="/learn" owner={p.grants.has('product_owner')} />
      <Link href="/learn" className="mb-4 inline-block text-sm">← Back to the shared feed</Link>
      <PageHeader eyebrow="Approved observation" title={item.title} actions={<><AudienceChip kind="community" /><EvidenceBadge q={item.evidenceQuality} /></>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card><p className="text-[1.02rem] leading-relaxed">{item.summary}</p>
            {item.attributionLabel && <p className="mt-4 text-sm text-muted">Shared with attribution (contributor consented, moderator approved): <strong>{item.attributionLabel}</strong></p>}
          </Card>
          <Alert tone="info">This is one organisation’s reviewed observation, de-identified by a moderator. It is not a statistic and does not show how common the issue is. Evidence quality is assessed by a moderator; confidence is the contributor’s own view.</Alert>

          <section aria-labelledby="c-h">
            <h2 id="c-h" className="mb-3 text-xl">Discussion</h2>
            <p className="mb-3 text-sm text-muted">Comments are visible to everyone who can see this observation. Please do not name customers, people or other organisations.</p>
            {comments && comments.length === 0 && <p className="mb-4 rounded-xl border border-dashed border-brown-300 p-4 text-sm text-muted">No comments yet. Share a related experience or ask what evidence would help.</p>}
            <ul className="mb-4 space-y-3">
              {comments?.map((c) => (
                <li key={c.id} className={`card !p-4 ${c.hidden ? 'opacity-60' : ''}`}>
                  <p className="text-sm"><strong>{c.authorName}</strong> <Badge>{c.label}</Badge> <span className="text-xs text-muted">{fmtDay(c.createdAt)}</span>{c.hidden && <Badge tone="clay" className="ml-2">Hidden by moderator</Badge>}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{c.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {!c.mine && (
                      <details className="text-xs">
                        <summary className="cursor-pointer font-semibold text-brown-700">Report</summary>
                        <InsightsForm action={reportCommentAction} submitLabel="Send report" className="mt-2 w-72 max-w-full">
                          <input type="hidden" name="commentId" value={c.id} />
                          <label className="label" htmlFor={`rr-${c.id}`}>Concern</label>
                          <select id={`rr-${c.id}`} name="reason" className="select" defaultValue="inappropriate"><option value="misleading">Misleading</option><option value="confidential">Contains confidential detail</option><option value="inappropriate">Inappropriate</option></select>
                        </InsightsForm>
                      </details>
                    )}
                    {c.mine && <ActionButton action={moderateCommentAction} fields={{ commentId: c.id, sharedId: id, status: 'removed' }} label="Delete my comment" className="btn btn-ghost btn-sm" confirm="Delete this comment?" />}
                    {canModerate && (c.hidden
                      ? <ActionButton action={moderateCommentAction} fields={{ commentId: c.id, sharedId: id, status: 'visible' }} label="Restore" className="btn btn-ghost btn-sm" />
                      : <ActionButton action={moderateCommentAction} fields={{ commentId: c.id, sharedId: id, status: 'hidden' }} label="Hide (moderator)" className="btn btn-ghost btn-sm" />)}
                  </div>
                </li>
              ))}
            </ul>
            <InsightsForm action={commentAction} submitLabel="Post comment" pendingText="Posting…">
              <input type="hidden" name="sharedId" value={id} />
              <label className="label" htmlFor="cbody">Add a comment</label>
              <textarea id="cbody" name="body" className="textarea" required minLength={2} maxLength={1000} placeholder="Add context, ask a question, or say what would make this more convincing." />
            </InsightsForm>
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="mb-3 text-base">Details</h2>
            <dl className="space-y-2 text-sm">
              {meta.map(([k, v]) => v && <div key={k}><dt className="text-xs uppercase tracking-wider text-muted">{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-1 text-base">Is this useful?</h2>
            <p className="mb-3 text-xs text-muted">Quality feedback for moderators. Votes are not shown as popularity.</p>
            <div className="flex flex-wrap gap-2">
              <ActionButton action={voteAction} fields={{ sharedId: id, vote: vote === 'useful' ? '' : 'useful' }} label="Useful" pressed={vote === 'useful'} />
              <ActionButton action={voteAction} fields={{ sharedId: id, vote: vote === 'needs_evidence' ? '' : 'needs_evidence' }} label="Needs evidence" pressed={vote === 'needs_evidence'} />
            </div>
            {summary && <p className="mt-3 text-xs text-muted">{summary.suppressed ? summary.reason : `Reviewer feedback: ${summary.useful} useful, ${summary.needsEvidence} needs evidence.`}</p>}
          </Card>
          <div className="flex flex-wrap gap-2">
            <ActionButton action={bookmarkAction} fields={{ type: 'shared', id }} label={marked ? 'Remove bookmark' : 'Bookmark'} pressed={marked} />
          </div>
          {themes.length > 0 && <Card><h2 className="mb-2 text-base">Appears in themes</h2><ul className="space-y-1 text-sm">{themes.map((t) => <li key={t.id}><Link href={`/learn/themes/${t.id}`}>{t.title}</Link></li>)}</ul></Card>}
          {ideas.length > 0 && <Card><h2 className="mb-2 text-base">Linked improvement ideas</h2><ul className="space-y-2 text-sm">{ideas.map((i) => <li key={i.id}><Link href={`/learn/ideas/${i.id}`}>{i.title}</Link> <StatusBadge status={i.status} /></li>)}</ul><p className="mt-2 text-xs text-muted">Status is not a delivery promise.</p></Card>}
          <ReportSlot sharedId={id} />
        </aside>
      </div>
    </div>
  );
}
