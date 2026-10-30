'use server';
import { revalidatePath } from 'next/cache';
import { requireFeed } from '@/lib/insights/guards';
import { requireUser } from '@/lib/authz/guards';
import { addComment, castVote, deleteSavedSearch, EngageError, moderateComment, queueDigestEmail, removeBookmark, reportComment, saveSearch, setDigest, toggleBookmark } from '@/lib/insights/engage';
import type { ActionState } from '@/lib/insights/state';

const str = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined };
  } catch (e) {
    if (e instanceof EngageError) return { error: e.message };
    throw e;
  }
}

export async function voteAction(_: ActionState, fd: FormData) {
  const p = await requireFeed();
  const sharedId = str(fd, 'sharedId');
  return run(async () => { await castVote(p, sharedId, str(fd, 'vote') || null); revalidatePath(`/learn/feed/${sharedId}`); });
}

export async function bookmarkAction(_: ActionState, fd: FormData) {
  const p = await requireFeed();
  const type = str(fd, 'type'), id = str(fd, 'id');
  return run(async () => { await toggleBookmark(p, type, id); revalidatePath(`/learn/bookmarks`); revalidatePath(type === 'shared' ? `/learn/feed/${id}` : type === 'theme' ? `/learn/themes/${id}` : `/learn/ideas/${id}`); });
}

export async function removeBookmarkAction(_: ActionState, fd: FormData) {
  const p = await requireUser('/learn/bookmarks');
  return run(async () => { await removeBookmark(p, str(fd, 'id')); revalidatePath('/learn/bookmarks'); });
}

export async function commentAction(_: ActionState, fd: FormData) {
  const p = await requireFeed();
  const sharedId = str(fd, 'sharedId');
  return run(async () => { await addComment(p, sharedId, str(fd, 'body')); revalidatePath(`/learn/feed/${sharedId}`); return 'Comment posted.'; });
}

export async function reportCommentAction(_: ActionState, fd: FormData) {
  const p = await requireFeed();
  return run(async () => { await reportComment(p, str(fd, 'commentId'), str(fd, 'reason') || 'inappropriate', str(fd, 'details')); return 'Thanks. A moderator will review this comment.'; });
}

export async function moderateCommentAction(_: ActionState, fd: FormData) {
  const p = await requireFeed();
  const status = str(fd, 'status');
  const sharedId = str(fd, 'sharedId');
  if (status !== 'hidden' && status !== 'visible' && status !== 'removed') return { error: 'Unknown action.' };
  return run(async () => { await moderateComment(p, str(fd, 'commentId'), status); revalidatePath(`/learn/feed/${sharedId}`); });
}

export async function saveSearchAction(_: ActionState, fd: FormData) {
  const p = await requireFeed();
  const filters = Object.fromEntries(['offering', 'industry', 'region', 'period', 'topic'].map((k) => [k, str(fd, k)]));
  return run(async () => { await saveSearch(p, { name: str(fd, 'name'), q: str(fd, 'q'), filters }); revalidatePath('/learn/saved'); return 'Search saved.'; });
}

export async function deleteSavedAction(_: ActionState, fd: FormData) {
  const p = await requireUser('/learn/saved');
  return run(async () => { await deleteSavedSearch(p, str(fd, 'id')); revalidatePath('/learn/saved'); });
}

export async function digestAction(_: ActionState, fd: FormData) {
  const p = await requireFeed();
  const topics = str(fd, 'topics').split(',').map((t) => t.trim()).filter(Boolean);
  return run(async () => { await setDigest(p, { frequency: str(fd, 'frequency'), topics }); revalidatePath('/learn/digest'); return 'Preferences saved.'; });
}

export async function queueDigestAction(_: ActionState) {
  const p = await requireFeed();
  return run(async () => {
    const status = await queueDigestEmail(p);
    revalidatePath('/learn/digest');
    return status === 'sent' ? 'Handed to the email provider (status: sent). Delivery is not confirmed.' : status === 'failed' ? 'The email provider rejected the message (status: failed).' : 'Stored in the outbox (status: queued). It has not been sent.';
  });
}
