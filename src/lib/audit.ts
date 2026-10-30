import { db, schema } from '@/db';

export interface AuditInput {
  actorId?: string | null;
  actorOrgId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  orgId?: string | null;
  outcome?: 'ok' | 'deny';
  meta?: Record<string, unknown>;
}

/** Append an audit event. Never throws: auditing must not break the request, but failures are logged. */
export async function audit(e: AuditInput) {
  try {
    await db.insert(schema.auditEvents).values({
      actorId: e.actorId ?? null,
      actorOrgId: e.actorOrgId ?? null,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      orgId: e.orgId ?? null,
      outcome: e.outcome ?? 'ok',
      meta: e.meta,
    });
  } catch (err) {
    console.error('audit failed', e.action, err);
  }
}
