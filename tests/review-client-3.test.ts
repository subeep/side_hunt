import { describe, expect, it } from 'vitest';
import { USER, ORG } from '@/db/seed/core';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { runScenario } from '@/lib/scenarios';
import { as } from './helpers/principals';
import { clientTermsPending } from '@/lib/client/guard';

describe('terms gate applies to learning/insights routes (shared guard)', () => {
  it('reports pending for the unacknowledged client and not for acknowledged clients or staff', async () => {
    expect(await clientTermsPending(await as(USER.atMember))).toBe(true);
    expect(await clientTermsPending(await as(USER.nwMember))).toBe(false);
    expect(await clientTermsPending(await as(USER.admin))).toBe(false);
  });
});

describe('seeded sandbox runs match the real engine', () => {
  it('re-running the stored inputs reproduces the stored output', async () => {
    const rows = await db.select().from(schema.playgroundRuns).where(eq(schema.playgroundRuns.mode, 'client'));
    const seeded = rows.filter((r) => r.id.startsWith('run_cl_'));
    expect(seeded.length).toBe(4);
    for (const r of seeded) {
      const again = runScenario(r.scenarioSlug, r.inputs as Record<string, unknown>);
      expect(r.output, r.id).toEqual(JSON.parse(JSON.stringify(again)));
    }
    expect(ORG.northwind).toBeTruthy();
  });
});
