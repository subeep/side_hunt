import { z } from 'zod';
import type { Principal } from '../auth/principal';
import { AuthzError } from '../auth/invitations';
import { authorize, type Action } from '../authz/policy';
import { audit } from '../audit';

export { AuthzError };
/** User-correctable validation problem (shown in the form). */
export class InputError extends Error {}

export interface FormState {
  ok?: string;
  error?: string;
}

/** Record a denied attempt and refuse. Used by every lib function that mutates or reads protected data. */
export async function deny(p: Principal | null, action: string, reason: string, extra: { resourceType?: string; resourceId?: string; orgId?: string | null; meta?: Record<string, unknown> } = {}): Promise<never> {
  await audit({ actorId: p?.userId ?? null, actorOrgId: p?.activeOrgId ?? null, action, outcome: 'deny', resourceType: extra.resourceType, resourceId: extra.resourceId, orgId: extra.orgId, meta: { reason, ...extra.meta } });
  throw new AuthzError(reason);
}

/** Verified employee only (identity + allowlist + employee membership are already folded into p.isEmployee). */
export async function assertEmployee(p: Principal | null, action: string): Promise<Principal> {
  if (!p?.isEmployee) return deny(p, action, 'employees only');
  return p;
}

/** Central policy check + audited denial. */
export async function assertAction(p: Principal | null, policyAction: Action, auditAction: string, ctx: Parameters<typeof authorize>[2] = {}): Promise<Principal> {
  const d = authorize(p, policyAction, ctx);
  if (!d.allow) return deny(p, auditAction, d.reason);
  return p!;
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new InputError(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

/** Turn thrown domain errors into form state. Anything unexpected (including Next redirect/forbidden signals) propagates. */
export async function guarded(fn: () => Promise<string | void>): Promise<FormState> {
  try {
    return { ok: (await fn()) || 'Saved.' };
  } catch (e) {
    if (e instanceof AuthzError) return { error: `Not permitted: ${e.reason}.` };
    if (e instanceof InputError) return { error: e.message };
    throw e;
  }
}

export const text = (min: number, max: number, label: string) =>
  z.string({ message: `${label} is required` }).trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} must be at most ${max} characters`);
export const optText = (max: number, label: string) => z.string().trim().max(max, `${label} must be at most ${max} characters`).optional().transform((v) => v || undefined);
/** Read FormData into a plain object of strings (files and missing keys are dropped). */
export const fromForm = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
export const PAGE_SIZE = 25;
export const pageOf = (raw: unknown) => Math.max(1, Math.min(10_000, Number.parseInt(String(raw ?? '1'), 10) || 1));
