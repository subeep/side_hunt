import { Alert, AudienceChip, Badge, EmptyState, Field, fmtDay, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireEmployee } from '@/lib/authz/guards';
import { authorize } from '@/lib/authz';
import { feedbackSummary, listItems } from '@/lib/employee/items';
import { createNoteAction, noteFeedbackAction } from './actions';

export const metadata = { title: 'Release notes' };

export default async function ReleaseNotesPage() {
  const p = await requireEmployee();
  const [notes, fb] = await Promise.all([listItems(p, 'release_note'), feedbackSummary(p, 'release_note')]);
  const canPost = authorize(p, 'content.publish').allow;
  return (
    <div>
      <PageHeader eyebrow="Employee portal" title="Release notes" description="What changed in the prototype. Internal wording: it may mention behaviour that is not public." />
      <EmployeeNav current="/employee/release-notes" />
      {!canPost && <Alert tone="info" className="mb-6">Read-only for you. Posting a release note needs the content_publisher grant.</Alert>}
      {notes.length === 0 ? <EmptyState title="No release notes yet" /> : (
        <ul className="space-y-4">
          {notes.map((n) => {
            const tally = fb.tallies.get(n.id) ?? {};
            const comments = fb.owned.get(n.id) ?? [];
            return (
            <li key={n.id} className="card">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl">{n.title}</h2>{(n.meta as { version?: string } | null)?.version && <Badge tone="neutral">v{(n.meta as { version: string }).version}</Badge>}<AudienceChip kind="employees" /></div>
              <p className="mt-2 text-sm leading-relaxed">{n.body}</p>
              <p className="mt-2 text-xs text-muted">{n.ownerName} · {fmtDay(n.updatedAt)}{Object.keys(tally).length > 0 && ` · ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}`}</p>
              {n.ownerId === p.userId && comments.length > 0 && (
                <div className="mt-3 rounded-lg border border-line bg-paper p-3">
                  <h3 className="text-sm font-semibold text-brown-900">Feedback on your note</h3>
                  <ul className="mt-2 space-y-2 text-sm">{comments.map((c, k) => <li key={k}><Badge tone={c.rating === 'clear' ? 'sage' : 'amber'}>{c.rating}</Badge> <span className="text-xs text-muted">{c.name ?? 'Colleague'} · {fmtDay(c.at)}</span>{c.comment && <p className="mt-1 whitespace-pre-line">{c.comment}</p>}</li>)}</ul>
                </div>
              )}
              <ActionForm action={noteFeedbackAction} submit="Send" variant="secondary" inline className="mt-3">
                <input type="hidden" name="id" value={n.id} />
                <label className="sr-only" htmlFor={`r-${n.id}`}>Was this clear?</label>
                <select id={`r-${n.id}`} name="rating" className="select !w-auto" defaultValue="clear"><option value="clear">Clear</option><option value="confusing">Confusing</option></select>
                <label className="sr-only" htmlFor={`c-${n.id}`}>Comment</label>
                <input id={`c-${n.id}`} name="comment" className="input !w-56" placeholder="Optional comment" maxLength={1000} />
              </ActionForm>
            </li>
            );
          })}
        </ul>
      )}
      {canPost && (
        <section className="card mt-10 max-w-2xl" aria-labelledby="new"><h2 id="new" className="mb-4 text-lg">Post a release note</h2>
          <ActionForm action={createNoteAction} submit="Post note">
            <Field label="Title" htmlFor="title"><input id="title" name="title" className="input" required minLength={3} maxLength={120} /></Field>
            <Field label="Version (optional)" htmlFor="version"><input id="version" name="version" className="input" maxLength={30} /></Field>
            <Field label="Details" htmlFor="body"><textarea id="body" name="body" className="textarea" required minLength={10} maxLength={4000} /></Field>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
