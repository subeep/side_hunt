/** Pure constants (client-safe: no db / server imports). */
import type { ConsentPurpose, ContributionStatus } from '@/db/schema/learning';

export const LIMITS = {
  title: { min: 5, max: 140 },
  observation: { min: 30, max: 4000 },
  industry: { max: 80 },
  region: { max: 80 },
  period: { max: 80 },
  summary: { min: 20, max: 1200 },
  link: { max: 300, count: 5 },
  message: { min: 5, max: 600 },
  note: { max: 1000 },
  details: { max: 1000 },
} as const;

export const KIND_LABELS = {
  market_observation: 'Market observation',
  emerging_trend: 'Emerging trend',
  product_gap: 'Product gap',
  operational_challenge: 'Operational challenge',
  successful_practice: 'Successful practice',
  improvement_suggestion: 'Improvement suggestion',
} as const;

export const KIND_HINTS: Record<keyof typeof KIND_LABELS, string> = {
  market_observation: 'Something you see happening in your market or portfolio.',
  emerging_trend: 'A pattern that is only starting to show.',
  product_gap: 'Something a product could not do when you needed it.',
  operational_challenge: 'A recurring difficulty in day-to-day credit or reporting work.',
  successful_practice: 'An approach that worked and others might reuse.',
  improvement_suggestion: 'A concrete idea to make an offering better.',
};

export const OFFERINGS = [
  { slug: 'credit-strategy-simulator', name: 'Credit Strategy Simulator' },
  { slug: 'sme-credit-decisioning', name: 'SME Credit Decisioning Workbench' },
  { slug: 'similar-portfolio-intelligence', name: 'Similar Portfolio Intelligence' },
  { slug: 'riva', name: 'RIVA' },
] as const;
export const offeringName = (slug?: string | null) => OFFERINGS.find((o) => o.slug === slug)?.name ?? null;

/** Controlled topic vocabulary (the stored value is the label, so every consumer can display it as-is). */
export const TOPICS = ['Seasonal cash flow', 'Document inconsistencies', 'Reporting validation', 'Policy overrides', 'Data quality', 'Explainability', 'Other'] as const;

export const EVIDENCE_TYPES = {
  first_hand: 'First-hand observation',
  aggregate_metric: 'Aggregate metric from our own portfolio',
  external_report: 'External report or publication',
  anecdotal: 'Anecdotal / second-hand',
} as const;
export const CONFIDENCE_LABELS = { low: 'Low confidence', medium: 'Medium confidence', high: 'High confidence' } as const;
export const EVIDENCE_QUALITY = { unassessed: 'Not assessed', weak: 'Weak', moderate: 'Moderate', strong: 'Strong' } as const;

export const SHARING = {
  private: { label: 'Private to me', short: 'Private', body: 'Only you can see it. It stays a private draft. It is not visible to colleagues, moderators, Azentio staff or other clients.' },
  organisation: { label: 'Within my organisation', short: 'Org', body: 'Visible to members of your own organisation after you submit it. It is never shared with other clients and is not reviewed by moderators.' },
  community: { label: 'Propose sharing with the approved learning community', short: 'Community (proposed)', body: 'A moderator reviews it and publishes a redacted, de-identified summary to approved participating organisations. Nothing is shared until a moderator approves it, and your private original always stays private. It is also visible to your organisation.' },
} as const;

export const CONSENT_COPY: Record<ConsentPurpose, { label: string; body: string; required: string; default: boolean }> = {
  store_process: { label: 'Store and process this contribution', body: 'Azentio may store this contribution and process it for review (including an automated sensitive-content scan).', required: 'Required to submit anything.', default: false },
  publish_shared: { label: 'Publish a reviewed, de-identified summary to the community', body: 'A moderator-approved summary (not your original text) may be shown to approved participating organisations.', required: 'Required when you propose community sharing.', default: false },
  attribution: { label: 'Credit my organisation by name', body: 'Optional. Even if you agree, a moderator must approve attribution, and removing a name alone does not make a rare observation anonymous.', required: 'Optional. Off by default.', default: false },
  training: { label: 'Allow use in future model training or learning programmes', body: 'Not used in this release. Any future programme (including federated learning) needs a separate, explicit opt-in from you.', required: 'Optional. Off by default.', default: false },
};

