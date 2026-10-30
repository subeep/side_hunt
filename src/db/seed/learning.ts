import type { Db } from '../index';

/** Owned by the learning feature agent. Must be idempotent (fixed ids, onConflictDoNothing). Synthetic data only. */
export async function seedLearning(_db: Db) {}
