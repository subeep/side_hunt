import 'server-only';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hashToken, randomToken } from '../crypto';
import { principalFromSessionToken, type Principal } from './principal';
import * as react from 'react';

export const SESSION_COOKIE = 'az_session';
const SESSION_DAYS = 7;

export async function createSession(userId: string, activeOrgId?: string | null) {
  const token = randomToken();
  const h = await headers();
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: hashToken(token),
    activeOrgId: activeOrgId ?? null,
    userAgent: h.get('user-agent')?.slice(0, 200),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
  });
  const secure = h.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production' && !!process.env.VERCEL;
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_DAYS * 86400 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.tokenHash, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

const memo = ((react as unknown as { cache?: <T extends (...a: never[]) => unknown>(f: T) => T }).cache ?? ((f: unknown) => f)) as <T extends (...a: never[]) => unknown>(f: T) => T;

/** The authenticated principal for this request, or null. Cached per request. */
export const getPrincipal = memo(async (): Promise<Principal | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return principalFromSessionToken(hashToken(token));
});

/** Switch the active workspace. Only honoured for an ACTIVE membership; validated again on every request. */
export async function setSessionActiveOrg(sessionId: string, orgId: string | null) {
  await db.update(schema.sessions).set({ activeOrgId: orgId }).where(eq(schema.sessions.id, sessionId));
}
