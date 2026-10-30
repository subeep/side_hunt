'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireClientAccepted } from '@/lib/client/guard';
import { deleteSavedScenario, executeRun, saveScenarioFromRun, submitRunFeedback } from '@/lib/client/sandbox';
import type { FormState } from '@/components/client/ActionForm';

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

/** Tenant + owner come from the session. Form values are only the scenario choice and synthetic inputs. */
export async function runAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const inputs: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (k.startsWith('in_') && typeof v === 'string') inputs[k.slice(3)] = v;
  const res = await executeRun(p, { offeringSlug: str(form.get('offeringSlug')), scenarioSlug: str(form.get('scenarioSlug')), inputs, evidenceNote: str(form.get('evidenceNote')) });
  if (!res.ok) return { error: res.error };
  redirect(`/client/sandbox/runs/${res.runId}`);
}

export async function feedbackAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const runId = str(form.get('runId'));
  const res = await submitRunFeedback(p, runId, { rating: str(form.get('rating')), topic: str(form.get('topic')), comment: str(form.get('comment')) });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/client/sandbox/runs/${runId}`);
  return { ok: 'Thanks. Your feedback was saved with this run.' };
}

export async function saveScenarioAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const res = await saveScenarioFromRun(p, str(form.get('runId')), str(form.get('name')));
  if (!res.ok) return { error: res.error };
  revalidatePath('/client/sandbox', 'layout');
  return { ok: 'Scenario saved. Load it from the offering page.' };
}

export async function deleteSavedAction(_prev: FormState, form: FormData): Promise<FormState> {
  const p = await requireClientAccepted();
  const done = await deleteSavedScenario(p, str(form.get('id')));
  revalidatePath('/client/sandbox', 'layout');
  return done ? { ok: 'Deleted.' } : { error: 'Scenario not found.' };
}
