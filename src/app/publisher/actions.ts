'use server';
import { revalidatePath } from 'next/cache';
import { requireGrant } from '@/lib/authz/guards';
import { saveBanner, saveContent, setContentStatus, setMediaAudience, setMediaStatus, type PubState, type Result } from '@/lib/public/publisher';

// Every action: (1) guard for the SPECIFIC grant (redirect/403), (2) the lib function re-checks it and validates with zod, (3) audits.
const done = (r: Result<object>, ok: string, paths: string[]): PubState => {
  if (r.ok) paths.forEach((x) => revalidatePath(x));
  return r.ok ? { ok: true, message: ok } : { ok: false, message: r.error, errors: r.errors };
};

export async function saveBannerAction(_prev: PubState, fd: FormData): Promise<PubState> {
  const p = await requireGrant('content_publisher');
  return done(await saveBanner(p, Object.fromEntries(fd)), 'Banner saved.', ['/publisher/banners', '/']);
}
export async function bannerStatusAction(_prev: PubState, fd: FormData): Promise<PubState> {
  const p = await requireGrant('content_publisher');
  return done(await setContentStatus(p, 'banner', String(fd.get('id') ?? ''), fd.get('status')), 'Status updated.', ['/publisher/banners', '/', '/hackathon']);
}
export async function saveContentAction(_prev: PubState, fd: FormData): Promise<PubState> {
  const p = await requireGrant('content_publisher');
  return done(await saveContent(p, Object.fromEntries(fd)), 'Content saved.', ['/publisher/content', '/perspectives', '/lab']);
}
export async function contentStatusAction(_prev: PubState, fd: FormData): Promise<PubState> {
  const p = await requireGrant('content_publisher');
  return done(await setContentStatus(p, 'content', String(fd.get('id') ?? ''), fd.get('status')), 'Status updated.', ['/publisher/content', '/perspectives', '/lab']);
}
export async function mediaAudienceAction(_prev: PubState, fd: FormData): Promise<PubState> {
  const p = await requireGrant('video_publisher');
  return done(await setMediaAudience(p, Object.fromEntries(fd)), 'Audience updated.', ['/publisher/media', '/media']);
}
export async function mediaStatusAction(_prev: PubState, fd: FormData): Promise<PubState> {
  const p = await requireGrant('video_publisher');
  return done(await setMediaStatus(p, String(fd.get('id') ?? ''), fd.get('status')), 'Status updated.', ['/publisher/media', '/media', '/']);
}
