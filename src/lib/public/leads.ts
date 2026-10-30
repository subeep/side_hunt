import { db, schema } from '@/db';
import { audit } from '../audit';
import { hashToken } from '../crypto';
import { rateLimit } from '../ratelimit';
import { fieldErrors, leadRawFromForm, leadSchemas, type LeadFormState, type LeadKind } from './lead-schema';

export type LeadResult = { ok: true } | { ok: false; errors: Record<string, string>; rateLimited?: boolean };

export const LEAD_LIMITS = { perIp: { max: 5, windowSec: 3600 }, perEmail: { max: 3, windowSec: 86400 } } as const;

/**
 * Public enquiry intake (demo request / hackathon interest). Server-side zod validation (authoritative), honeypot,
 * DB-backed rate limits (IP and email, both hashed, never stored in the clear in the limiter). Write-only: nothing here reads leads back.
 */
export async function submitLead(kind: LeadKind, raw: Record<string, unknown>, ip: string): Promise<LeadResult> {
  // Honeypot: real people never see or fill this field. Pretend success, store nothing, spend no resources.
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return { ok: true };

  const parsed = leadSchemas[kind].safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const okIp = await rateLimit(`lead:${kind}:ip:${hashToken(ip)}`, LEAD_LIMITS.perIp.max, LEAD_LIMITS.perIp.windowSec);
  const okEmail = okIp && (await rateLimit(`lead:${kind}:em:${hashToken(v.email)}`, LEAD_LIMITS.perEmail.max, LEAD_LIMITS.perEmail.windowSec));
  if (!okIp || !okEmail) return { ok: false, rateLimited: true, errors: { form: 'Too many requests from your connection. Please try again later.' } };

  const [row] = await db
    .insert(schema.leads)
    .values({
      kind, name: v.name, email: v.email, company: v.company ?? null, role: v.role ?? null, message: v.message ?? null,
      interests: v.interests, consentAt: new Date(), marketingOptIn: v.marketing,
    })
    .returning({ id: schema.leads.id });
  await audit({ action: 'lead.create', resourceType: 'lead', resourceId: row.id, meta: { kind, marketingOptIn: v.marketing } });
  return { ok: true };
}

const OK_MESSAGE: Record<LeadKind, string> = {
  demo: 'Your request has been recorded and a member of the team will review it. We have not sent a confirmation email; we will reply using the details you gave.',
  hackathon: 'Your interest has been recorded. We will contact you when dates and participation details are announced. No confirmation email has been sent.',
};

/** FormData -> user-facing state for the public forms (used by the server actions). */
export async function leadFormState(kind: LeadKind, fd: FormData, ip: string): Promise<LeadFormState> {
  const raw = leadRawFromForm(fd);
  const r = await submitLead(kind, raw, ip);
  if (r.ok) return { status: 'ok', message: OK_MESSAGE[kind] };
  const { website: _hp, ...values } = raw;
  return { status: 'error', errors: r.errors, values };
}
