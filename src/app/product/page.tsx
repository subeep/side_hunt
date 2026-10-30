import Link from 'next/link';
import { requireGrant } from '@/lib/authz/guards';
import { listIdeasAdmin, STATUS_DISCLAIMER } from '@/lib/insights/ideas';
import { prioritiseIdeas } from '@/lib/insights/priority';
import { Alert, Card, EmptyState, fmtDay, PageHeader, Stat } from '@/components/ui';
import { ConsoleNav } from '@/components/insights/ConsoleNav';
import { StatusBadge } from '@/components/insights/parts';

export const metadata = { title: 'Product console' };

export default async function ProductConsole() {
  const p = await requireGrant('product_owner');
  const [ideas, ranked] = await Promise.all([listIdeasAdmin(p), prioritiseIdeas(p)]);
  const open = ideas.filter((i) => !['released', 'not_proceeding'].includes(i.status)).length;
  return (
    <div>
      <ConsoleNav current="/product" />
      <PageHeader eyebrow="Product owner console" title="Improvement ideas" description="Connect recurring community themes to improvement ideas, link permitted evidence and tell contributors where things stand, in language that is safe for every client to read." actions={<Link className="btn btn-primary" href="/product/ideas/new">New idea</Link>} />
      <Alert tone="info" className="mb-6">{STATUS_DISCLAIMER} Every status change is audited and contributors of linked evidence are notified in-app with an audience-appropriate message.</Alert>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Ideas" value={ideas.length} />
        <Stat label="Open" value={open} hint="Not released or closed" />
        <Stat label="Under review" value={ideas.filter((i) => i.status === 'under_review').length} />
      </div>

      <section className="mb-10" aria-labelledby="ideas-h">
        <h2 id="ideas-h" className="mb-3 text-xl">All ideas</h2>
        {ideas.length === 0 ? <EmptyState title="No ideas yet" action={<Link className="btn btn-primary" href="/product/ideas/new">Create the first idea</Link>}>Start from a theme and link the approved observations that support it.</EmptyState> : (
          <div className="card overflow-x-auto !p-0">
            <table className="table-basic min-w-[40rem]">
              <thead><tr><th>Idea</th><th>Status</th><th>Priority</th><th>Team</th><th>Last update</th></tr></thead>
              <tbody>{ideas.map((i) => <tr key={i.id}><td><Link href={`/product/ideas/${i.id}`} className="font-medium">{i.title}</Link></td><td><StatusBadge status={i.status} /></td><td className="capitalize">{i.priority}</td><td>{i.team ?? '—'}</td><td>{fmtDay(i.updatedAt)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="prio-h">
        <h2 id="prio-h" className="mb-1 text-xl">Prioritisation assist</h2>
        <p className="mb-3 text-sm text-muted">Open ideas ranked by distinct contributing organisations and evidence quality. This is advice with its working shown, not a decision. Popularity, comment counts and votes are deliberately not used.</p>
        {ranked.length === 0 ? <p className="text-sm text-muted">No open ideas to rank.</p> : (
          <div className="space-y-3">
            {ranked.map((r, n) => (
              <Card key={r.ideaId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl"><p className="text-xs text-muted">#{n + 1}</p><Link href={`/product/ideas/${r.ideaId}`} className="font-serif text-lg">{r.title}</Link><p className="mt-1 text-sm text-muted">{r.explanation}</p><p className="mt-2 text-xs text-muted">Linked published observations: {r.linked} · distinct organisations: {r.orgsLabel} · evidence: {r.quality}</p></div>
                  <div className="text-right"><p className="font-serif text-3xl text-brown-900">{r.score}</p><p className="text-xs text-muted">/ 100</p></div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
