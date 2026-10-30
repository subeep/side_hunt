import { schema } from '@/db';

const s = schema.sharedContributions;

/**
 * The ONLY columns of shared_contributions that may be selected into a response/serialised payload.
 * Deliberately omits org_id, contribution_id, published_by (tenant IDs, private source link, reviewer identity).
 * Use `db.select(sharedPublicColumns).from(...)`.  Never `select()` the whole table in code that reaches a client.
 */
export const sharedPublicColumns = {
  id: s.id,
  kind: s.kind,
  title: s.title,
  summary: s.summary,
  offeringSlug: s.offeringSlug,
  industry: s.industry,
  region: s.region,
  periodLabel: s.periodLabel,
  topic: s.topic,
  evidenceType: s.evidenceType,
  confidence: s.confidence,
  evidenceQuality: s.evidenceQuality,
  attributionLabel: s.attributionLabel,
  publishedAt: s.publishedAt,
  version: s.version,
};
export type SharedPublic = {
  id: string; kind: string; title: string; summary: string; offeringSlug: string | null; industry: string | null; region: string | null;
  periodLabel: string | null; topic: string | null; evidenceType: string | null; confidence: string | null;
  evidenceQuality: 'unassessed' | 'weak' | 'moderate' | 'strong'; attributionLabel: string | null; publishedAt: Date | null; version: number;
};
