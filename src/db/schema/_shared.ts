import { text, timestamp } from 'drizzle-orm/pg-core';
import { newId } from '../ids';

export const pk = (prefix = '') =>
  text('id')
    .primaryKey()
    .$defaultFn(() => newId(prefix));

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Audience metadata carried by every protected resource.
 * audience_kind NULL (missing metadata) means DENY. Public must be explicitly 'public'.
 *   public     – anyone
 *   employees  – verified, active employee membership
 *   org        – active members of audience_org_id (the principal's ACTIVE workspace must match)
 *   product    – active workspace is entitled to audience_product
 *   community  – authorised participants of the approved cross-client learning community
 */
export const audienceCols = () => ({
  audienceKind: text('audience_kind').$type<'public' | 'employees' | 'org' | 'product' | 'community'>(),
  audienceOrgId: text('audience_org_id'),
  audienceProduct: text('audience_product'),
});
