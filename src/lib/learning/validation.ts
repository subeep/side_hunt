/** Shared zod schemas (client + server). The server ALWAYS re-validates; the form mirrors these as HTML attributes. */
import { z } from 'zod';
import { CONTRIBUTION_KINDS } from '@/db/schema/learning';
import { LIMITS, OFFERINGS, TOPICS } from './constants';

const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional().transform((v) => v ?? null);
const enumOpt = <T extends readonly [string, ...string[]]>(vals: T) =>
  z.union([z.enum(vals), z.literal(''), z.null(), z.undefined()]).transform((v) => (v ? (v as T[number]) : null));

const link = z.string().trim().max(LIMITS.link.max).refine((u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:';
  } catch {
    return false;
  }
}, 'Links must be valid http(s) URLs');

export const parseLinks = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/\r?\n/)).map((s) => s.trim()).filter(Boolean);

export const contributionInput = z.object({
  kind: z.enum(CONTRIBUTION_KINDS),
  title: z.string().trim().min(LIMITS.title.min, `Title needs at least ${LIMITS.title.min} characters`).max(LIMITS.title.max),
  observation: z.string().trim().min(LIMITS.observation.min, `Describe the observation in at least ${LIMITS.observation.min} characters`).max(LIMITS.observation.max),
  offeringSlug: enumOpt(OFFERINGS.map((o) => o.slug) as unknown as readonly [string, ...string[]]),
  industry: opt(LIMITS.industry.max),
  region: opt(LIMITS.region.max),
  observationPeriod: opt(LIMITS.period.max),
  evidenceType: enumOpt(['first_hand', 'aggregate_metric', 'external_report', 'anecdotal'] as const),
  confidence: enumOpt(['low', 'medium', 'high'] as const),
  topic: enumOpt(TOPICS as unknown as readonly [string, ...string[]]),
  supportLinks: z.preprocess(parseLinks, z.array(link).max(LIMITS.link.count, `At most ${LIMITS.link.count} links`)),
  sharingChoice: z.enum(['private', 'organisation', 'community']),
});
export type ContributionInput = z.infer<typeof contributionInput>;

/** Extra completeness required before something can leave private draft. Community proposals need context for reviewers. */
export function submissionGaps(c: { sharingChoice: string; observationPeriod: string | null; evidenceType: string | null; confidence: string | null; topic: string | null }): string[] {
  if (c.sharingChoice !== 'community') return [];
  const gaps: string[] = [];
  if (!c.observationPeriod) gaps.push('observation period');
  if (!c.evidenceType) gaps.push('evidence type');
  if (!c.confidence) gaps.push('confidence label');
  if (!c.topic) gaps.push('topic');
  return gaps;
}

export const sharedRepInput = z.object({
  title: z.string().trim().min(LIMITS.title.min).max(LIMITS.title.max),
  summary: z.string().trim().min(LIMITS.summary.min, `Summary needs at least ${LIMITS.summary.min} characters`).max(LIMITS.summary.max),
  industry: opt(LIMITS.industry.max),
  region: opt(LIMITS.region.max),
  periodLabel: opt(LIMITS.period.max),
  evidenceQuality: z.enum(['weak', 'moderate', 'strong']),
  includeAttribution: z.boolean().default(false),
  redactionNotes: opt(LIMITS.note.max),
});
export type SharedRepInput = z.infer<typeof sharedRepInput>;

export const reasonText = (min = LIMITS.message.min) => z.string().trim().min(min, `Please write at least ${min} characters`).max(LIMITS.message.max);
export const noteText = z.string().trim().max(LIMITS.note.max).optional().transform((v) => v || null);

export const reportInput = z.object({
  sharedId: z.string().min(1).max(64),
  reason: z.enum(['misleading', 'confidential', 'inappropriate']),
  details: z.string().trim().max(LIMITS.details.max).optional().transform((v) => v || null),
});

/** First error message per field, for form display. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? '_');
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
