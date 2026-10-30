import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { db, schema } from '@/db';
import type { Principal } from '../auth/principal';
import { audienceFilter } from '../authz';
import { assertEmployee } from './common';

/** Everything the dashboard shows except assigned ideas (those come from the insights area via ./ideas). */
export async function getDashboard(p: Principal | null) {
  await assertEmployee(p, 'employee.dashboard');
  const upcoming = await db
    .select({ id: schema.events.id, title: schema.events.title, startsAt: schema.events.startsAt, kind: schema.events.kind })
    .from(schema.events)
    .where(and(eq(schema.events.audienceKind, 'employees'), audienceFilter({ kind: schema.events.audienceKind, orgId: schema.events.audienceOrgId, product: schema.events.audienceProduct }, p), gte(schema.events.startsAt, new Date(Date.now() - 3 * 3600_000)), eq(schema.events.status, 'scheduled')))
    .orderBy(asc(schema.events.startsAt))
    .limit(5);
  const experiments = await db
    .select({ id: schema.employeeItems.id, title: schema.employeeItems.title, status: schema.employeeItems.status })
    .from(schema.employeeItems)
    .where(and(eq(schema.employeeItems.kind, 'experiment'), eq(schema.employeeItems.ownerId, p!.userId)))
    .orderBy(desc(schema.employeeItems.updatedAt))
    .limit(5);
  const notes = await db
    .select({ id: schema.employeeItems.id, title: schema.employeeItems.title, body: schema.employeeItems.body, updatedAt: schema.employeeItems.updatedAt })
    .from(schema.employeeItems)
    .where(eq(schema.employeeItems.kind, 'release_note'))
    .orderBy(desc(schema.employeeItems.updatedAt))
    .limit(3);
  return { upcoming, experiments, notes };
}
