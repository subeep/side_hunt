import type { Db } from '../index';

/** Owned by the insights feature agent. Must be idempotent (fixed ids, onConflictDoNothing). Synthetic data only. */
export async function seedInsights(_db: Db) {}
