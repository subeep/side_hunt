import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { as, USER, ORG } from './helpers/principals';
import { consentHistory, createContribution, currentConsents, getContributionForViewer, getForModeration, listMine, listOrg, moderationQueue, saveContribution, setOptionalConsent, submitContribution, withdrawShared } from '@/lib/learning';
import { scanFields, scanText } from '@/lib/learning/sensitive';
import { ALL_CONSENTS, mkDraft, mkPublished, mkSubmitted, validInput } from './learning-helpers';

describe('capture: private draft by default', () => {
  it('Save never shares: community-intended drafts stay drafts, with no consent, no shared copy, invisible to moderators', async () => {
    const nw = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const id = await mkDraft(nw, { sharingChoice: 'community' });
    const saved = await saveContribution(nw, id, validInput({ title: 'Edited but still private', sharingChoice: 'community' }));
    expect(saved).toMatchObject({ ok: true, status: 'draft' });
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c).toMatchObject({ status: 'draft', submittedAt: null, currentSharedId: null });
    expect(await consentHistory(id)).toHaveLength(0);
    expect(await db.select().from(schema.sharedContributions).where(eq(schema.sharedContributions.contributionId, id))).toHaveLength(0);
    expect(await getForModeration(mod, id)).toBeNull();
    expect((await moderationQueue(mod)).some((q) => q.id === id)).toBe(false);
  });

  it('validates on the server: lengths, enums, links', async () => {
    const nw = await as(USER.nwMember);
    const bad = async (over: Record<string, unknown>, field: string) => {
      const r = await createContribution(nw, validInput(over));
      expect(r.ok, field).toBe(false);
      if (!r.ok) expect(Object.keys(r.errors ?? {}), field).toContain(field);
    };
    await bad({ title: 'abc' }, 'title');
    await bad({ title: 'x'.repeat(141) }, 'title');
    await bad({ observation: 'too short' }, 'observation');
    await bad({ observation: 'y'.repeat(4001) }, 'observation');
    await bad({ kind: 'secret_plan' }, 'kind');
    await bad({ sharingChoice: 'everyone' }, 'sharingChoice');
    await bad({ evidenceType: 'rumour' }, 'evidenceType');
    await bad({ offeringSlug: 'not-a-product' }, 'offeringSlug');
    await bad({ supportLinks: 'javascript:alert(1)' }, 'supportLinks');
    await bad({ supportLinks: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`).join('\n') }, 'supportLinks');
    await bad({ region: 'r'.repeat(81) }, 'region');
    expect((await createContribution(nw, validInput({ supportLinks: 'https://example.com/a\nhttps://example.com/b' }))).ok).toBe(true);
  });

  it('requires an active client workspace; employees and multi-membership users without a workspace cannot create', async () => {
    expect(await createContribution(await as(USER.employee), validInput())).toMatchObject({ ok: false, code: 'no_workspace' });
    expect(await createContribution(await as(USER.multi), validInput())).toMatchObject({ ok: false, code: 'no_workspace' });
    expect((await createContribution(await as(USER.multi, ORG.harbor), validInput())).ok).toBe(true);
  });

  it('community sharing is unavailable to an organisation that is not an approved participant', async () => {
    const nw = { ...(await as(USER.nwMember)), communityApproved: false };
    expect(await createContribution(nw, validInput({ sharingChoice: 'community' }))).toMatchObject({ ok: false, code: 'precondition' });
    expect((await createContribution(nw, validInput({ sharingChoice: 'private' }))).ok).toBe(true);
  });

  it('the sharing choice cannot change after a draft leaves draft (never silently widened)', async () => {
    const nw = await as(USER.nwMember);
    const id = await mkSubmitted(nw, { sharingChoice: 'organisation' });
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c.status).toBe('published'); // org-only: visible to the org, no moderation
    expect(await saveContribution(nw, id, validInput({ sharingChoice: 'community' }))).toMatchObject({ ok: false, code: 'locked' });
    const [after] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(after.sharingChoice).toBe('organisation');
    const mod = await as(USER.moderator);
    expect(await getForModeration(mod, id)).toBeNull();
  });
});

describe('submission requirements and consent', () => {
  it('private items cannot be submitted; store_process is required; community needs publish_shared; completeness is enforced', async () => {
    const nw = await as(USER.nwAdmin);
    const priv = await mkDraft(nw, { sharingChoice: 'private' });
    expect(await submitContribution(nw, priv, { consents: ALL_CONSENTS, acknowledgeFlags: true })).toMatchObject({ ok: false, code: 'precondition' });
    const id = await mkDraft(nw);
    expect(await submitContribution(nw, id, { consents: { store_process: false, publish_shared: true }, acknowledgeFlags: true })).toMatchObject({ ok: false, code: 'precondition' });
    expect(await submitContribution(nw, id, { consents: { store_process: true, publish_shared: false }, acknowledgeFlags: true })).toMatchObject({ ok: false, code: 'precondition' });
    const incomplete = await mkDraft(nw, { evidenceType: '', confidence: '', observationPeriod: '', topic: '' });
    expect(await submitContribution(nw, incomplete, { consents: ALL_CONSENTS, acknowledgeFlags: true })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await consentHistory(id)).toHaveLength(0); // failed submissions record nothing
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c.status).toBe('draft');
  });

  it('flags must be acknowledged before submission; flags are stored', async () => {
    const nw = await as(USER.nwAdmin);
    const id = await mkDraft(nw, { observation: 'Contact jane.doe@example.com about the account 1234567890123 for Mr Smith; password is hunter2 in the tool.' });
    const [c] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(c.sensitiveFlags!.map((f) => f.type)).toEqual(expect.arrayContaining(['email', 'account_label', 'customer_name', 'secret_keyword']));
    expect(await submitContribution(nw, id, { consents: ALL_CONSENTS })).toMatchObject({ ok: false, code: 'precondition' });
    expect((await submitContribution(nw, id, { consents: ALL_CONSENTS, acknowledgeFlags: true })).ok).toBe(true);
    const [after] = await db.select().from(schema.contributions).where(eq(schema.contributions.id, id));
    expect(after).toMatchObject({ status: 'submitted', sensitiveAcknowledged: true });
    expect(after.sensitiveFlags!.length).toBeGreaterThan(0);
  });

  it('four SEPARATE append-only consents; optional ones default OFF', async () => {
    const nw = await as(USER.nwAdmin);
    const id = await mkSubmitted(nw, {}, { store_process: true, publish_shared: true });
    const st = await currentConsents(id);
    expect(st.store_process.granted).toBe(true);
    expect(st.publish_shared.granted).toBe(true);
    expect(st.attribution.granted).toBe(false);
    expect(st.training.granted).toBe(false);
    const h = await consentHistory(id);
    expect(h.map((r) => r.purpose).sort()).toEqual(['attribution', 'publish_shared', 'store_process', 'training']);
    // training toggled on then off: history grows, earlier rows are untouched
    expect(await setOptionalConsent(nw, id, 'training', true)).toMatchObject({ ok: true });
    expect((await currentConsents(id)).training.granted).toBe(true);
    expect((await currentConsents(id)).publish_shared.granted).toBe(true); // independent
    await setOptionalConsent(nw, id, 'training', false);
    const h2 = await consentHistory(id);
    expect(h2).toHaveLength(h.length + 2);
    expect(h2.slice(0, h.length).map((r) => r.id)).toEqual(h.map((r) => r.id));
    expect((await currentConsents(id)).training.granted).toBe(false);
  });

  it('attribution cannot be ADDED after submission (would widen disclosure unreviewed); it can be revoked at any time', async () => {
    const nw = await as(USER.nwAdmin);
    const id = await mkSubmitted(nw);
    expect(await setOptionalConsent(nw, id, 'attribution', true)).toMatchObject({ ok: false, code: 'precondition' });
    const draft = await mkDraft(nw);
    expect(await setOptionalConsent(nw, draft, 'attribution', true)).toMatchObject({ ok: true });
    // someone else's contribution: not found, no change
    expect(await setOptionalConsent(await as(USER.hbMember), draft, 'training', true)).toMatchObject({ ok: false, code: 'not_found' });
    expect((await currentConsents(draft)).training.granted).toBe(false);
  });

  it('org-only submission records store_process only and never publish_shared / attribution', async () => {
    const nw = await as(USER.nwMember);
    const id = await mkSubmitted(nw, { sharingChoice: 'organisation' }, { store_process: true, publish_shared: true, attribution: true, training: false });
    const st = await currentConsents(id);
    expect(st.store_process.granted).toBe(true);
    expect(st.publish_shared.granted).toBe(false);
    expect(st.attribution.granted).toBe(false);
  });

  it('withdrawal records the consent withdrawal and keeps history', async () => {
    const nw = await as(USER.nwMember);
    const mod = await as(USER.moderator);
    const { id, sharedId } = await mkPublished(nw, mod);
    expect((await currentConsents(id)).publish_shared.granted).toBe(true);
    const before = (await consentHistory(id)).length;
    expect((await withdrawShared(nw, sharedId)).ok).toBe(true);
    const st = await currentConsents(id);
    expect(st.publish_shared.granted).toBe(false);
    expect((await consentHistory(id)).length).toBeGreaterThan(before);
    expect((await consentHistory(id)).find((r) => r.purpose === 'publish_shared' && !r.granted)?.note).toMatch(/withdrawn by author/);
  });
});

describe('visibility of contributions (/learn/c/[id], /learn/mine, /learn/org)', () => {
  it('author and org rules; everything else is null (404) with an audit deny', async () => {
    const nwAuthor = await as(USER.nwMember);
    const nwColleague = await as(USER.nwAdmin);
    const priv = await mkDraft(nwAuthor, { sharingChoice: 'private' });
    const communityDraft = await mkDraft(nwAuthor, { sharingChoice: 'community' });
    const orgShared = await mkSubmitted(nwAuthor, { sharingChoice: 'organisation' });
    const communitySubmitted = await mkSubmitted(nwAuthor, { sharingChoice: 'community' });

    expect((await getContributionForViewer(nwAuthor, priv))?.role).toBe('author');
    // colleagues: never private items or drafts; org-visible items read-only
    expect(await getContributionForViewer(nwColleague, priv)).toBeNull();
    expect(await getContributionForViewer(nwColleague, communityDraft)).toBeNull();
    expect((await getContributionForViewer(nwColleague, orgShared))?.role).toBe('org_member');
    expect((await getContributionForViewer(nwColleague, communitySubmitted))?.role).toBe('org_member');
    // other tenants, employees without a grant, the moderator, the portal admin: nothing
    for (const who of [await as(USER.hbMember), await as(USER.atAdmin), await as(USER.employee), await as(USER.moderator), await as(USER.admin), await as(USER.owner), await as(USER.outsider)])
      for (const id of [priv, communityDraft, orgShared, communitySubmitted]) expect(await getContributionForViewer(who, id), `${who.email} ${id}`).toBeNull();
    // unknown id: same answer
    expect(await getContributionForViewer(nwAuthor, 'con_does_not_exist')).toBeNull();
    const denies = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, priv), eq(schema.auditEvents.action, 'learning.contribution.read'), eq(schema.auditEvents.outcome, 'deny')));
    expect(denies.length).toBeGreaterThan(0);
  });

  it('a multi-membership user only sees the ACTIVE workspace; wrong active org is a 404 even for the author', async () => {
    const asNw = await as(USER.multi, ORG.northwind);
    const id = await mkDraft(asNw, { sharingChoice: 'private' });
    expect((await getContributionForViewer(asNw, id))?.role).toBe('author');
    expect(await getContributionForViewer(await as(USER.multi, ORG.harbor), id)).toBeNull();
    expect(await getContributionForViewer(await as(USER.multi), id)).toBeNull(); // no active workspace
    expect((await listMine(await as(USER.multi, ORG.harbor))).some((c) => c.id === id)).toBe(false);
  });

  it('portal admin can read a client contribution only under an active support authorisation (read-only, audited)', async () => {
    const nw = await as(USER.nwMember);
    const id = await mkDraft(nw, { sharingChoice: 'private' });
    const admin = await as(USER.admin);
    expect(await getContributionForViewer(admin, id)).toBeNull();
    await db.insert(schema.supportAuthorisations).values({ adminId: USER.admin, orgId: ORG.northwind, reason: 'ticket 42', expiresAt: new Date(Date.now() + 3600_000) });
    expect((await getContributionForViewer(admin, id))?.role).toBe('support');
    expect(await getContributionForViewer(await as(USER.hbAdmin), id)).toBeNull();
    const a = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.resourceId, id), eq(schema.auditEvents.action, 'learning.support_read')));
    expect(a.length).toBe(1);
  });

  it('/learn/mine lists only my own items (every status); /learn/org excludes drafts, private items and other organisations', async () => {
    const nw = await as(USER.nwMember);
    const colleague = await as(USER.nwAdmin);
    const priv = await mkDraft(nw, { sharingChoice: 'private', title: 'Private only note' });
    const orgOne = await mkSubmitted(nw, { sharingChoice: 'organisation', title: 'Shared inside Northwind' });
    const mine = (await listMine(nw)).map((c) => c.id);
    expect(mine).toEqual(expect.arrayContaining([priv, orgOne, 'con_seed_nw_draft']));
    expect((await listMine(colleague)).map((c) => c.id)).not.toContain(priv);
    const org = (await listOrg(colleague)).map((r) => r.c.id);
    expect(org).toContain(orgOne);
    expect(org).not.toContain(priv);
    expect(org).not.toContain('con_seed_nw_draft');
    expect(org.some((id) => id.includes('_hb_') || id.includes('season_hb'))).toBe(false);
    const hbOrg = (await listOrg(await as(USER.hbAdmin))).map((r) => r.c.id);
    expect(hbOrg).toContain('con_seed_hb_org_only');
    expect(hbOrg).not.toContain(orgOne);
    expect(await listOrg(await as(USER.employee))).toEqual([]);
  });
});

describe('sensitive-content scan', () => {
  const types = (t: string) => scanText('f', t).map((f) => f.type);
  it('flags emails, phones, IBAN/card/account numbers, long amounts, secrets, names, companies, NDA', () => {
    expect(types('mail me at a.b@corp.example')).toContain('email');
    expect(types('call +855 12 345 678 today')).toContain('phone');
    expect(types('call (415) 555-0132 today')).toContain('phone');
    expect(types('IBAN DE89 3704 0044 0532 0130 00 on file')).toContain('iban');
    expect(types('card 4111 1111 1111 1111')).toEqual(expect.arrayContaining([expect.stringMatching(/grouped_digits|card_or_account_number/)]));
    expect(types('account number 123456789012')).toBeTruthy();
    expect(types('ref 12345678901234')).toContain('card_or_account_number');
    expect(types('exposure of $1,250,000 on the line')).toContain('currency_amount');
    expect(types('EUR 240,000 term loan')).toContain('currency_amount');
    expect(types('the API key and the password were shared')).toContain('secret_keyword');
    expect(types('Mr Smith and Ms Jane Brown')).toContain('customer_name');
    expect(types('Acme Holdings Ltd was declined')).toContain('company_name');
    expect(types('terms are under NDA')).toContain('confidential_terms');
    expect(types('SSN 123-45-6789')).toContain('national_id');
  });
  it('does not flag ordinary, de-identified prose', () => {
    expect(scanText('f', 'Analysts treated comparable seasonal files differently over two winters; about one file in five was affected in 2025-2026 (Q3).')).toEqual([]);
  });
  it('seeded private sources are flagged; seeded shared versions are clean', async () => {
    const src = await db.select().from(schema.contributions).where(eq(schema.contributions.sharingChoice, 'community'));
    for (const id of ['con_seed_season_nw', 'con_seed_season_hb', 'con_seed_season_at']) {
      const c = src.find((x) => x.id === id)!;
      expect(scanFields({ t: c.title, o: c.observation }).length, id).toBeGreaterThan(0);
      expect(c.sensitiveFlags!.length, id).toBeGreaterThan(0);
    }
    for (const s of await db.select().from(schema.sharedContributions)) expect(scanFields({ t: s.title, s: s.summary, i: s.industry, r: s.region, p: s.periodLabel }), s.id).toEqual([]);
  });
});
