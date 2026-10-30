import { describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { LEAD_LIMITS, leadFormState, submitLead } from '@/lib/public/leads';
import { demoSchema, hackathonSchema, leadRawFromForm } from '@/lib/public/lead-schema';

const demo = (o: Record<string, unknown> = {}) => ({ name: 'Dana Test', email: 'Dana@Example.COM', company: 'Example Bank', message: 'We want to simulate a cut-off policy change.', consent: true, ...o });
const total = async () => (await db.select({ n: count() }).from(schema.leads))[0].n;
let ipSeq = 0;
const freshIp = () => `10.0.0.${++ipSeq}`;

describe('lead validation (server side, authoritative)', () => {
  it('stores a valid demo request: normalised email, consent time recorded, marketing opt-in separate and off by default', async () => {
    const r = await submitLead('demo', demo({ interests: ['riva'] }), freshIp());
    expect(r).toEqual({ ok: true });
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.email, 'dana@example.com'));
    expect(row.kind).toBe('demo');
    expect(row.consentAt).toBeInstanceOf(Date);
    expect(row.marketingOptIn).toBe(false);
    expect(row.interests).toEqual(['riva']);
    expect(row.status).toBe('new');
  });
  it('rejects missing consent, bad email, short/long message, missing org, unknown interest', async () => {
    const bad: [Record<string, unknown>, string][] = [
      [demo({ consent: false }), 'consent'],
      [demo({ email: 'not-an-email' }), 'email'],
      [demo({ message: 'short' }), 'message'],
      [demo({ message: 'x'.repeat(2001) }), 'message'],
      [demo({ company: '' }), 'company'],
      [demo({ name: 'A' }), 'name'],
      [demo({ interests: ['not-a-product'] }), 'interests'],
    ];
    const before = await total();
    for (const [raw, field] of bad) {
      const r = await submitLead('demo', raw, freshIp());
      expect(r.ok, field).toBe(false);
      if (!r.ok) expect(Object.keys(r.errors), field).toContain(field);
    }
    expect(await total()).toBe(before); // nothing stored
  });
  it('hackathon interest: company/message optional, tracks restricted to the known list', async () => {
    expect((await submitLead('hackathon', { name: 'Hal Hack', email: 'hal@example.com', consent: true }, freshIp())).ok).toBe(true);
    expect((await submitLead('hackathon', { name: 'Hal Hack', email: 'hal2@example.com', consent: true, interests: ['Analytics & insights'] }, freshIp())).ok).toBe(true);
    expect((await submitLead('hackathon', { name: 'Hal Hack', email: 'hal3@example.com', consent: true, interests: ['<script>'] }, freshIp())).ok).toBe(false);
    expect((await submitLead('hackathon', { name: 'Hal Hack', email: 'hal4@example.com', consent: false }, freshIp())).ok).toBe(false);
  });
  it('the same zod schemas drive the client hints (single source of truth)', () => {
    expect(demoSchema.shape.email.safeParse('nope').success).toBe(false);
    expect(hackathonSchema.shape.company.safeParse('').success).toBe(true);
  });
  it('FormData mapping: checkbox semantics and interests', () => {
    const fd = new FormData();
    fd.set('name', 'N N'); fd.append('interests', 'riva'); fd.append('interests', 'x'); fd.set('consent', 'on');
    const raw = leadRawFromForm(fd);
    expect(raw.consent).toBe(true);
    expect(raw.marketing).toBe(false);
    expect(raw.interests).toEqual(['riva', 'x']);
  });
  it('form state echoes values on error without the honeypot value', async () => {
    const fd = new FormData();
    fd.set('name', 'Echo'); fd.set('email', 'bad'); fd.set('company', 'Co'); fd.set('message', 'long enough message here');
    const s = await leadFormState('demo', fd, freshIp());
    expect(s.status).toBe('error');
    expect(s.values?.name).toBe('Echo');
    expect(JSON.stringify(s)).not.toContain('website');
  });
});

describe('honeypot', () => {
  it('a filled honeypot looks like success to the bot but stores nothing and does not spend rate limit', async () => {
    const before = await total();
    const ip = freshIp();
    for (let i = 0; i < LEAD_LIMITS.perIp.max + 3; i++) expect(await submitLead('demo', demo({ website: 'http://spam.example', email: `bot${i}@example.com` }), ip)).toEqual({ ok: true });
    expect(await total()).toBe(before);
    expect((await submitLead('demo', demo({ email: 'human@example.com' }), ip)).ok).toBe(true); // real user from the same IP still passes
  });
  it('whitespace-only honeypot counts as empty (autofill noise must not drop real people)', async () => {
    const before = await total();
    expect((await submitLead('demo', demo({ website: '   ', email: 'ws@example.com' }), freshIp())).ok).toBe(true);
    expect(await total()).toBe(before + 1);
  });
});

describe('rate limiting', () => {
  it('limits by IP (hashed in the limiter table) and then returns a rate-limited error', async () => {
    const ip = '203.0.113.9';
    const before = await total();
    const results = [];
    for (let i = 0; i < LEAD_LIMITS.perIp.max + 2; i++) results.push(await submitLead('demo', demo({ email: `rl${i}@example.com` }), ip));
    expect(results.slice(0, LEAD_LIMITS.perIp.max).every((r) => r.ok)).toBe(true);
    const blocked = results[LEAD_LIMITS.perIp.max];
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.rateLimited).toBe(true);
    expect(await total()).toBe(before + LEAD_LIMITS.perIp.max);
    const keys = (await db.select().from(schema.rateLimits)).map((r) => r.key).filter((k) => k.startsWith('lead:'));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.includes(ip))).toBe(false); // raw IP never stored
    // a different IP is unaffected
    expect((await submitLead('demo', demo({ email: 'other@example.com' }), '203.0.113.10')).ok).toBe(true);
  });
  it('also limits repeated submissions for one email across IPs', async () => {
    const out = [];
    for (let i = 0; i < LEAD_LIMITS.perEmail.max + 1; i++) out.push(await submitLead('demo', demo({ email: 'same@example.com' }), freshIp()));
    expect(out.slice(0, LEAD_LIMITS.perEmail.max).every((r) => r.ok)).toBe(true);
    const last = out[LEAD_LIMITS.perEmail.max];
    expect(last.ok).toBe(false);
  });
  it('invalid submissions never consume the budget or touch the database', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await submitLead('demo', demo({ email: 'bad' }), ip);
    for (let i = 0; i < LEAD_LIMITS.perIp.max; i++) expect((await submitLead('demo', demo({ email: `ok${i}-${ip}@example.com` }), ip)).ok).toBe(true);
  });
  it('lead creation is audited without personal data', async () => {
    const rows = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'lead.create'));
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/example\.com|Dana/);
  });
});
