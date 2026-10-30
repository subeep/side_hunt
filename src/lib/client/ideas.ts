import type { Principal } from '@/lib/auth/principal';
// Isolated import: the insights area owns this module (already visibility-filtered for the principal).
import { listIdeasForPrincipal } from '@/lib/insights/ideas';

export type ClientIdea = Awaited<ReturnType<typeof listIdeasForPrincipal>>[number];

/** Improvement ideas visible to this client. A failure in the insights module degrades to an explicit unavailable state. */
export async function listClientIdeas(p: Principal, limit = 5): Promise<{ ideas: ClientIdea[]; unavailable: boolean }> {
  try {
    return { ideas: await listIdeasForPrincipal(p, { limit }), unavailable: false };
  } catch (err) {
    console.error('client ideas unavailable', err);
    return { ideas: [], unavailable: true };
  }
}
