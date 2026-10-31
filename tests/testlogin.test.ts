import { describe, expect, it } from 'vitest';
import { verifyTestPassword, TEST_PASSWORD } from '@/lib/auth/testlogin';
import { USER } from '@/db/seed/core';

describe('hardcoded test login', () => {
  it('accepts a seeded persona with the test password', async () => {
    expect(await verifyTestPassword('admin@azentio.com', TEST_PASSWORD, '1.1.1.1')).toBe(USER.admin);
  });
  it('rejects wrong password, unknown and non-persona emails', async () => {
    expect(await verifyTestPassword('admin@azentio.com', 'nope', '1.1.1.2')).toBeNull();
    expect(await verifyTestPassword('someone@gmail.com', TEST_PASSWORD, '1.1.1.3')).toBeNull();
    expect(await verifyTestPassword('random@gmail.example', TEST_PASSWORD, '1.1.1.4')).toBeNull();
  });
});
