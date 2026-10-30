'use server';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, schema } from '@/db';
import { requireUser } from '@/lib/authz/guards';

export async function markAllReadAction() {
  const p = await requireUser('/notifications');
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, p.userId), isNull(schema.notifications.readAt)));
  revalidatePath('/notifications');
}
