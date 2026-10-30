import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { audit } from '@/lib/audit';

export const CURRENT_TERMS_VERSION = '2026-10';

export async function hasAcceptedTerms(userId: string, orgId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: schema.termsAcceptances.id })
    .from(schema.termsAcceptances)
    .where(and(eq(schema.termsAcceptances.userId, userId), eq(schema.termsAcceptances.orgId, orgId), eq(schema.termsAcceptances.termsVersion, CURRENT_TERMS_VERSION)));
  return !!r;
}

/**
 * Records that the user reviewed the workspace terms AND the learning-sharing explanation for this workspace.
 * This is an acknowledgement only. It is NOT consent to share or train: that is asked per contribution.
 */
export async function recordTermsAcceptance(userId: string, orgId: string, via: 'terms_page' | 'invitation') {
  await db.insert(schema.termsAcceptances).values({ userId, orgId, termsVersion: CURRENT_TERMS_VERSION, learningExplained: true }).onConflictDoNothing();
  await audit({ actorId: userId, actorOrgId: orgId, action: 'terms.accept', orgId, meta: { version: CURRENT_TERMS_VERSION, via } });
}
