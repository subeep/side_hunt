import type { Db } from '../index';

/** Owned by the public feature agent. Must be idempotent (fixed ids, onConflictDoNothing). Synthetic data only. */
export async function seedPublic(_db: Db) {}