export const STATUS_META: Record<ContributionStatus, { label: string; tone: 'neutral' | 'brown' | 'sage' | 'clay' | 'amber'; body: string }> = {
  draft: { label: 'Private draft', tone: 'neutral', body: 'Saved privately. Nothing has been shared or sent for review.' },
  submitted: { label: 'Submitted', tone: 'amber', body: 'Waiting for a moderator to pick it up.' },
  in_review: { label: 'In review', tone: 'amber', body: 'A moderator is reviewing and redacting a shared version.' },
  clarification_requested: { label: 'Clarification requested', tone: 'brown', body: 'A moderator asked you a question. Amend and resubmit.' },
  published: { label: 'Published', tone: 'sage', body: 'This is live for its audience.' },
  rejected: { label: 'Not published', tone: 'clay', body: 'A moderator declined to publish this. It stays private.' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', body: 'You withdrew this. It is no longer available to the audience it was shared with, and any shared copy was removed from search and caches.' },
  unpublished: { label: 'Temporarily unpublished', tone: 'clay', body: 'Taken offline by a moderator while a concern is reviewed.' },
};

/** Status explanation that is honest about WHO saw it: organisation-only items are never moderated; community items are. */
export function statusBody(status: ContributionStatus, sharingChoice: 'private' | 'organisation' | 'community'): string {
  if (status === 'published' && sharingChoice === 'organisation') return 'Shared with members of your organisation. It was not reviewed by moderators and is never shown to other clients.';
  if (status === 'published' && sharingChoice === 'community') return 'A moderator-reviewed, de-identified version is live for approved participating organisations. Your private original is not shared.';
  return STATUS_META[status].body;
}

export const PRODUCTION_PROPAGATION_SLA =
  'Production target: the search index and retrieval caches are updated within 60 seconds of withdrawal; CDN/edge caches within 5 minutes. In this environment the index and cache purge run synchronously inside the withdrawal request.';

export const WITHDRAWAL_CAVEATS = [
  'Material that other people have already viewed cannot be recalled automatically.',
  'Copies that third parties made (screenshots, exports, notes) cannot be recalled automatically.',
  'Withdrawal does not untrain a model: if a model had been trained on the content, that training is not reversed. (No model is trained on contributions in this release.)',
] as const;

/** What the consent passport tells the contributor about each version's audience and permitted use. */
export const USE_POLICY = {
  private: 'Visible to you only. Used for nothing else.',
  organisation: 'Visible to members of your organisation. Not shared with other clients. Not used for training.',
  source: 'Your private original is visible to you, your organisation (if you chose organisation or community sharing) and, once explicitly submitted for review, to learning moderators. It is never shown to other clients.',
  shared: 'The reviewed shared version is searchable by approved participating organisations, product owners and moderators. It may be cited in AI-assisted summaries and aggregated into themes (counted by distinct organisation). It is not used for model training.',
} as const;

export const PRIVACY_PROMPT = [
  'customer identities (names, employers, addresses)',
  'account, card or IBAN numbers',
  'transaction-level or customer-level financial data',
  'credentials, keys, tokens or passwords',
  'confidential contract terms or pricing',
] as const;

export const SCAN_DISCLAIMER = 'The automated scan is a helper, not a privacy guarantee. It misses things and over-flags others. You remain responsible for what you write, and a human moderator reviews anything proposed for sharing.';

export const REPORT_REASONS = { misleading: 'Misleading or inaccurate', confidential: 'Contains confidential information', inappropriate: 'Inappropriate content' } as const;
