import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { requireUser } from '../authz/guards';
import type { Principal } from '../auth/principal';
import { audit } from '../audit';
import { canSeeFeed } from './visibility';
import { enforceClientTerms } from '../client/guard';

/** Page/server-action guard for the shared feed and everything derived from it. Default deny + audit. */
export async function requireFeed(next?: string): Promise<Principal> {
  const p = await requireUser(next);
  if (canSeeFeed(p)) {
    await enforceClientTerms(p); // clients must acknowledge the workspace terms before browsing shared learning
    return p;
  }
  if (!p.activeOrgId && p.memberships.some((m) => m.orgKind === 'client')) redirect('/workspace'); // multi-membership: pick a workspace first
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'authz.deny', outcome: 'deny', meta: { what: 'community_feed', next } });
  forbidden();
}
