import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, EmptyState, Field, fmtDate, PageHeader } from '@/components/ui';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireEmployee } from '@/lib/authz/guards';
import { getTeam } from '@/lib/employee/teams';
import { joinAction, leaveAction, noteAction } from '../actions';

export const metadata = { title: 'Team space' };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireEmployee();
  const t = await getTeam(p, (await params).id);
  if (!t) notFound();
  return (
    <div>
      <PageHeader eyebrow="Team space" title={t.title} description={t.body ?? undefined} actions={<Link href="/employee/teams" className="btn btn-secondary btn-sm">All teams</Link>} />
      <EmployeeNav current="/employee/teams" />
      <p className="mb-6 flex flex-wrap gap-2 text-sm"><Badge tone="neutral">{t.memberCount} member{t.memberCount === 1 ? '' : 's'}</Badge>{t.focus && <Badge tone="neutral">{t.focus}</Badge>}<Badge tone={t.status === 'open' ? 'sage' : 'neutral'}>{t.status}</Badge></p>
      {!t.isMember ? (
        <Alert tone="info">
          <p className="mb-3">Team notes and the member list are visible to members only. Join to read and add notes.</p>
          <ActionForm action={joinAction} submit="Join this team"><input type="hidden" name="id" value={t.id} /></ActionForm>
        </Alert>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <section aria-labelledby="notes"><h2 id="notes" className="mb-3 text-xl">Notes</h2>
            {t.notes.length === 0 ? <EmptyState title="No notes yet">Write the first note for your team.</EmptyState> : (
              <ul className="space-y-3">{t.notes.map((n) => <li key={n.id} className="card"><p className="whitespace-pre-line text-sm leading-relaxed">{n.body}</p><p className="mt-2 text-xs text-muted">{n.author ?? 'Colleague'} · {fmtDate(n.at)}</p></li>)}</ul>
            )}
            <div className="card mt-6"><h3 className="mb-3 text-lg">Add a note</h3>
              <ActionForm action={noteAction} submit="Add note"><input type="hidden" name="id" value={t.id} /><Field label="Note" htmlFor="body"><textarea id="body" name="body" className="textarea" required minLength={2} maxLength={2000} /></Field></ActionForm>
            </div>
          </section>
          <aside className="space-y-4">
            <div className="card"><h3 className="mb-2 text-lg">Members</h3><ul className="text-sm">{t.members.map((m) => <li key={m}>{m}</li>)}</ul></div>
            {!t.isOwner && <ActionForm action={leaveAction} submit="Leave team" variant="secondary" confirmText="Leave this team?"><input type="hidden" name="id" value={t.id} /></ActionForm>}
          </aside>
        </div>
      )}
    </div>
  );
}
