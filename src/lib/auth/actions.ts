'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { clientIp } from '../http';
import { isDemoMode } from '../env';
import { audit } from '../audit';
import { requestLoginCode, safeNext, verifyLoginCode } from './login';
import { createSession, destroySession, getPrincipal, setSessionActiveOrg } from './session';
import { buildPrincipal } from './principal';
import { verifyTestPassword } from './testlogin';

export interface LoginState {
  step: 'email' | 'code';
  email?: string;
  message?: string;
  error?: string;
  demoCode?: string;
}

export async function landingPath(userId: string): Promise<string> {
  const p = await buildPrincipal(userId);
  if (!p) return '/';
  if (p.isEmployee) return '/employee';
  const clients = p.memberships.filter((m) => m.orgKind === 'client');
  if (clients.length > 1 && !p.activeOrgId) return '/workspace';
  if (clients.length) return '/client';
  return '/';
}

export async function requestCodeAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = z.string().email().max(200).safeParse(form.get('email'));
  if (!parsed.success) return { step: 'email', error: 'Enter a valid email address.' };
  const ip = clientIp(await headers());
  const { demoCode } = await requestLoginCode(parsed.data, ip);
  return { step: 'code', email: parsed.data.toLowerCase(), message: 'If that address is eligible for access, a one-time code has been sent. It expires in 10 minutes.', demoCode };
}

export async function passwordLoginAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const parsed = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: 'Enter your email and password.' };
  const userId = await verifyTestPassword(parsed.data.email, parsed.data.password, clientIp(await headers()));
  if (!userId) return { error: 'Email or password is incorrect.' };
  await createSession(userId);
  redirect(safeNext(form.get('next')) ?? (await landingPath(userId)));
}

export async function verifyCodeAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '');
  const code = String(form.get('code') ?? '');
  const next = safeNext(form.get('next'));
  if (!/^\d{6}$/.test(code)) return { ...prev, step: 'code', email, error: 'Enter the 6-digit code.' };
  const userId = await verifyLoginCode(email, code);
  if (!userId) return { ...prev, step: 'code', email, error: 'That code is invalid or expired.' };
  await createSession(userId);
  redirect(next ?? (await landingPath(userId)));
}

export async function logoutAction() {
  const p = await getPrincipal();
  await destroySession();
  if (p) await audit({ actorId: p.userId, action: 'auth.logout' });
  redirect('/');
}

export async function selectWorkspaceAction(form: FormData) {
  const p = await getPrincipal();
  if (!p?.sessionId) redirect('/login');
  const orgId = String(form.get('orgId') ?? '');
  const m = p.memberships.find((x) => x.orgId === orgId && x.orgKind === 'client');
  if (!m) {
    await audit({ actorId: p.userId, action: 'workspace.switch', outcome: 'deny', meta: { orgId } });
    redirect('/workspace');
  }
  await setSessionActiveOrg(p.sessionId, orgId);
  await audit({ actorId: p.userId, actorOrgId: orgId, action: 'workspace.switch', orgId });
  revalidatePath('/', 'layout');
  redirect('/client');
}

/** Judging-environment persona sign-in. Disabled unless DEMO_MODE=1 and the account is a seeded demo persona. */
export async function demoSignInAction(form: FormData) {
  if (!isDemoMode()) redirect('/login');
  const userId = String(form.get('userId') ?? '');
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.isDemoPersona, true)));
  if (!u) redirect('/demo');
  await createSession(u.id);
  await audit({ actorId: u.id, action: 'auth.demo_signin' });
  redirect(await landingPath(u.id));
}
