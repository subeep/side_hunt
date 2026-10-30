import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getMediaDetailForPrincipal, getMediaForPrincipal, listMediaForPrincipal, mediaDecision, publicMediaIds } from '@/lib/public/media';
import { mediaResponse } from '@/lib/public/media-response';
import { ALL_MEDIA, MEDIA, ORG, USER, as, ensurePublicSeed } from './helpers/public';
import type { Principal } from '@/lib/auth/principal';

const PUBLIC4 = [MEDIA.pubCredit, MEDIA.pubSme, MEDIA.pubPortfolio, MEDIA.pubRiva];

beforeAll(ensurePublicSeed);

/** Expected readable ids per principal (poster + data + detail all follow the same rule). */
const matrix: [string, () => Promise<Principal | null>, string[]][] = [
  ['anonymous', async () => null, PUBLIC4],
  ['outsider (no membership)', () => as(USER.outsider), PUBLIC4],
  ['employee (no grants)', () => as(USER.employee), [...PUBLIC4, MEDIA.empRecording]],
  ['moderator (employee, no video grant)', () => as(USER.moderator), [...PUBLIC4, MEDIA.empRecording]],
  ['portal admin', () => as(USER.admin), [...PUBLIC4, MEDIA.empRecording]],
  ['video publisher (also sees drafts)', () => as(USER.publisher), [...PUBLIC4, MEDIA.empRecording, MEDIA.draftPublic]],
  ['Northwind member', () => as(USER.nwMember), [...PUBLIC4, MEDIA.nwPrivate]],
  ['Northwind admin', () => as(USER.nwAdmin), [...PUBLIC4, MEDIA.nwPrivate]],
  ['Harbor member (entitled to riva)', () => as(USER.hbMember), [...PUBLIC4, MEDIA.rivaDemo]],
  ['Atlas member', () => as(USER.atMember), PUBLIC4],
  ['multi-membership, no active workspace', () => as(USER.multi), PUBLIC4],
  ['multi-membership, active Northwind', () => as(USER.multi, ORG.northwind), [...PUBLIC4, MEDIA.nwPrivate]],
  ['multi-membership, active Harbor', () => as(USER.multi, ORG.harbor), [...PUBLIC4, MEDIA.rivaDemo]],
  ['multi-membership, bogus active org (Atlas)', () => as(USER.multi, ORG.atlas), PUBLIC4],
];

describe('media access matrix (every seeded id, every persona)', () => {
  for (const [label, getP, allowed] of matrix) {
    it(label, async () => {
      const p = await getP();
      for (const id of ALL_MEDIA) {
        const want = allowed.includes(id);
        expect(!!(await getMediaForPrincipal(id, p, 'data')), `${label} data ${id}`).toBe(want);
        expect(!!(await getMediaForPrincipal(id, p, 'poster')), `${label} poster ${id}`).toBe(want);
        expect(!!(await getMediaDetailForPrincipal(id, p)), `${label} detail ${id}`).toBe(want);
      }
      // The gallery (SQL twin) lists exactly the published readable items: same rule for lists as for objects.
      const listed = (await listMediaForPrincipal(p)).map((m) => m.id).filter((id) => ALL_MEDIA.includes(id as never)).sort(); // other areas seed their own media too
      expect(listed).toEqual(allowed.filter((id) => id !== MEDIA.draftPublic).sort());
    });
  }

  it('missing audience metadata is denied to everyone, including the video publisher', async () => {
    for (const p of [null, await as(USER.publisher), await as(USER.admin), await as(USER.nwAdmin)]) {
      expect(await getMediaForPrincipal(MEDIA.noAudience, p)).toBeNull();
    }
    const [row] = await db.select().from(schema.media).where(eq(schema.media.id, MEDIA.noAudience));
    expect(row.audienceKind).toBeNull();
    expect(mediaDecision(row, await as(USER.publisher))).toBe('no_audience');
  });

  it('draft is denied to non-publishers even when its audience is public', async () => {
    expect(mediaDecision({ status: 'draft', audienceKind: 'public', audienceOrgId: null, audienceProduct: null }, await as(USER.moderator))).toBe('draft');
    expect(mediaDecision({ status: 'draft', audienceKind: 'public', audienceOrgId: null, audienceProduct: null }, await as(USER.publisher))).toBe('ok');
  });

  it('a publisher grant does not bypass the audience rule (no tenant or entitlement access)', async () => {
    const pub = await as(USER.publisher);
    expect(await getMediaForPrincipal(MEDIA.nwPrivate, pub)).toBeNull();
    expect(await getMediaForPrincipal(MEDIA.rivaDemo, pub)).toBeNull();
  });

  it('unknown / malformed ids are not found and never throw', async () => {
    for (const id of ['med_nope', '', '../etc/passwd', "x'; drop table media;--", 'a'.repeat(200)]) expect(await getMediaForPrincipal(id, await as(USER.publisher))).toBeNull();
  });

  it('writes an audit deny event for signed-in probes of an existing but forbidden object (not for missing ones)', async () => {
    const hb = await as(USER.hbMember);
    await getMediaForPrincipal(MEDIA.nwPrivate, hb);
    await getMediaForPrincipal('med_does_not_exist', hb);
    const rows = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, 'media.deny'), eq(schema.auditEvents.actorId, USER.hbMember)));
    expect(rows.some((r) => r.resourceId === MEDIA.nwPrivate && r.outcome === 'deny')).toBe(true);
    expect(rows.some((r) => r.resourceId === 'med_does_not_exist')).toBe(false);
  });

  it('public-recording helper only vouches for anonymously viewable media', async () => {
    const ok = await publicMediaIds([MEDIA.pubRiva, MEDIA.empRecording, MEDIA.draftPublic, MEDIA.noAudience, MEDIA.nwPrivate]);
    expect([...ok]).toEqual([MEDIA.pubRiva]);
  });
});

