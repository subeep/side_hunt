import Link from 'next/link';
import { AudienceChip, Badge, Card, EmptyState, PageHeader, Stat, fmtDate } from '@/components/ui';
import { requireClientAccepted } from '@/lib/client/guard';
import { getDashboard, total } from '@/lib/client/dashboard';
import { listClientIdeas } from '@/lib/client/ideas';

export const metadata = { title: 'Client dashboard' };

const STATUS_LABEL: Record<string, string> = { draft: 'Drafts', submitted: 'Submitted', in_review: 'In review', clarification_requested: 'Needs your reply', published: 'Shared', rejected: 'Not shared', withdrawn: 'Withdrawn', unpublished: 'Paused' };
const ORDER = Object.keys(STATUS_LABEL);
const plain = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Counts({ counts, empty }: { counts: Record<string, number>; empty: string }) {
  const rows = ORDER.filter((k) => counts[k]);
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {rows.map((k) => (<li key={k}><Badge tone={k === 'clarification_requested' ? 'amber' : k === 'published' ? 'sage' : k === 'rejected' ? 'clay' : 'neutral'}>{STATUS_LABEL[k]}: {counts[k]}</Badge></li>))}
    </ul>
  );
}

export default async function ClientDashboard() {
  const p = await requireClientAccepted();
  const [d, ideas] = await Promise.all([getDashboard(p), listClientIdeas(p, 5)]);
  const mineTotal = total(d.contributions.mine);
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Dashboard" title={`Welcome, ${p.name.split(' ')[0]}`} description={`Everything here is scoped to ${p.activeOrgName}: its entitled offerings, its sessions and your own contributions. Nothing from other organisations appears in this workspace.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Entitled offerings" value={d.offerings.length} />
        <Stat label="Upcoming sessions" value={d.upcoming.length} />
        <Stat label="My observations" value={mineTotal} />
        <Stat label="Improvement ideas" value={ideas.unavailable ? '—' : ideas.ideas.length} hint={ideas.unavailable ? 'Temporarily unavailable' : undefined} />
      </div>

      <section aria-labelledby="off-h">
        <h2 id="off-h" className="mb-3 text-2xl">Your entitled offerings</h2>
        {d.offerings.length === 0 ? (
          <EmptyState title="No offerings are enabled for your organisation yet" action={<Link className="btn btn-secondary btn-sm" href="/client/support">Ask the Azentio team</Link>}>
            Entitlements are enabled by Azentio, not by workspace users. Once an offering is enabled, its sandbox appears here.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {d.offerings.map((o) => (
              <Card key={o.slug} href={`/client/sandbox/${o.slug}`}>
                <p className="eyebrow">{o.category}</p>
                <p className="mt-1 font-serif text-xl text-brown-900">{o.name}</p>
                <p className="mt-1 text-sm text-muted">{o.tagline}</p>
                <p className="mt-3 text-sm font-semibold text-brown-700">Open sandbox →</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="demo-h">
          <h2 id="demo-h" className="mb-3 text-2xl">Approved product demos</h2>
          {d.demos.length === 0 ? (
            <EmptyState title="No demos available yet">Approved demos for your entitled offerings and your organisation will appear here.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {d.demos.map((m) => (
                <li key={m.id}>
                  <Card>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/media/${m.id}?variant=poster`} alt={`Poster for ${m.title}`} loading="lazy" className="mb-3 aspect-video w-full rounded-lg border border-line object-cover" />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-brown-900">{m.title}</p>
                        {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
                      </div>
                      <AudienceChip kind={m.audienceKind} orgName={p.activeOrgName} />
                    </div>
                    <a className="mt-3 inline-block text-sm font-semibold" href={`/api/media/${m.id}`} target="_blank" rel="noopener">Open demo{m.durationSec ? ` (${Math.round(m.durationSec / 60)} min)` : ''} ↗</a>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ses-h">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="ses-h" className="text-2xl">Upcoming sessions</h2><Link href="/client/sessions" className="text-sm">All sessions</Link></div>
          {d.upcoming.length === 0 ? (
            <EmptyState title="No upcoming sessions">Briefings and webinars you are eligible for will be listed here.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {d.upcoming.map((s) => (
                <li key={s.id}>
                  <Card href={`/client/sessions/${s.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-brown-900">{s.title}</p>
                      <AudienceChip kind={s.audienceKind} orgName={p.activeOrgName} />
                    </div>
                    <p className="mt-1 text-sm text-muted">{plain(s.kind)} · {fmtDate(s.startsAt)}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="con-h">
        <h2 id="con-h" className="mb-3 text-2xl">Contribution status</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <p className="eyebrow">My observations</p>
            <div className="mt-3"><Counts counts={d.contributions.mine} empty="You have not started an observation yet. Drafts stay private until you choose to submit." /></div>
            <div className="mt-4 flex flex-wrap gap-2"><Link className="btn btn-secondary btn-sm" href="/learn/mine">My observations</Link><Link className="btn btn-primary btn-sm" href="/learn/new">New observation</Link></div>
          </Card>
          <Card>
            <p className="eyebrow">{p.activeOrgName}: our observations</p>
            <div className="mt-3"><Counts counts={d.contributions.org} empty="No organisation-visible observations yet." /></div>
            <p className="hint mt-3">Counts include your own items and colleagues&apos; items that are past draft and not private to their author.</p>
            <div className="mt-3"><Link className="btn btn-secondary btn-sm" href="/learn/org">Our organisation&apos;s observations</Link></div>
          </Card>
        </div>
      </section>

      <section aria-labelledby="idea-h">
        <h2 id="idea-h" className="mb-1 text-2xl">Improvement ideas visible to you</h2>
        <p className="mb-3 text-sm text-muted">Plain-language status only. A status is not a delivery commitment.</p>
        {ideas.unavailable ? (
          <EmptyState title="Ideas are temporarily unavailable">Try again shortly. The rest of your workspace is unaffected.</EmptyState>
        ) : ideas.ideas.length === 0 ? (
          <EmptyState title="No improvement ideas to show yet">When Azentio links an improvement idea to a theme relevant to you, its status will appear here.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {ideas.ideas.map((i) => (
              <Card key={i.id} href={`/learn/ideas/${i.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium text-brown-900">{i.title}</p><Badge tone="amber">{plain(i.status)}</Badge></div>
                <p className="mt-1 text-sm text-muted">{[i.team, `Updated ${fmtDate(i.updatedAt)}`].filter(Boolean).join(' · ')}</p>
                {i.latestUpdate && <p className="mt-2 text-sm">{i.latestUpdate}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
