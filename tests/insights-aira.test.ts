import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { as, USER } from './helpers/principals';
import { makeShared, markWithdrawnOnly } from './helpers/shared';
import { db, schema } from '@/db';
import { airaRateAllowed, askAira, AIRA_STATEMENT, extractiveAnswer, verifyModelAnswer, type AiraResult, type ModelFn } from '@/lib/insights/aira';

let s1: string, s2: string, s3: string, solo: string;
const ok = (r: Awaited<ReturnType<typeof askAira>>): AiraResult => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r;
};

beforeAll(async () => {
  s1 = await makeShared({ org: 'org_ai1', title: 'Pelican estuary tidal cash flow', summary: 'Pelican estuary tidal cash flow is treated inconsistently across applications. Reviewers apply different rules.', offering: 'ai-a', period: 'Q1 2026' });
  s2 = await makeShared({ org: 'org_ai2', title: 'Pelican estuary affordability', summary: 'Tidal swings in pelican estuary businesses distort affordability comparisons.', offering: 'ai-a', period: 'Q2 2026' });
  s3 = await makeShared({ org: 'org_ai3', title: 'Pelican estuary receipts', summary: 'Pelican estuary receipts arrive in tidal bursts, which flat cash flow models miss.', offering: 'ai-a', period: 'Q2 2026' });
  solo = await makeShared({ org: 'org_ai9', title: 'Gannet single organisation note', summary: 'Gannet cliffside validation needs clearer exception messages.', offering: 'ai-b' });
});

describe('verifyModelAnswer', () => {
  const src = [
    { ref: 'S1', title: 'Pelican seasonal cash flow', text: 'Pelican seasonal cash flow is treated inconsistently across applications.' },
    { ref: 'S2', title: 'Receipts', text: 'Receipts arrive in bursts which seasonal models miss.' },
  ];
  it('keeps grounded cited sentences and DROPS uncited, mis-cited and ungrounded ones', () => {
    const raw = [
      'Seasonal cash flow is treated inconsistently across applications [S1].',
      'Receipts arrive in bursts that seasonal models miss. [S2]',
      'Everyone agrees this is the biggest issue in the market.',
      'Seasonal cash flow is treated inconsistently [S7].',
      'Seasonal cash flow is inconsistent [S1][S9].',
      'The weather is nice today [S1].',
    ].join('\n');
    const v = verifyModelAnswer(raw, src);
    expect(v.sentences.map((s) => s.cites)).toEqual([['S1'], ['S2']]);
    expect(v.dropped.map((d) => d.reason).sort()).toEqual(['miscited', 'miscited', 'uncited', 'ungrounded']);
    expect(JSON.stringify(v.sentences)).not.toMatch(/biggest issue|S7|S9|weather/);
  });
  it('treats NO_ANSWER and prose without citations as nothing verified', () => {
    expect(verifyModelAnswer('NO_ANSWER', src).sentences).toEqual([]);
  });
  it('extractive fallback cites its sources', () => {
    const out = extractiveAnswer('seasonal cash flow', src.map((s) => ({ ...s, id: s.ref, href: null, kind: 'contribution', meta: null })));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.cites.length === 1)).toBe(true);
  });
});

