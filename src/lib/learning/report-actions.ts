'use server';
import { requireUser } from '@/lib/authz/guards';
import { enforceClientTerms } from '@/lib/client/guard';
import { readStr } from './forms';
import { createReport } from './reports';
import type { FormState } from './result';

/** Server action behind <ReportButton/>. Authorisation (can the caller SEE the item?) is re-checked in createReport. */
export async function reportSharedAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const p = await requireUser();
  await enforceClientTerms(p);
  const r = await createReport(p, { sharedId: readStr(fd, 'sharedId'), reason: readStr(fd, 'reason'), details: readStr(fd, 'details') });
  if (!r.ok) return { error: r.message };
  return { ok: true, message: r.duplicate ? 'You have already reported this. A moderator will review it.' : 'Thank you. Your report was received and queued for a moderator. The contributor is not told who reported.' };
}
