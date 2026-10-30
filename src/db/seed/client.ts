import type { Db } from '../index';

/** Owned by the client feature agent. Must be idempotent (fixed ids, onConflictDoNothing). Synthetic data only. */
export async function seedClient(_db: Db) {}
