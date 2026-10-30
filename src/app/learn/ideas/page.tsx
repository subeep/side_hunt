import Link from 'next/link';
import { requireUser } from '@/lib/authz/guards';
import { enforceClientTerms } from '@/lib/client/guard';
import { listIdeasForPrincipal, listOwnedIdeas, STATUS_DISCLAIMER, STATUS_LABEL, IDEA_STATUSES } from '@/lib/insights/ideas';
import { Alert, Card, EmptyState, fmtDay, PageHeader } from '@/components/ui';
import { InsightsNav, StatusBadge } from '@/components/insights/parts';

export const metadata = { title: 'Improvement ideas' };

export default async function IdeasPage() {
  const p = await requireUser('/learn/ideas');
  await enforceClientTerms(p);
  const [ideas, owned] = await Promise.all([listIdeasForPrincipal(p, { limit: 100 }), p.isEmployee ? listOwnedIdeas(p.userId) : Promise.resolve([])]);
  const all = [...ideas, ...owned.filter((o) => !ideas.some((i) => i.id === o.id))];
  const groups = IDEA_STATUSES.map((s) => ({ s, rows: all.filter((i) => i.status === s) })).filter((g) => g.rows.length);
  return (
    <div>
      <InsightsNav current="/learn/ideas" owner={p.grants.has('product_owner')} />
      <PageHeader eyebrow="Closing the loop" title="Improvement ideas" description="Ideas our product owners have linked to approved community observations or to offerings you use, with their status in plain language." />
      <Alert tone="info" className="mb-6">{STATUS_DISCLAIMER} Nothing here exposes a client’s private material, a support case or internal planning.</Alert>
      {all.length === 0 ? (
        <EmptyState title="No improvement ideas are relevant to you yet">Ideas appear here when they are linked to approved shared observations, or relate to an offering your organisation uses.</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.s} className="mb-8" aria-labelledby={`g-${g.s}`}>
            <h2 id={`g-${g.s}`} className="mb-3 text-xl">{STATUS_LABEL[g.s]}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {g.rows.map((i) => (
                <Card key={i.id} href={`/learn/ideas/${i.id}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5"><StatusBadge status={i.status} />{i.offeringSlug && <span className="badge badge-neutral">{i.offeringSlug}</span>}</div>
                  <h3 className="text-lg font-semibold leading-snug">{i.title}</h3>
                  {i.latestUpdate && <p className="mt-2 line-clamp-2 text-sm text-muted">{i.latestUpdate}</p>}
                  <p className="mt-3 text-xs text-muted">{i.team ? `Team: ${i.team} · ` : ''}Last update {fmtDay(i.updatedAt)}</p>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
      <p className="text-sm"><Link href="/learn">Browse the approved observations behind these ideas</Link></p>
    </div>
  );
}
