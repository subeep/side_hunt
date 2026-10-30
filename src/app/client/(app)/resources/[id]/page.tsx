import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AudienceChip, Card, PageHeader, fmtDay } from '@/components/ui';
import { requireClientAccepted } from '@/lib/client/guard';
import { getResource, KIND_LABEL, type ResourceKind } from '@/lib/client/resources';

export const metadata = { title: 'Resource' };

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireClientAccepted();
  const { id } = await params;
  const r = await getResource(p, id); // audience re-checked for this object id; otherwise 404 + audit
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={KIND_LABEL[r.kind as ResourceKind] ?? 'Resource'} title={r.title} description={r.summary ?? undefined} actions={<Link href="/client/resources" className="btn btn-secondary btn-sm">All resources</Link>} />
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2"><AudienceChip kind={r.audienceKind} orgName={p.activeOrgName} /><span className="text-xs text-muted">Published {fmtDay(r.publishedAt)}</span></div>
        <div className="whitespace-pre-line leading-relaxed">{r.body ?? 'This item has no body text.'}</div>
      </Card>
    </div>
  );
}
