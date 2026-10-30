import { randomBytes } from 'node:crypto';

/** Opaque, URL-safe id with an optional prefix, e.g. newId('shr') -> shr_9f2k... */
export function newId(prefix = ''): string {
  const body = randomBytes(12).toString('base64url').replace(/[-_]/g, 'x').toLowerCase();
  return prefix ? `${prefix}_${body}` : body;
}
