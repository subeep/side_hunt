import { db, schema } from '@/db';

/**
 * Audience-appropriate language gate for anything clients can read (idea titles, problems, outcomes, updates).
 * Returns a human-readable rejection reason, or null when the text is acceptable. This is a safeguard, not a guarantee:
 * product owners remain responsible for the content they post.
 */
const MONTH = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const RULES: { re: RegExp; why: string }[] = [
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, why: 'it contains an email address' },
  { re: /\b[A-Z][A-Z0-9]{1,9}-\d{1,7}\b/, why: 'it contains a ticket-style reference' },
  { re: /\b(ticket|case|incident|request|support case)\s*(#|no\.?|number|id)?\s*[:#-]?\s*\d{3,}/i, why: 'it refers to a support ticket or case number' },
  { re: /\b(tkt|con|shr|usr|org|ida|ish|iup|cnt|med|evt|rep|cmt)_[a-z0-9_]{3,}\b/i, why: 'it contains an internal record id' },
  { re: /\bcommit(ted|s|ment|ments)?\b/i, why: 'it reads as a delivery commitment' },
  { re: /\beta\b/i, why: 'it contains an ETA' },
  { re: /\bq[1-4]\b/i, why: 'it names a delivery quarter' },
  { re: /\bguarantee[sd]?\b/i, why: 'it reads as a guarantee' },
  { re: new RegExp(`\\bby (the )?(end of )?(${MONTH})\\b`, 'i'), why: 'it states a delivery date' },
  { re: new RegExp(`\\b(scheduled|planned|slated|due|targeted|expected|set)\\s+(for|in|on|by)\\b[^.]{0,30}\\b(${MONTH}|\\d{4}|next (week|month|quarter|year)|tomorrow)\\b`, 'i'), why: 'it states a delivery date' },
  { re: new RegExp(`\\b(release|launch|delivery|ship(ping)?|go-live|availability)\\s+(date|window|timeline|schedule)\\b`, 'i'), why: 'it states a delivery date' },
  { re: new RegExp(`\\b(\\d{1,2}(st|nd|rd|th)?\\s+of\\s+(${MONTH})|(${MONTH})\\s+\\d{1,2}(st|nd|rd|th)?\\b|(in|during|for|before|after|from)\\s+(${MONTH})\\s+\\d{4})`, 'i'), why: 'it states a delivery date' },
  { re: /\b(version|release|build|v)\s*\.?\s*\d+(\.\d+)+\b|\bv\d+(\.\d+)*\b/i, why: 'it names a software version' },
  { re: /\b(available|ready|live|shipping|released)\s+(in|by|on|from)\s+(version|release|v\d|next|the next)/i, why: 'it reads as a release promise' },
  { re: /\bon track\b/i, why: 'it reads as a delivery commitment' },
  { re: /\b(will|going to|scheduled to)\s+(ship|deliver|release|launch|land)\b/i, why: 'it reads as a delivery promise' },
  { re: /\b(roadmap|internal|priorit(y|ies) discussion|budget)\b/i, why: 'it refers to internal roadmap or prioritisation material' },
];

export async function plainLanguageProblem(text: string): Promise<string | null> {
  for (const r of RULES) if (r.re.test(text)) return `Not audience-appropriate: ${r.why}. Describe the theme and the decision in plain language instead; status is not a delivery promise.`;
  const orgs = await db.select({ name: schema.organisations.name, slug: schema.organisations.slug, kind: schema.organisations.kind }).from(schema.organisations);
  for (const o of orgs) {
    if (o.kind !== 'client') continue;
    const names = [o.name, o.name.split(' ')[0], o.slug].filter((n) => n.length >= 4);
    if (names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)))
      return 'Not audience-appropriate: it names a client organisation. Updates are visible to other clients.';
  }
  return null;
}
