import { beforeAll, describe, expect, it } from 'vitest';
import { as, USER } from './helpers/principals';
import { makeShared } from './helpers/shared';
import { addComment, listComments } from '@/lib/insights/engage';

// SECURITY REVIEW (insights): comment authors are shown to OTHER tenants by their real display name.
let id: string;
beforeAll(async () => {
  id = await makeShared({ org: 'org_rs1', title: 'Heron comment visibility check', summary: 'Heron comment visibility check text for review.' });
});

describe('review: comment author identity', () => {
  it('another organisation must not learn a commenter\'s real name (which identifies person and employer)', async () => {
    await addComment(await as(USER.nwMember), id, 'We have seen the same pattern in our own portfolio.');
    const seenByHarbor = await listComments(await as(USER.hbMember), id);
    const json = JSON.stringify(seenByHarbor);
    expect(json).not.toContain('Noah Northwind');
    expect(json).not.toMatch(/Northwind/i);
  });
});
