import type { Db } from '../index';

/** Owned by the employee feature agent. Must be idempotent (fixed ids, onConflictDoNothing). Synthetic data only. */
export async function seedEmployee(_db: Db) {}
