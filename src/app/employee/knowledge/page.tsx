import { Alert, Badge, EmptyState, Field, fmtDay, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireEmployee } from '@/lib/authz/guards';
import { feedbackSummary, isStale, listItems, RATINGS } from '@/lib/employee/items';
import { createKnowledgeAction, knowledgeFeedbackAction, reviewAction } from './actions';

export const metadata = { title: 'Knowledge library' };

export default async function KnowledgePage() {
  const p = await requireEmployee();
  const [items, fb] = await Promise.all([listItems(p, 'knowledge'), feedbackSummary(p, 'knowledge')]);
  const stale = items.filter((i) => isStale(i)).length;
  return (
    <div>
      <PageHeader eyebrow="Employee portal" title="Knowledge library" description="Internal guidance. Every article has an owner and a review date; overdue articles are flagged until the owner re-reviews them." />
      <EmployeeNav current="/employee/knowledge" />
      {stale > 0 && <Alert tone="warn" className="mb-6">{stale} article{stale === 1 ? ' is' : 's are'} past the review date. Treat flagged content with care and leave feedback if it is wrong.</Alert>}
      {items.length === 0 ? <EmptyState title="The library is empty">Add the first article below.</EmptyState> : (
        <ul className="space-y-4">
          {items.map((i) => {
            const old = isStale(i);
            const owner = i.ownerId === p.userId;
            const tally = fb.tallies.get(i.id) ?? {};
            const total = Object.values(tally).reduce((a, b) => a + b, 0);
            const flagged = (tally.outdated ?? 0) + (tally.incorrect ?? 0);
            const comments = fb.owned.get(i.id) ?? [];
            return (
              <li key={i.id} className={`card ${old ? '!border-amber/60' : ''}`}>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl">{i.title}</h2>{old ? <Badge tone="amber">Review overdue</Badge> : <Badge tone="sage">Current</Badge>}{(i.meta as { area?: string } | null)?.area && <Badge tone="neutral">{(i.meta as { area: string }).area}</Badge>}</div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{i.body}</p>
                <p className="mt-2 text-xs text-muted">Owner {i.ownerName} · review due {fmtDay(i.reviewDate)} · {total} feedback{total > 0 && ` (${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')})`}</p>
                {flagged > 0 && <p className="mt-1 text-xs font-semibold text-clay">{flagged} reader{flagged === 1 ? '' : 's'} flagged this as outdated or incorrect{owner ? ': please review it.' : '.'}</p>}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-brown-700">{owner ? 'Review or give feedback' : 'Give feedback'}</summary>
                  {owner && (
                    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
                      <h3 className="text-sm font-semibold text-brown-900">Feedback on your article</h3>
                      {comments.length === 0 ? <p className="mt-1 text-sm text-muted">No feedback yet.</p> : (
                        <ul className="mt-2 space-y-2 text-sm">{comments.map((c, n) => <li key={n}><Badge tone={c.rating === 'helpful' ? 'sage' : 'amber'}>{c.rating}</Badge> <span className="text-xs text-muted">{c.name ?? 'Colleague'} · {fmtDay(c.at)}</span>{c.comment && <p className="mt-1 whitespace-pre-line">{c.comment}</p>}</li>)}</ul>
                      )}
                    </div>
                  )}
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <ActionForm action={knowledgeFeedbackAction} submit="Send feedback" variant="secondary">
                      <input type="hidden" name="id" value={i.id} />
                      <Field label="Is this article…" htmlFor={`rt-${i.id}`}><select id={`rt-${i.id}`} name="rating" className="select">{RATINGS.knowledge.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
                      <Field label="Comment (optional)" htmlFor={`cm-${i.id}`}><textarea id={`cm-${i.id}`} name="comment" className="textarea !min-h-16" maxLength={1000} /></Field>
                    </ActionForm>
                    {owner && (
                      <ActionForm action={reviewAction} submit="Mark as reviewed">
                        <input type="hidden" name="id" value={i.id} />
                        <Field label="Update the text (optional)" htmlFor={`bd-${i.id}`}><textarea id={`bd-${i.id}`} name="body" className="textarea !min-h-16" maxLength={4000} defaultValue={i.body ?? ''} /></Field>
                      </ActionForm>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <section className="card mt-10 max-w-2xl" aria-labelledby="new"><h2 id="new" className="mb-4 text-lg">Add an article</h2>
        <ActionForm action={createKnowledgeAction} submit="Add article">
          <Field label="Title" htmlFor="title"><input id="title" name="title" className="input" required minLength={3} maxLength={120} /></Field>
          <Field label="Area (optional)" htmlFor="area"><input id="area" name="area" className="input" maxLength={60} /></Field>
          <Field label="Content" htmlFor="body" hint="You become the owner and are responsible for the 90-day review."><textarea id="body" name="body" className="textarea" required minLength={10} maxLength={4000} /></Field>
        </ActionForm>
      </section>
    </div>
  );
}
