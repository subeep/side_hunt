/** Pure helpers (safe to import from client components: no database imports). */
export const mediaUrl = (id: string, variant: 'data' | 'poster' = 'data') => `/api/media/${encodeURIComponent(id)}${variant === 'poster' ? '?variant=poster' : ''}`;
export const fmtDuration = (s: number | null | undefined) => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