describe('portal AIRA pipeline', () => {
  it('retrieves first, passes ONLY retrieved approved text to the model, verifies citations and logs cited ids only', async () => {
    let received: Parameters<ModelFn>[0] | null = null;
    const model: ModelFn = async (input) => {
      received = input;
      return 'Pelican estuary tidal cash flow is treated inconsistently across applications [S1]. Tidal swings in pelican estuary businesses distort affordability comparisons [S2]. Ninety percent of banks agree [S1]. Invented claim about pelican estuary cash [S8].';
    };
    const p = await as(USER.nwMember);
    const r = ok(await askAira(p, { question: 'How is pelican estuary tidal cash flow treated?', scope: 'portal' }, { model }));
    // model input: only approved text, no ids, no org data, no private source
    const sent = JSON.stringify(received);
    expect(sent).toContain('Pelican');
    expect(sent).not.toMatch(/org_ai|con_t_|PRIVATE|Gannet|usr_|shr_t/);
    expect(received!.sources.slice(0, 3).map((s) => s.title).sort()).toEqual(['Pelican estuary affordability', 'Pelican estuary receipts', 'Pelican estuary tidal cash flow']);
    expect(received!.sources.map((s) => s.ref)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5'].slice(0, received!.sources.length));
    // answer: invented / mis-cited sentences dropped
    expect(r.mode).toBe('model');
    expect(r.dropped).toBe(2);
    expect(r.sentences.map((s) => s.text).join(' ')).not.toMatch(/Ninety|Invented/);
    expect(r.sentences.every((s) => s.cites.length > 0)).toBe(true);
    // citations are approved contributions; distinct-org count / suppression + small-sample + statement present
    expect(r.sources.every((x) => [s1, s2, s3].includes(x.id))).toBe(true);
    expect(r.statement).toBe(AIRA_STATEMENT);
    expect(r.statement).toMatch(/never retrains or changes any model/);
    expect(r.cohort).toBeTruthy();
    expect(r.cohort!.suppressed).toBe(true); // only 2 organisations were cited -> withheld
    expect(r.cohort!.reason).toMatch(/Fewer than 3 organisations; count withheld/);
    expect(r.smallSample).toMatch(/Small sample/);
    expect(JSON.stringify(r)).not.toMatch(/org_ai/);
    const log = await db.select().from(schema.airaQueries).where(eq(schema.airaQueries.userId, USER.nwMember));
    const last = log[log.length - 1];
    expect(last.citedSharedIds.sort()).toEqual(r.sources.map((x) => x.id).sort());
    expect(last.surface).toBe('portal');
    expect(last.mode).toBe('model');
  });
  it('falls back to the extractive summary when every model sentence is unverifiable, or the model throws', async () => {
    const p = await as(USER.hbMember);
    const bad = ok(await askAira(p, { question: 'pelican estuary tidal cash flow', scope: 'portal' }, { model: async () => 'No citations anywhere in this answer. [S42]' }));
    expect(bad.mode).toBe('extractive');
    expect(bad.sentences.length).toBeGreaterThan(0);
    expect(bad.notes.join(' ')).toMatch(/could not be verified/);
    const boom = ok(await askAira(p, { question: 'pelican estuary tidal cash flow', scope: 'portal' }, { model: async () => { throw new Error('network'); } }));
    expect(boom.mode).toBe('extractive');
    expect(boom.sentences.length).toBeGreaterThan(0);
  });
  it('shows the distinct-org count only when the cohort is large enough', async () => {
    const r = ok(await askAira(await as(USER.atMember), { question: 'pelican estuary tidal receipts affordability', scope: 'portal' }, { model: async () => 'Pelican estuary tidal cash flow is treated inconsistently across applications [S1]. Tidal swings in pelican estuary businesses distort affordability comparisons [S2]. Pelican estuary receipts arrive in tidal bursts that flat cash flow models miss [S3].' }));
    expect(r.sources).toHaveLength(3);
    expect(r.cohort).toMatchObject({ suppressed: false, orgs: 3 });
    expect(r.smallSample).toBeNull();
  });
  it('single-organisation evidence is shown with a suppression notice and small-sample warning', async () => {
    const r = ok(await askAira(await as(USER.nwAdmin), { question: 'gannet cliffside validation exception messages', scope: 'portal' }));
    expect(r.sources.map((x) => x.id)).toEqual([solo]);
    expect(r.cohort!.suppressed).toBe(true);
    expect(r.smallSample).toBeTruthy();
  });
  it('a withdrawn item is never retrieved: ask, withdraw, ask again', async () => {
    const id = await makeShared({ org: 'org_ai7', title: 'Heron withdrawable insight', summary: 'Heron wetland withdrawable insight about collateral valuation timing.', offering: 'ai-w' });
    const p = await as(USER.nwMember);
    const q = { question: 'heron wetland collateral valuation', scope: 'portal' as const };
    expect(ok(await askAira(p, q)).sources.map((s) => s.id)).toEqual([id]);
    await markWithdrawnOnly(id); // retrieval cache NOT purged
    const after = ok(await askAira(p, q));
    expect(after.sources).toEqual([]);
    expect(after.sentences).toEqual([]);
    expect(JSON.stringify(after)).not.toContain('Heron');
  });
  it('is denied for anyone who cannot see the feed, and logs the denial', async () => {
    for (const p of [null, await as(USER.employee), await as(USER.multi)]) {
      const r = await askAira(p, { question: 'pelican estuary tidal cash flow', scope: 'portal' });
      expect(r).toMatchObject({ ok: false, error: 'forbidden' });
    }
    expect(await askAira(await as(USER.nwMember), { question: 'x', scope: 'portal' })).toMatchObject({ ok: false, error: 'invalid' });
    const denies = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, 'aira.ask'));
    expect(denies.some((d) => d.outcome === 'deny')).toBe(true);
  });
  it('rate limits per user', async () => {
    let allowed = 0;
    for (let i = 0; i < 25; i++) if (await airaRateAllowed('portal', 'usr_rate_test')) allowed++;
    expect(allowed).toBe(20);
    expect(await airaRateAllowed('portal', 'usr_other_user')).toBe(true);
  });
});

