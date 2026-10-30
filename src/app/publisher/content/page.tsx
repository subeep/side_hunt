import Link from 'next/link';
import { AudienceChip, Badge, Card, EmptyState, Field, fmtDate } from '@/components/ui';
import { ActionForm } from '@/components/public/ActionForm';
import { PublisherShell } from '@/components/public/PublisherShell';
import { requireGrant } from '@/lib/authz/guards';
import { listContentForManage } from '@/lib/public/publisher';
import { ContentFields } from './form';
import { contentStatusAction, saveContentAction } from '../actions';

export const metadata = { title: 'Publisher: public content' };

const TONE = { draft: 'neutral', published: 'sage', archived: 'neutral' } as const;
const BASE = { perspective: '/perspectives', lab: '/lab', page: '/pages' } as const;
const BUTTONS: Record<string, { to: string; label: string; variant?: 'secondary' }[]> = {
  draft: [{ to: 'published', label: 'Publish' }, { to: 'archived', label: 'Archive', variant: 'secondary' }],
  published: [{ to: 'draft', label: 'Unpublish', variant: 'secondary' }, { to: 'archived', label: 'Archive', variant: 'secondary' }],
  archived: [{ to: 'draft', label: 'Restore as draft', variant: 'secondary' }],
};

export default async function ContentPage() {
  const p = await requireGrant('content_publisher');
  const rows = await listContentForManage(p);
  const F = ContentFields;
  return (
    <PublisherShell p={p} current="/publisher/content" title="Public content" description="Perspectives, lab posts and pages. Items start as drafts. Public items appear on the website for everyone. Employees only items appear on the same pages, but only to signed-in employees.">
      <Card className="mb-8"><h2 className="mb-3 text-lg font-semibold">New item</h2><ActionForm action={saveContentAction} submitLabel="Save as draft"><F /></ActionForm></Card>
      {rows.length === 0 ? <EmptyState title="No content yet">Create your first perspective or lab post above.</EmptyState> : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id}><Card>
              <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[r.status]}>{r.status}</Badge><Badge>{r.kind}</Badge><AudienceChip kind={r.audienceKind} /><span className="text-xs text-muted">Updated {fmtDate(r.updatedAt)}</span></div>
              <h3 className="mt-2 text-lg font-semibold">{r.title}</h3>
              <p className="text-sm text-muted">{r.summary}</p>
              {r.status === 'published' && <p className="mt-1 text-sm"><Link href={`${BASE[r.kind as keyof typeof BASE]}/${r.slug}`}>{r.audienceKind === 'employees' ? 'View on site (employees only)' : 'View on site'}</Link></p>}
              <div className="mt-3 flex flex-wrap gap-3">
                {(BUTTONS[r.status] ?? []).map((s) => <ActionForm key={s.to} action={contentStatusAction} submitLabel={s.label} variant={s.variant}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={s.to} /></ActionForm>)}
              </div>
              <details className="mt-4 border-t border-line pt-4"><summary className="cursor-pointer text-sm font-semibold text-brown-700">Edit</summary><div className="mt-3"><ActionForm action={saveContentAction} submitLabel="Save changes"><F r={r} /></ActionForm></div></details>
            </Card></li>
          ))}
        </ul>
      )}
    </PublisherShell>
  );
}
