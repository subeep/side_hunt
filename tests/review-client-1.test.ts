import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { newId } from '@/db/ids';
import { as } from './helpers/principals';
import { makeOrg } from './client-fixtures';
import * as A from '@/lib/client/admin';
import { acceptInviteWithTerms } from '@/lib/client/invite';

// Security review (client area): invitation authority is checked only when the invitation is CREATED.
// Removing or demoting the administrator who issued an invitation leaves that invitation live, so a removed
// (e.g. compromised / rogue) administrator's pending "client_admin" invitation can still be redeemed afterwards.
const BASE = 'http://portal.test';

describe('invitations issued by an administrator who is later removed', () => {
  it('must not be redeemable once the issuing administrator has lost their membership', async () => {
    const o = await makeOrg({ admins: 2, members: 0 });
    const rogue = await o.as(o.admins[0].userId);
    const res = await A.inviteMember(rogue, { email: 'accomplice@evil.example', role: 'client_admin' }, BASE);
    expect(res.ok).toBe(true);
    const token = (res as { link: string }).link.split('/invite/')[1];

    // The other administrator removes the rogue admin.
    const boss = await o.as(o.admins[1].userId);
    expect((await A.revokeMember(boss, { membershipId: o.admins[0].membershipId })).ok).toBe(true);

    // The accomplice signs in (email-code flow) and redeems the still-pending invitation.
    const uid = newId('usr');
    await db.insert(schema.users).values({ id: uid, email: 'accomplice@evil.example', name: 'Accomplice' });
    const accept = await acceptInviteWithTerms(await as(uid), token, true);

    expect(accept.ok).toBe(false); // FAILS today: ok === true and the accomplice is now client_admin of the org
    const ms = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, uid));
    expect(ms.filter((m) => m.status === 'active')).toHaveLength(0); // FAILS today
  });
});

describe('invitations of a demoted administrator', () => {
  it('are revoked when the issuer is demoted, and the issuer check holds even if revocation is bypassed', async () => {
    const o = await makeOrg({ admins: 2, members: 0 });
    const issuer = await o.as(o.admins[0].userId);
    const res = await A.inviteMember(issuer, { email: 'late@evil.example', role: 'client_admin' }, BASE);
    const token = (res as { link: string }).link.split('/invite/')[1];
    const boss = await o.as(o.admins[1].userId);
    expect((await A.changeMemberRole(boss, { membershipId: o.admins[0].membershipId, role: 'client_member' })).ok).toBe(true);
    const uid = newId('usr');
    await db.insert(schema.users).values({ id: uid, email: 'late@evil.example', name: 'Late' });
    expect((await acceptInviteWithTerms(await as(uid), token, true)).ok).toBe(false);
  });

  it('are refused at redemption when the issuer lost the role by another route (no revocation ran)', async () => {
    const o = await makeOrg({ admins: 2, members: 0 });
    const issuer = await o.as(o.admins[0].userId);
    const token = ((await A.inviteMember(issuer, { email: 'direct@evil.example', role: 'client_member' }, BASE)) as { link: string }).link.split('/invite/')[1];
    await db.update(schema.memberships).set({ status: 'revoked' }).where(eq(schema.memberships.id, o.admins[0].membershipId));
    const uid = newId('usr');
    await db.insert(schema.users).values({ id: uid, email: 'direct@evil.example', name: 'Direct' });
    expect((await acceptInviteWithTerms(await as(uid), token, true)).ok).toBe(false);
  });

  it('still work while the issuing administrator is an active administrator', async () => {
    const o = await makeOrg({ admins: 1, members: 0 });
    const token = ((await A.inviteMember(await o.as(o.admins[0].userId), { email: 'fine@ok.example', role: 'client_member' }, BASE)) as { link: string }).link.split('/invite/')[1];
    const uid = newId('usr');
    await db.insert(schema.users).values({ id: uid, email: 'fine@ok.example', name: 'Fine' });
    expect((await acceptInviteWithTerms(await as(uid), token, true)).ok).toBe(true);
  });
});