describe('public AIRA scope', () => {
  it('retrieves ONLY public products, public published content and public media titles', async () => {
    await db.insert(schema.contentItems).values([
      { kind: 'perspective', slug: 'cormorant-public', title: 'Cormorant public perspective', summary: 'Cormorant explainable credit decisions for lenders.', status: 'published', audienceKind: 'public' },
      { kind: 'perspective', slug: 'cormorant-draft', title: 'Cormorant draft perspective', summary: 'Cormorant unpublished draft.', status: 'draft', audienceKind: 'public' },
      { kind: 'page', slug: 'cormorant-emp', title: 'Cormorant employee page', summary: 'Cormorant employee-only roadmap.', status: 'published', audienceKind: 'employees' },
      { kind: 'resource', slug: 'cormorant-client', title: 'Cormorant client resource', summary: 'Cormorant client-only resource.', status: 'published', audienceKind: 'org', audienceOrgId: 'org_northwind' },
      { kind: 'lab', slug: 'cormorant-null', title: 'Cormorant missing audience', summary: 'Cormorant no audience metadata.', status: 'published' },
    ]);
    await db.insert(schema.media).values([
      { title: 'Cormorant public video', kind: 'video', mime: 'video/mp4', data: 'x', status: 'published', audienceKind: 'public', description: 'SECRET-DESCRIPTION-PUBLIC' },
      { title: 'Cormorant internal recording', kind: 'video', mime: 'video/mp4', data: 'x', status: 'published', audienceKind: 'employees' },
    ]);
    await makeShared({ org: 'org_aip', title: 'Cormorant community observation', summary: 'Cormorant community-only insight.', offering: 'ai-p' });
    let received = '';
    const r = ok(await askAira(null, { question: 'cormorant explainable credit decisions', scope: 'public' }, { model: async (i) => ((received = JSON.stringify(i)), 'Cormorant explainable credit decisions for lenders [S1].') }));
    expect(r.scope).toBe('public');
    expect(r.cohort).toBeNull();
    const titles = r.sources.map((s) => s.title);
    expect(titles).toContain('Cormorant public perspective');
    for (const forbidden of ['draft', 'employee', 'client resource', 'missing audience', 'internal recording', 'community observation']) expect(received.toLowerCase()).not.toContain(forbidden);
    expect(received).not.toContain('SECRET-DESCRIPTION-PUBLIC'); // media: titles only
    const m = ok(await askAira(null, { question: 'cormorant video', scope: 'public' }));
    expect(m.sources.map((s) => s.title).join('|')).toContain('Cormorant public video');
    expect(m.sources.map((s) => s.title).join('|')).not.toContain('internal');
    const prod = ok(await askAira(null, { question: 'SME credit decisioning workbench', scope: 'public' }));
    expect(prod.sources.map((x) => x.id)).toContain('product:sme-credit-decisioning');
    const log = await db.select().from(schema.airaQueries).where(eq(schema.airaQueries.surface, 'public'));
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((l) => l.citedSharedIds.length === 0 && l.userId === null)).toBe(true);
  });
  it('even a signed-in community member asking in public scope never gets shared contributions', async () => {
    const r = ok(await askAira(await as(USER.nwMember), { question: 'pelican estuary tidal cash flow', scope: 'public' }));
    expect(r.sources.filter((x) => x.kind === 'contribution' || x.id.startsWith('shr_'))).toEqual([]);
    expect(r.sources.every((x) => /^(product|content|media):/.test(x.id))).toBe(true);
    expect(r.statement).toMatch(/public website content only/);
  });
});

describe('Claude call (fetch, no SDK)', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ANTHROPIC_API_KEY; delete process.env.AIRA_MODEL; });
  const stub = (body: unknown, ok = true) => {
    const f = vi.fn(async () => ({ ok, status: ok ? 200 : 529, json: async () => body }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    return f;
  };
  it('sends only retrieved approved text, uses AIRA_MODEL (default claude-opus-5-5), and verifies the reply', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const f = stub({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Pelican estuary tidal cash flow is treated inconsistently across applications [S1]. Made up claim with a bad cite [S9].' }] });
    const r = ok(await askAira(await as(USER.nwMember), { question: 'pelican estuary tidal cash flow', scope: 'portal' }));
    expect(r.mode).toBe('model');
    expect(r.dropped).toBe(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-opus-5-5');
    expect(body).not.toHaveProperty('temperature');
    expect(JSON.stringify(body)).not.toMatch(/org_ai|con_t_|PRIVATE|usr_|nwMember|Noah/);
    expect(JSON.stringify(body)).toContain('Pelican estuary tidal cash flow');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
    process.env.AIRA_MODEL = 'claude-sonnet-5-5';
    await askAira(await as(USER.nwMember), { question: 'pelican estuary tidal cash flow', scope: 'portal' });
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).model).toBe('claude-sonnet-5-5');
  });
  it('falls back to the extractive summary on API errors and refusals', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    stub({}, false);
    const a = ok(await askAira(await as(USER.hbMember), { question: 'pelican estuary tidal cash flow', scope: 'portal' }));
    expect(a.mode).toBe('extractive');
    expect(a.sentences.length).toBeGreaterThan(0);
    stub({ stop_reason: 'refusal', content: [] });
    expect(ok(await askAira(await as(USER.hbMember), { question: 'pelican estuary tidal cash flow', scope: 'portal' })).mode).toBe('extractive');
  });
  it('makes no network call when there is no API key', async () => {
    const f = stub({});
    ok(await askAira(await as(USER.hbMember), { question: 'pelican estuary tidal cash flow', scope: 'portal' }));
    expect(f).not.toHaveBeenCalled();
  });
});
