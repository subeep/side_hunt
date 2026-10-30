import { Field } from '@/components/ui';
import type { ScenarioDef } from '@/lib/scenarios';
import { ActionForm, type FormState } from './ActionForm';

type Act = (prev: FormState, form: FormData) => Promise<FormState>;

/** Inputs form generated from the scenario definition. Values are only hints: the server re-validates and clamps everything. */
export function RunForm({ def, values, action }: { def: ScenarioDef; values: Record<string, unknown>; action: Act }) {
  return (
      <ActionForm action={action} submit="Run simulation" pendingText="Running…" className="space-y-4">
        <input type="hidden" name="offeringSlug" value={def.offeringSlug} />
        <input type="hidden" name="scenarioSlug" value={def.slug} />
        <div className="grid gap-4 sm:grid-cols-2">
          {def.fields.map((f) => {
            const id = `in_${f.key}`;
            const v = String(values[f.key] ?? f.default);
            return (
              <Field key={f.key} label={f.label} htmlFor={id} hint={f.help ?? (f.type === 'number' && f.min != null && f.max != null ? `Between ${f.min} and ${f.max}` : undefined)}>
                {f.type === 'select' ? (
                  <select id={id} name={id} defaultValue={v} className="select">{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                ) : (
                  <input id={id} name={id} type={f.type === 'number' ? 'number' : 'text'} defaultValue={v} min={f.min} max={f.max} step={f.step ?? 'any'} className="input" required />
                )}
              </Field>
            );
          })}
        </div>
        <Field label="Evidence note (optional)" htmlFor="evidenceNote" hint="Paste a short text note to keep with this run. Plain text only, up to 1500 characters. No file uploads. Do not paste customer data or credentials: this sandbox is for synthetic data.">
          <textarea id="evidenceNote" name="evidenceNote" maxLength={1500} rows={3} className="textarea !min-h-[5rem]" />
        </Field>
      </ActionForm>
  );
}