describe('media route response (headers + 404 semantics)', () => {
  it('public media: 200, svg content type, public cache, nosniff, locked-down CSP', async () => {
    const r = await mediaResponse(MEDIA.pubSme, null, null);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('image/svg+xml');
    expect(r.headers.get('cache-control')).toBe('public, max-age=300');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(await r.text()).toContain('<svg');
  });
  it('poster variant works and follows the same rule', async () => {
    expect((await mediaResponse(MEDIA.pubSme, null, 'poster')).status).toBe(200);
    expect((await mediaResponse(MEDIA.empRecording, null, 'poster')).status).toBe(404);
  });
  it('non-public media (even when permitted) is private, no-store', async () => {
    for (const [id, p] of [[MEDIA.empRecording, await as(USER.employee)], [MEDIA.nwPrivate, await as(USER.nwMember)], [MEDIA.rivaDemo, await as(USER.hbMember)]] as const) {
      const r = await mediaResponse(id, p, null);
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('private, no-store');
      expect(r.headers.get('content-security-policy')).toContain('sandbox');
    }
  });
  it('a publisher previewing a public DRAFT gets it, but never cacheable', async () => {
    const r = await mediaResponse(MEDIA.draftPublic, await as(USER.publisher), null);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });
  it('denied, draft, missing-audience and nonexistent are all the SAME 404 (never 403)', async () => {
    const cases = [
      await mediaResponse(MEDIA.nwPrivate, null, null),
      await mediaResponse(MEDIA.nwPrivate, await as(USER.hbMember), null),
      await mediaResponse(MEDIA.draftPublic, await as(USER.moderator), null),
      await mediaResponse(MEDIA.noAudience, await as(USER.publisher), null),
      await mediaResponse('med_missing', null, null),
      await mediaResponse('../x', null, null),
    ];
    const bodies = await Promise.all(cases.map((c) => c.text()));
    for (const c of cases) {
      expect(c.status).toBe(404);
      expect(c.headers.get('cache-control')).toBe('private, no-store');
      expect(c.headers.get('x-content-type-options')).toBe('nosniff');
    }
    expect(new Set(bodies).size).toBe(1);
  });
  it('non-image mime stored in the DB is downgraded to text/plain (no active content types)', async () => {
    await db.insert(schema.media).values({ id: 'med_test_html', title: 't', kind: 'document', mime: 'text/html', data: '<script>alert(1)</script>', status: 'published', audienceKind: 'public' }).onConflictDoNothing();
    const r = await mediaResponse('med_test_html', null, null);
    expect(r.headers.get('content-type')).toContain('text/plain');
  });
});
