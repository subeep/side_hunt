import { db, schema } from '@/db';
import { seedPublic, MEDIA } from '@/db/seed/public';
import { ORG, USER } from '@/db/seed/core';
import type { GrantName } from '@/db/schema/core';
import { as } from './principals';

export { MEDIA, ORG, USER, as };

/** Re-run the (idempotent) public seed strictly: any failure in it fails the test run, unlike seedAll which logs and continues. */
export async function ensurePublicSeed() {
  await seedPublic(db);
}

/** A real employee identity (allowlisted @azentio.com + employee membership) holding exactly the given grants. */
export async function employeeWith(id: string, grants: GrantName[]) {
  const email = `${id}@azentio.com`;
  await db.insert(schema.users).values({ id, email, name: id }).onConflictDoNothing();
  await db.insert(schema.employeeAllowlist).values({ email, name: id, addedBy: 'test' }).onConflictDoNothing();
  await db.insert(schema.memberships).values({ userId: id, orgId: ORG.azentio, role: 'employee' }).onConflictDoNothing();
  for (const g of grants) await db.insert(schema.grants).values({ id: `grt_${id}_${g}`, userId: id, permission: g, grantedBy: 'test' }).onConflictDoNothing();
  return as(id);
}

export const ALL_MEDIA = Object.values(MEDIA);
