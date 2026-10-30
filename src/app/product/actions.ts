'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireGrant } from '@/lib/authz/guards';
import { changeStatus, createIdea, IdeaError, postUpdate, updateIdea, type IdeaInput } from '@/lib/insights/ideas';
import { rebuildThemes } from '@/lib/insights/themes';
import type { ActionState } from '@/lib/insights/state';

const str = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
const readIdea = (fd: FormData): IdeaInput => ({
  title: str(fd, 'title'), problem: str(fd, 'problem'), proposedOutcome: str(fd, 'proposedOutcome'), offeringSlug: str(fd, 'offeringSlug') || null,
  ownerUserId: str(fd, 'ownerUserId') || null, team: str(fd, 'team') || null, themeId: str(fd, 'themeId') || null,
  priority: (['low', 'medium', 'high'].includes(str(fd, 'priority')) ? str(fd, 'priority') : 'medium') as 'low' | 'medium' | 'high',
  evidenceIds: fd.getAll('evidence').filter((x): x is string => typeof x === 'string'),
});
async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    return { ok: true, message: (await fn()) || undefined };
  } catch (e) {
    if (e instanceof IdeaError) return { error: e.message };
    throw e;
  }
}

export async function createIdeaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = await requireGrant('product_owner');
  let id = '';
  const r = await run(async () => { id = (await createIdea(p, { ...readIdea(fd), initialUpdate: str(fd, 'initialUpdate') || undefined })).id; });
  if (!r.ok) return r;
  revalidatePath('/product');
  redirect(`/product/ideas/${id}`);
}

export async function updateIdeaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = await requireGrant('product_owner');
  const id = str(fd, 'ideaId');
  return run(async () => { await updateIdea(p, id, readIdea(fd)); revalidatePath(`/product/ideas/${id}`); revalidatePath('/learn/ideas'); return 'Idea saved.'; });
}

export async function changeStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = await requireGrant('product_owner');
  const id = str(fd, 'ideaId');
  return run(async () => {
    const r = await changeStatus(p, id, { status: str(fd, 'status'), note: str(fd, 'note'), message: str(fd, 'message') });
    revalidatePath(`/product/ideas/${id}`); revalidatePath('/product'); revalidatePath('/learn/ideas');
    return `Status changed. ${r.notified} contributor${r.notified === 1 ? '' : 's'} notified in-app.`;
  });
}

export async function postUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = await requireGrant('product_owner');
  const id = str(fd, 'ideaId');
  return run(async () => { await postUpdate(p, id, str(fd, 'message')); revalidatePath(`/product/ideas/${id}`); revalidatePath('/learn/ideas'); return 'Update posted.'; });
}

export async function rebuildThemesAction(_: ActionState): Promise<ActionState> {
  const p = await requireGrant('product_owner');
  const r = await rebuildThemes(p);
  revalidatePath('/product/themes'); revalidatePath('/learn/themes');
  return { ok: true, message: `Themes rebuilt: ${r.created} generated, ${r.removed} removed. Hand-made themes were not touched.` };
}
