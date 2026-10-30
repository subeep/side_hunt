import type { Db } from '../index';
import { seedCore } from './core';
import { seedPublic } from './public';
import { seedEmployee } from './employee';
import { seedClient } from './client';
import { seedLearning } from './learning';
import { seedInsights } from './insights';

/**
 * Idempotent (fixed ids + onConflictDoNothing). Order matters: learning before insights.
 * An area seed that throws is logged and skipped so one area cannot take the whole app down while others are in
 * development; set SEED_STRICT=1 (CI / final verification) to make any failure fatal.
 */
export async function seedAll(db: Db) {
  await seedCore(db);
  const steps: [string, (db: Db) => Promise<void>][] = [
    ['public', seedPublic],
    ['employee', seedEmployee],
    ['client', seedClient],
    ['learning', seedLearning],
    ['insights', seedInsights],
  ];
  for (const [name, fn] of steps) {
    try {
      await fn(db);
    } catch (err) {
      if (process.env.SEED_STRICT === '1') throw err;
      console.error(`[seed:${name}] failed (continuing):`, err);
    }
  }
}
