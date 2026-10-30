import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { authSecret } from './env';

export const hashToken = (token: string) => createHmac('sha256', authSecret()).update(token).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
export const normaliseEmail = (e: string) => e.trim().toLowerCase();
