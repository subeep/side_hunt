/** Demo persona sign-in. On by default outside production; production (e.g. Vercel) must opt in with DEMO_MODE=1. */
export const isDemoMode = () => (process.env.DEMO_MODE ?? (process.env.NODE_ENV === 'production' ? '0' : '1')) === '1';
export const isProd = () => process.env.NODE_ENV === 'production';
export const authSecret = () => {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.VERCEL) throw new Error('AUTH_SECRET must be set (>=16 chars) in production.');
  return 'dev-only-insecure-secret-change-me';
};
export const minCohortOrgs = () => Math.max(2, Number(process.env.MIN_COHORT_ORGS ?? 3) || 3);
export const INTERNAL_ORG_ID = 'org_azentio';
export const EMPLOYEE_DOMAIN = '@azentio.com';
