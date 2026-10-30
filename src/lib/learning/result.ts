export interface Fail {
  ok: false;
  code: 'not_found' | 'illegal_transition' | 'forbidden_actor' | 'precondition' | 'conflict' | 'invalid' | 'locked' | 'rate_limited' | 'no_workspace';
  message: string;
  errors?: Record<string, string>;
}
export const fail = (code: Fail['code'], message: string, errors?: Record<string, string>): Fail => ({ ok: false, code, message, errors });
/** What a server action hands back to a form (never contains tenant ids or internal notes). */
export interface FormState {
  ok?: boolean;
  message?: string;
  error?: string;
  errors?: Record<string, string>;
  trace?: { step: string; at: string; ms_since_start: number }[];
}
