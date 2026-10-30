import Link from 'next/link';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold leading-tight md:text-4xl">{title}</h1>
        {description && <p className="mt-3 text-[1.02rem] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, href }: { children: ReactNode; className?: string; href?: string }) {
  if (href)
    return (
      <Link href={href} className={clsx('card card-link', className)}>
        {children}
      </Link>
    );
  return <div className={clsx('card', className)}>{children}</div>;
}

export type Tone = 'neutral' | 'brown' | 'sage' | 'clay' | 'amber';
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={clsx('badge', `badge-${tone}`, className)}>{children}</span>;
}

export function Alert({ children, tone = 'info', className }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' | 'ok'; className?: string }) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('alert', `alert-${tone}`, className)}>{children}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-brown-300 bg-brown-50/60 px-6 py-10 text-center">
      <p className="font-serif text-lg text-brown-900">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Audience lens: every protected resource shows who can see it. UI affordance only; the server enforces.
 */
export function AudienceChip({ kind, orgName }: { kind?: string | null; orgName?: string | null }) {
  const map: Record<string, { label: string; tone: Tone }> = {
    public: { label: 'Public', tone: 'neutral' },
    employees: { label: 'Employees only', tone: 'brown' },
    org: { label: orgName ? `${orgName} only` : 'Your organisation only', tone: 'amber' },
    product: { label: 'Entitled clients', tone: 'amber' },
    community: { label: 'Shared community', tone: 'sage' },
    private: { label: 'Private to author', tone: 'clay' },
  };
  const m = map[kind ?? ''] ?? { label: 'Restricted', tone: 'clay' as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-clay">{error}</p>}
    </div>
  );
}

export function SubNav({ items, current }: { items: { href: string; label: string }[]; current?: string }) {
  return (
    <nav className="subnav mb-6 flex flex-wrap gap-1 border-b border-line pb-3" aria-label="Section">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={current === i.href ? 'page' : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl text-brown-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtDay = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—');
