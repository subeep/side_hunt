/** What an insights server action hands back to a form. Never contains tenant ids or internal notes. */
export interface ActionState {
  ok?: boolean;
  message?: string;
  error?: string;
}
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
