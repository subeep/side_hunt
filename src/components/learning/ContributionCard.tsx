import Link from 'next/link';
import { Card, fmtDay } from '@/components/ui';
import type { ContributionStatus } from '@/db/schema/learning';
import { offeringName } from '@/lib/learning/constants';
import { SharingChip, StatusBadge, kindLabel } from './badges';

export function ContributionCard({ c, by }: { c: { id: string; title: string; kind: string; status: ContributionStatus; sharingChoice: 'private' | 'organisation' | 'community'; version: number; offeringSlug: string | null; updatedAt: Date | null; lastModeratorMessage?: string | null }; by?: string }) {
  return (
    <Card href={`/learn/c/${c.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status} />
        <SharingChip choice={c.sharingChoice} status={c.status} />
        {c.version > 1 && <span className="badge badge-neutral">Version {c.version}</span>}
      </div>
      <h3 className="mt-2 text-lg">{c.title}</h3>
      <p className="mt-1 text-sm text-muted">
        {kindLabel(c.kind)}{offeringName(c.offeringSlug) ? ` · ${offeringName(c.offeringSlug)}` : ''}{by ? ` · by ${by}` : ''} · updated {fmtDay(c.updatedAt)}
      </p>
      {c.status === 'clarification_requested' && <p className="mt-2 text-sm font-medium text-brown-700">A moderator asked you a question: open to answer.</p>}
    </Card>
  );
}
