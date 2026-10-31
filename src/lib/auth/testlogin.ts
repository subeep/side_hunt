import { timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { audit } from '../audit';
import { rateLimit } from '../ratelimit';

/** Hardcoded test credentials (temporary). Only seeded demo personas can sign in this way; set TEST_LOGIN=0 to switch it off. */
export const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Azentio@2026';
export const TEST_ACCOUNTS = [
  { email: 'admin@azentio.com', label: 'Employee · portal admin' },
  { email: 'member@northwind.example', label: 'Client · Northwind member' },
] as const;
export const isTestLogin = () => process.env.TEST_LOGIN !== '0';

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Returns the user id when the email is a seeded persona and the password matches, else null. Rate limited per IP and email. */
export async function verifyTestPassword(email: string, password: string, ip: string): Promise<string | null> {
  if (!isTestLogin()) return null;
  const e = email.trim().toLowerCase();
  if (!(await rateLimit(`pw:${ip}`, 20, 600)) || !(await rateLimit(`pw:${e}`, 10, 600))) return null;
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.email, e), eq(schema.users.isDemoPersona, true)));
  const ok = same(password, TEST_PASSWORD) && !!u;
  await audit({ actorId: u?.id ?? null, action: 'auth.password_signin', outcome: ok ? 'ok' : 'deny' });
  return ok ? u!.id : null;
}
