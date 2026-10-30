import { describe, expect, it } from 'vitest';
import { plainLanguageProblem } from '@/lib/insights/plain';

// SECURITY REVIEW (insights): the audience-appropriate gate for client-visible idea text misses common delivery commitments / identifiers.
describe('review: plain-language gate', () => {
  it.each([
    'This improvement is scheduled for March 2027 and is on track.',
    'We will have this available in version 4.2 next month.',
    'Release date is the 14th of January for all customers.',
    'Nia Northwind raised this and we are fixing it for her team.',
  ])('rejects %s', async (t) => {
    expect(await plainLanguageProblem(t)).not.toBeNull();
  });
});
