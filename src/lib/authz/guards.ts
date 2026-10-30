import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { getPrincipal } from '../auth/session';
import type { Principal } from '../auth/principal';
import type { GrantName } from '@/db/schema/core';
import { audit } from '../audit';
import { authorize, type Action } from './policy';

/** Page/server-action guards. Unauthenticated -> /login; authenticated-but-not-permitted -> 403 page (and an audit 'deny'). */
export async function requireUser(next?: string): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  return p;
}

async function deny(p: Principal, what: string): Promise<never> {
  await audit({ actorId: p.userId, actorOrgId: p.activeOrgId, action: 'authz.deny', outcome: 'deny', meta: { what } });
  forbidden();
}

export async function requireEmployee(): Promise<Principal> {
  const p = await requireUser();
  if (!p.isEmployee) return deny(p, 'employee');
  return p;
}

export async function requireGrant(grant: GrantName): Promise<Principal> {
  const p = await requireUser();
  if (!p.isEmployee || !p.grants.has(grant)) return deny(p, `grant:${grant}`);
  return p;
}

/** Requires a client member with an explicit ACTIVE workspace; multi-membership users are sent to the picker. */
export async function requireClient(): Promise<Principal & { activeOrgId: string }> {
  const p = await requireUser();
  if (p.memberships.filter((m) => m.orgKind === 'client').length === 0) return deny(p, 'client');
  if (!p.activeOrgId) redirect('/workspace');
  return p as Principal & { activeOrgId: string };
}

export async function requireClientAdmin(): Promise<Principal & { activeOrgId: string }> {
  const p = await requireClient();
  if (p.activeOrgRole !== 'client_admin') return deny(p, 'client_admin');
  return p;
}

export async function requireAction(action: Action, ctx: Parameters<typeof authorize>[2] = {}): Promise<Principal> {
  const p = await requireUser();
  const d = authorize(p, action, ctx);
  if (!d.allow) return deny(p, `${action}: ${d.reason}`);
  return p;
}
