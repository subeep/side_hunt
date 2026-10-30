import { NextResponse } from 'next/server';

/** CSRF defence for cookie-authenticated route handlers: mutating requests must be same-origin. */
export function sameOrigin(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const jsonError = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export const forbiddenJson = () => jsonError(403, 'forbidden');
export const unauthorizedJson = () => jsonError(401, 'unauthenticated');
/** 404 (not 403) for resources the caller must not even know exist. */
export const notFoundJson = () => jsonError(404, 'not_found');
export const clientIp = (h: Headers) => (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
