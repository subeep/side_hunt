import { z } from 'zod';

/** Pure (no server imports): shared by the server action (authoritative) and the client form (hints only). */
export const PRODUCT_INTERESTS = ['credit-strategy-simulator', 'sme-credit-decisioning', 'similar-portfolio-intelligence', 'riva'] as const;
export const PRODUCT_LABEL: Record<(typeof PRODUCT_INTERESTS)[number], string> = {
  'credit-strategy-simulator': 'Credit Strategy Simulator',
  'sme-credit-decisioning': 'SME Credit Decisioning Workbench',
  'similar-portfolio-intelligence': 'Similar Portfolio Intelligence',
  riva: 'RIVA',
};
export const HACKATHON_TRACKS = ['Intelligent decisioning', 'Document intelligence', 'AI agents & automation', 'Analytics & insights', 'Reporting & validation'] as const;
export type LeadKind = 'demo' | 'hackathon';

const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const opt = (max: number, label: string) => z.preprocess(blankToUndef, z.string().trim().max(max, `${label} must be at most ${max} characters.`).optional());
const email = z.string().trim().toLowerCase().max(200, 'Email is too long.').pipe(z.email('Enter a valid email address.'));
const name = z.string().trim().min(2, 'Enter your name (at least 2 characters).').max(100, 'Name must be at most 100 characters.');
const consent = z.boolean().refine((v) => v === true, 'Please confirm we may use these details to reply to you.');

const base = { name, email, consent, marketing: z.boolean().default(false), website: z.string().max(200).optional() };

export const demoSchema = z.object({
  ...base,
  company: z.string().trim().min(2, 'Enter your organisation.').max(120, 'Organisation must be at most 120 characters.'),
  role: opt(100, 'Role'),
  message: z.string().trim().min(10, 'Tell us a little about your challenge (at least 10 characters).').max(2000, 'Message must be at most 2000 characters.'),
  interests: z.array(z.enum(PRODUCT_INTERESTS)).max(4).default([]),
});

export const hackathonSchema = z.object({
  ...base,
  company: opt(120, 'Organisation'),
  role: opt(100, 'Role'),
  message: opt(1000, 'Message'),
  interests: z.array(z.enum(HACKATHON_TRACKS)).max(5).default([]),
});

export const leadSchemas = { demo: demoSchema, hackathon: hackathonSchema } as const;

/** Convert FormData (or a plain object) into the raw shape the schemas expect. */
export function leadRawFromForm(fd: FormData) {
  const s = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
  return {
    name: s('name'), email: s('email'), company: s('company'), role: s('role'), message: s('message'), website: s('website'),
    interests: fd.getAll('interests').filter((x): x is string => typeof x === 'string'),
    consent: fd.get('consent') === 'on',
    marketing: fd.get('marketing') === 'on',
  };
}

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? 'form');
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

export interface LeadFormState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  errors?: Record<string, string>;
  /** Echoed back (never including the honeypot) so a failed submit does not wipe what the person typed. */
  values?: { name?: string; email?: string; company?: string; role?: string; message?: string; interests?: string[]; consent?: boolean; marketing?: boolean };
}
