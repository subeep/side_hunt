import { beforeAll, describe, expect, it } from 'vitest';
import { getMediaForPrincipal } from '@/lib/public/media';
import { listMediaForManage, setMediaAudience } from '@/lib/public/publisher';
import { MEDIA, USER, as, ensurePublicSeed } from './helpers/public';
import type { Principal } from '@/lib/auth/principal';

// Security review (public area): a video_publisher is an EMPLOYEE grant. Employees have no automatic access to
// client-private material, and the content side of the console already refuses to touch org-audience items.
// The media side does not: it lets a publisher re-point any tenant's private media, then read it.
let publisher: Principal;
beforeAll(async () => {
  await ensurePublicSeed();
  publisher = await as(USER.publisher);
});

describe('video_publisher vs tenant-private media', () => {
  it('cannot read a client-private recording directly (control)', async () => {
    expect(await getMediaForPrincipal(MEDIA.nwPrivate, publisher)).toBeNull();
  });
  it('must not be able to unlock a client-private recording by re-pointing its audience to employees', async () => {
    const r = await setMediaAudience(publisher, { id: MEDIA.nwPrivate, kind: 'employees' });
    expect(r.ok).toBe(false); // FAILS today: ok === true
    const body = await getMediaForPrincipal(MEDIA.nwPrivate, publisher);
    expect(body).toBeNull(); // FAILS today: payload is served to the employee
  });
  it('must not list tenant-private media titles/ids to a publisher', async () => {
    const rows = await listMediaForManage(publisher);
    expect(rows.find((x) => x.id === MEDIA.nwPrivate)).toBeUndefined(); // FAILS today
  });
});
