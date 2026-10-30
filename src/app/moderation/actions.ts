'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireGrant } from '@/lib/authz/guards';
import { publishShared, reinstateShared, unpublishShared } from '@/lib/learning/publish';
import { claimForReview, decideReport, rejectContribution, requestClarification, saveSharedDraft } from '@/lib/learning/review';
import { readSharedRep, readStr } from '@/lib/learning/forms';
import type { Fail, FormState } from '@/lib/learning/result';

const id = (fd: FormData, k = 'contributionId') => z.string().min(1).max(64).parse(readStr(fd, k));
const bad = (r: Fail): FormState => ({ error: r.message, errors: r.errors });
const MOD = 'learning_moderator' as const;

export async function claimAction(_p: FormState, fd: FormData): Promise<FormState> {
  const p = await requireGrant(MOD);
  const cid = id(fd);
  const r = await claimForReview(p, cid);
  if (!r.ok) return bad(r);
  revalidatePath(`/moderation/${cid}`);
  return { ok: true, message: 'Claimed. You can now prepare the shared version.' };
}

export async function saveRedactionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const p = await requireGrant(MOD);
  const cid = id(fd);
  const r = await saveSharedDraft(p, cid, readSharedRep(fd));
  if (!r.ok) return bad(r);
  revalidatePath(`/moderation/${cid}`);
  return { ok: true, message: 'Redaction saved. Nothing is published yet.' };
}

/** Saves the form as the reviewed representation, then publishes exactly what was saved. */
export async function publishAction(_p: FormState, fd: FormData): Promise<FormState> {
  const p = await requireGrant(MOD);
  const cid = id(fd);
  const s = await saveSharedDraft(p, cid, readSharedRep(fd));
  if (!s.ok) return bad(s);
  const r = await publishShared(p, cid, { acknowledgeResidualFlags: fd.get('acknowledgeResidualFlags') === 'on' });
  if (!r.ok) return bad(r);
  redirect('/moderation?published=1');
}

export async function clarifyAction(_p: FormState, fd: FormData): Promise<FormState> {
  const p = await requireGrant(MOD);
  const r = await requestClarification(p, id(fd), readStr(fd, 'message'), readStr(fd, 'internalNote') || null);
  if (!r.ok) return bad(r);
  redirect('/moderation?clarification=1');
}

export async function rejectAction(_p: FormState, fd: FormData): Promise<FormState> {
  const p = await requireGrant(MOD);
  const r = await rejectContribution(p, id(fd), { category: readStr(fd, 'category'), reasonPublic: readStr(fd, 'reasonPublic'), internalNote: readStr(fd, 'internalNote') });
  if (!r.ok) return bad(r);
  redirect('/moderation?rejected=1');
}

export async function unpublishAction(_p: FormState, fd: FormData): Promise<FormState> {
  const p = await requireGrant(MOD);
  const reasonPublic = readStr(fd, 'reasonPublic').trim();
  if (reasonPublic.length < 5) return { error: 'Write the public reason the contributor will see (at least 5 characters).' };
  const r = await unpublishShared(p, id(fd, 'sharedId'), { reasonPublic, internalNote: readStr(fd, 'internalNote') || null, reportId: readStr(fd, 'reportId') || undefined });
  if (!r.ok) return bad(r);
  revalidatePath('/moderation', 'layout');
  return { ok: true, message: 'Unpublished. It is out of search and caches, and the contributor has been notified.' };
}

export async function reinstateAction(_p: FormState, fd: FormData): Promise<FormState> {
  const p = await requireGrant(MOD);
  const r = await reinstateShared(p, id(fd, 'sharedId'), { internalNote: readStr(fd, 'internalNote') || null });
  if (!r.ok) return bad(r);
  revalidatePath('/moderation', 'layout');
  return { ok: true, message: 'Reinstated and re-indexed. The contributor has been notified.' };
}

export async function decideReportAction(_p: FormState, fd: FormData): Promise<FormState> {
  const p = await requireGrant(MOD);
  const r = await decideReport(p, id(fd, 'reportId'), { decision: readStr(fd, 'decision'), note: readStr(fd, 'note'), reasonPublic: readStr(fd, 'reasonPublic') || undefined });
  if (!r.ok) return bad(r);
  redirect('/moderation?reportDecided=1');
}
