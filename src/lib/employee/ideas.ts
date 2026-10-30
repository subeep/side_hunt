import { listOwnedIdeas } from '@/lib/insights/ideas';

/** The ONE place the employee area touches the insights area. Ideas this user owns (already authorised by the insights lib). */
export interface AssignedIdea {
  id: string;
  title: string;
  status: string;
  team?: string | null;
  updatedAt?: Date | string | null;
  offeringSlug?: string | null;
  latestUpdate?: string | null;
}
export async function myAssignedIdeas(userId: string): Promise<AssignedIdea[]> {
  try {
    return ((await listOwnedIdeas(userId)) as unknown as AssignedIdea[]) ?? [];
  } catch (err) {
    console.error('[employee] listOwnedIdeas failed', err);
    return [];
  }
}
