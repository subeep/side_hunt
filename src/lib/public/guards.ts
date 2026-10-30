import 'server-only';
import { forbidden } from 'next/navigation';
import type { Principal } from '../auth/principal';
import { requireUser } from '../authz/guards';
import { authorize } from '../authz';
import { audit } from '../audit';

/** /publisher landing: either grant gets in, but each tab and each action still demands its own grant. */
export async function requireAnyPublisher(): Promise<Principal> {
  const p = await requireUser('/publisher');
  if (!authorize(p, 'content.publish').allow && !authorize(p, 'video.publish').allow) {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'authz.deny', outcome: 'deny', meta: { what: 'publisher' } });
    forbidden();
  }
  return p;
}
