import { db, schema } from '@/db';
import { newId } from '@/db/ids';
import { as } from './helpers/principals';

/** Create an isolated client organisation (never touches the seeded orgs): admins, members, entitlements, accepted terms. */
export async function makeOrg(opts: { name?: string; admins?: number; members?: number; entitlements?: string[] } = {}) {
  const orgId = newId('org');
  const tag = orgId.slice(-6);
  await db.insert(schema.organisations).values({ id: orgId, name: opts.name ?? `Test Org ${tag}`, slug: `t-${tag}`, kind: 'client' });
  await db.insert(schema.orgSettings).values({ orgId, communityStatus: 'approved', termsVersion: '2026-10' });
  if (opts.entitlements?.length) await db.insert(schema.entitlements).values(opts.entitlements.map((productSlug) => ({ orgId, productSlug })));
  const mk = async (role: 'client_admin' | 'client_member', i: number) => {
    const userId = newId('usr');
    await db.insert(schema.users).values({ id: userId, email: `${role}-${i}-${tag}@t.example`, name: `${role} ${i} ${tag}` });
    const [m] = await db.insert(schema.memberships).values({ userId, orgId, role }).returning({ id: schema.memberships.id });
    await db.insert(schema.termsAcceptances).values({ userId, orgId, termsVersion: '2026-10', learningExplained: true });
    return { userId, membershipId: m.id };
  };
  const admins = [];
  for (let i = 0; i < (opts.admins ?? 1); i++) admins.push(await mk('client_admin', i));
  const members = [];
  for (let i = 0; i < (opts.members ?? 1); i++) members.push(await mk('client_member', i));
  return { orgId, admins, members, as: (userId: string) => as(userId, orgId) };
}

export const denies = (action: string, actorId: string) =>
  db.select().from(schema.auditEvents).then((rows) => rows.filter((r) => r.action === action && r.actorId === actorId && r.outcome === 'deny'));
