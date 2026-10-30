import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import type { Principal } from '@/lib/auth/principal';
import { requireClient } from '@/lib/authz/guards';
import { audit } from '@/lib/audit';
import { hasAcceptedTerms } from './terms';

export type ClientPrincipal = Principal & { activeOrgId: string };

/** Active client workspace (explicit) + current workspace terms acknowledged. Every client page and server action calls this. */
export async function requireClientAccepted(): Promise<ClientPrincipal> {
  const p = await requireClient();
  if (!(await hasAcceptedTerms(p.userId, p.activeOrgId))) redirect('/client/terms');
  return p;
}

/**
 * Terms gate for routes OUTSIDE /client that clients use (learning capture, the shared feed, ideas, AIRA). Anyone working in a
 * client workspace must have acknowledged the current terms + learning-sharing explanation first; staff workspaces are unaffected.
 */
export async function clientTermsPending(p: Principal): Promise<boolean> {
  const inClientWorkspace = !!p.activeOrgId && p.memberships.some((m) => m.orgId === p.activeOrgId && m.orgKind === 'client');
  return inClientWorkspace && !(await hasAcceptedTerms(p.userId, p.activeOrgId!));
}

export async function enforceClientTerms(p: Principal): Promise<void> {
  if (await clientTermsPending(p)) redirect('/client/terms');
}

export async function requireClientAdminAccepted(): Promise<ClientPrincipal> {
  const p = await requireClientAccepted();
  if (p.activeOrgRole !== 'client_admin') {
    await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'authz.deny', outcome: 'deny', meta: { what: 'client_admin' } });
    forbidden();
  }
  return p;
}
