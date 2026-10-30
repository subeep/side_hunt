import type { Tone } from '@/components/ui';
import { inWindow } from './content';

/** datetime-local value (UTC, minute precision). */
export const localInput = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 16) : '');

export function bannerBadge(b: { status: string; startsAt: Date | null; endsAt: Date | null }, now: Date): { label: string; tone: Tone } {
  if (b.status === 'draft') return { label: 'Draft', tone: 'neutral' };
  if (b.status === 'archived') return { label: 'Archived', tone: 'neutral' };
  if (b.endsAt && b.endsAt <= now) return { label: 'Expired', tone: 'clay' };
  if (b.startsAt && b.startsAt > now) return { label: 'Scheduled', tone: 'amber' };
  return inWindow(b, now) ? { label: 'Live', tone: 'sage' } : { label: 'Published', tone: 'amber' };
}
