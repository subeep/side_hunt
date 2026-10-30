import { AudienceChip, Badge, Card, EmptyState, PageHeader, fmtDay } from '@/components/ui';
import { requireClientAccepted } from '@/lib/client/guard';
import { KIND_LABEL, listResources, type ResourceKind } from '@/lib/client/resources';

export const metadata = { title: 'Resources' };
const GROUPS: { kind: ResourceKind; title: string }[] = [{ kind: 'briefing', title: 'Briefings' }, { kind: 'release_note', title: 'Release notes' }, { kind: 'resource', title: 'Resources' }];

export default async function ResourcesPage() {
  const p = await requireClientAccepted();
  const items = await listResources(p);
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Resources" title="Resources, briefings and release notes" description="Prepared for your organisation or for the offerings it is entitled to. Release notes describe what has been released, not future plans." />
      {items.length === 0 ? (
        <EmptyState title="No resources yet">Briefings, guides and release notes for your workspace will appear here once published.</EmptyState>
      ) : (
        GROUPS.map((g) => {
          const rows = items.filter((i) => i.kind === g.kind);
          if (!rows.length) return null;
          return (
            <section key={g.kind} aria-label={g.title}>
              <h2 className="mb-3 text-2xl">{g.title}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {rows.map((i) => (
                  <Card key={i.id} href={`/client/resources/${i.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium text-brown-900">{i.title}</p><AudienceChip kind={i.audienceKind} orgName={p.activeOrgName} /></div>
                    {i.summary && <p className="mt-1 text-sm text-muted">{i.summary}</p>}
                    <p className="mt-2 text-xs text-muted">{KIND_LABEL[i.kind as ResourceKind]} · {fmtDay(i.publishedAt)}</p>
                  </Card>
                ))}
              </div>
            </section>
          );
        })
      )}
      {items.length > 0 && <p className="text-xs text-muted"><Badge tone="neutral">Note</Badge> Items not meant for your organisation are not listed, and cannot be opened by guessing their address.</p>}
    </div>
  );
}
