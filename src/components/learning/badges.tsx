import type { ContributionStatus } from '@/db/schema/learning';
import { AudienceChip, Badge } from '@/components/ui';
import { KIND_LABELS, STATUS_META } from '@/lib/learning/constants';

export function StatusBadge({ status }: { status: ContributionStatus }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** Audience lens for PRIVATE/ORG material. Deliberately different wording from the cross-client "Shared community" chip. */
export function SharingChip({ choice, status }: { choice: 'private' | 'organisation' | 'community'; status?: ContributionStatus }) {
  if (choice === 'private') return <AudienceChip kind="private" />;
  if (choice === 'organisation') return <Badge tone="amber">Org: our organisation only</Badge>;
  return <Badge tone={status === 'published' ? 'sage' : 'amber'}>{status === 'published' ? 'Org + shared community (reviewed copy)' : 'Org + proposed for community'}</Badge>;
}

export const kindLabel = (k: string) => KIND_LABELS[k as keyof typeof KIND_LABELS] ?? k;
