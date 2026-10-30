import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hashToken, normaliseEmail, randomCode, randomToken, safeEqual } from '../crypto';
import { EMPLOYEE_DOMAIN, INTERNAL_ORG_ID, isDemoMode } from '../env';
import { rateLimit } from '../ratelimit';
import { sendEmail } from '../email';
import { audit } from '../audit';

/** Who may even receive a code? (Responses never reveal this: no account enumeration.) */
export async function isEligibleEmail(email: string): Promise<boolean> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (u?.status === 'disabled') return false;
  if (email.endsWith(EMPLOYEE_DOMAIN)) {
    const [a] = await db.select().from(schema.employeeAllowlist).where(eq(schema.employeeAllowlist.email, email));
    if (a?.status === 'active') return true;
  }
  if (u) {
    const m = await db.select({ id: schema.memberships.id }).from(schema.memberships).where(and(eq(schema.memberships.userId, u.id), eq(schema.memberships.status, 'active')));
    if (m.length) return true;
  }
  const inv = await db
    .select({ id: schema.invitations.id })
    .from(schema.invitations)
    .where(and(eq(schema.invitations.email, email), isNull(schema.invitations.usedAt), isNull(schema.invitations.revokedAt), gt(schema.invitations.expiresAt, new Date())));
  return inv.length > 0;
}

export async function requestLoginCode(emailRaw: string, ip: string): Promise<{ demoCode?: string }> {
  const email = normaliseEmail(emailRaw);
  const allowed = (await rateLimit(`login:email:${email}`, 5, 900)) && (await rateLimit(`login:ip:${ip}`, 30, 900));
  if (!allowed) return {};
  if (!(await isEligibleEmail(email))) {
    await audit({ action: 'auth.code_request', outcome: 'deny', meta: { reason: 'ineligible' } });
    return {};
  }
  const code = randomCode();
  const [row] = await db
    .insert(schema.loginCodes)
    .values({ email, codeHash: hashToken(`${email}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) })
    .returning();
  await sendEmail({ to: email, subject: 'Your azentio.ai sign-in code', body: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`, purpose: 'login_code', dedupeKey: `login:${row.id}` });
  await audit({ action: 'auth.code_request', meta: { emailDomain: email.split('@')[1] } });
  // Judging convenience: ONLY seeded demo personas, ONLY when DEMO_MODE=1, surface their code on screen.
  if (isDemoMode()) {
    const [u] = await db.select({ d: schema.users.isDemoPersona }).from(schema.users).where(eq(schema.users.email, email));
    if (u?.d) return { demoCode: code };
  }
  return {};
}

/** Verify a code and return the user id (provisioning employee membership / user row where policy permits). */
export async function verifyLoginCode(emailRaw: string, code: string): Promise<string | null> {
  const email = normaliseEmail(emailRaw);
  if (!(await rateLimit(`verify:email:${email}`, 10, 900))) return null;
  const [row] = await db
    .select()
    .from(schema.loginCodes)
    .where(and(eq(schema.loginCodes.email, email), isNull(schema.loginCodes.consumedAt), gt(schema.loginCodes.expiresAt, new Date())))
    .orderBy(desc(schema.loginCodes.createdAt))
    .limit(1);
  if (!row || row.attempts >= 5) return null;
  await db.update(schema.loginCodes).set({ attempts: row.attempts + 1 }).where(eq(schema.loginCodes.id, row.id));
  if (!safeEqual(row.codeHash, hashToken(`${email}:${code.trim()}`))) {
    await audit({ action: 'auth.code_verify', outcome: 'deny' });
    return null;
  }
  await db.update(schema.loginCodes).set({ consumedAt: new Date() }).where(eq(schema.loginCodes.id, row.id));

  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) {
    [user] = await db.insert(schema.users).values({ email, name: email.split('@')[0] }).returning();
  }
  if (user.status !== 'active') return null;

  // Organiser-approved employee provisioning: allowlisted @azentio.com identity => employee membership (no grants).
  if (email.endsWith(EMPLOYEE_DOMAIN)) {
    const [a] = await db.select().from(schema.employeeAllowlist).where(eq(schema.employeeAllowlist.email, email));
    if (a?.status === 'active') {
      await db.insert(schema.memberships).values({ userId: user.id, orgId: INTERNAL_ORG_ID, role: 'employee' }).onConflictDoNothing();
    }
  }
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await audit({ actorId: user.id, action: 'auth.login' });
  return user.id;
}

export const safeNext = (n: unknown): string | null => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : null);
export const newInviteToken = () => randomToken(24);
