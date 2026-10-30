import { Badge, Card, EmptyState, Field, PageHeader } from '@/components/ui';
import Link from 'next/link';
import { EmployeeNav } from '@/components/employee/Nav';
import { ActionForm } from '@/components/employee/ActionForm';
import { requireEmployee } from '@/lib/authz/guards';
import { listTeams } from '@/lib/employee/teams';
import { createTeamAction, joinAction } from './actions';

export const metadata = { title: 'Hackathon teams' };

export default async function TeamsPage() {
  const p = await requireEmployee();
  const teams = await listTeams(p);
  return (
    <div>
      <PageHeader eyebrow="Employee portal" title="Hackathon team spaces" description="Create a team space or join one. Team notes are visible to team members only." />
      <EmployeeNav current="/employee/teams" />
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <section aria-labelledby="list">
          <h2 id="list" className="mb-3 text-xl">Teams</h2>
          {teams.length === 0 ? <EmptyState title="No teams yet">Start the first team space.</EmptyState> : (
            <ul className="space-y-3">
              {teams.map((t) => (
                <li key={t.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/employee/teams/${t.id}`} className="font-serif text-lg text-brown-900">{t.title}</Link>
                      <p className="mt-1 text-sm text-muted">{t.body}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">Owner {t.ownerName} · {t.memberCount} member{t.memberCount === 1 ? '' : 's'}{t.focus && <Badge tone="neutral">{t.focus}</Badge>}{t.isMember && <Badge tone="sage">You are a member</Badge>}</p>
                    </div>
                    {!t.isMember && <ActionForm action={joinAction} submit="Join" variant="secondary" inline><input type="hidden" name="id" value={t.id} /></ActionForm>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="new" className="card h-fit"><h2 id="new" className="mb-4 text-lg">Create a team space</h2>
          <ActionForm action={createTeamAction} submit="Create team">
            <Field label="Team name" htmlFor="title"><input id="title" name="title" className="input" required minLength={3} maxLength={80} /></Field>
            <Field label="What are you building?" htmlFor="body"><textarea id="body" name="body" className="textarea !min-h-24" required minLength={10} maxLength={1000} /></Field>
            <Field label="Focus offering (optional)" htmlFor="focus"><input id="focus" name="focus" className="input" maxLength={80} /></Field>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
