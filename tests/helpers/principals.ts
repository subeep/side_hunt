import { buildPrincipal, type Principal } from '@/lib/auth/principal';
import { USER, ORG } from '@/db/seed/core';

export { USER, ORG };
/** Build a principal exactly as the server would for a session of this user, optionally with a chosen active workspace. */
export async function as(userId: string, activeOrgId?: string | null): Promise<Principal> {
  const p = await buildPrincipal(userId, { requestedActiveOrgId: activeOrgId ?? null });
  if (!p) throw new Error(`no principal for ${userId}`);
  return p;
}
