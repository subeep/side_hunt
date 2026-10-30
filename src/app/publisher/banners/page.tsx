import { Alert, AudienceChip, Badge, Card, EmptyState, Field, fmtDate } from '@/components/ui';
import { ActionForm } from '@/components/public/ActionForm';
import { BannerStrip } from '@/components/public/Blocks';
import { PublisherShell } from '@/components/public/PublisherShell';
import { requireGrant } from '@/lib/authz/guards';
import { bannerFromRow, inWindow } from '@/lib/public/content';
import { listBannersForManage } from '@/lib/public/publisher';
import { bannerBadge, localInput } from '@/lib/public/format';
import { bannerStatusAction, saveBannerAction } from '../actions';

export const metadata = { title: 'Publisher: banners' };
type Row = Awaited<ReturnType<typeof listBannersForManage>>[number];

function BannerFields({ b }: { b?: Row }) {
  const m = (b?.meta ?? {}) as Record<string, string | null>;
  return (
    <>
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Headline" htmlFor={`t-${b?.id ?? 'new'}`}><input id={`t-${b?.id ?? 'new'}`} name="title" required minLength={3} maxLength={120} className="input" defaultValue={b?.title} /></Field>
        <Field label="Label above headline" htmlFor={`e-${b?.id ?? 'new'}`}><input id={`e-${b?.id ?? 'new'}`} name="eyebrow" maxLength={60} className="input" defaultValue={m.eyebrow ?? ''} placeholder="Upcoming hackathon" /></Field>
      </div>
      <Field label="Summary" htmlFor={`s-${b?.id ?? 'new'}`} hint="Up to 300 characters."><textarea id={`s-${b?.id ?? 'new'}`} name="summary" maxLength={300} className="textarea !min-h-20" defaultValue={b?.summary ?? ''} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Button label" htmlFor={`l-${b?.id ?? 'new'}`}><input id={`l-${b?.id ?? 'new'}`} name="ctaLabel" maxLength={40} className="input" defaultValue={m.ctaLabel ?? ''} /></Field>
        <Field label="Button link" htmlFor={`h-${b?.id ?? 'new'}`} hint="A site path like /hackathon/register or an https:// link."><input id={`h-${b?.id ?? 'new'}`} name="ctaHref" maxLength={300} className="input" defaultValue={m.ctaHref ?? ''} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Audience" htmlFor={`a-${b?.id ?? 'new'}`}><select id={`a-${b?.id ?? 'new'}`} name="audience" className="select" defaultValue={b?.audienceKind ?? 'public'}><option value="public">Public (everyone)</option><option value="employees">Employees only</option></select></Field>
        <Field label="Show from (UTC)" htmlFor={`f-${b?.id ?? 'new'}`}><input id={`f-${b?.id ?? 'new'}`} type="datetime-local" name="startsAt" className="input" defaultValue={localInput(b?.startsAt)} /></Field>
        <Field label="Show until (UTC)" htmlFor={`u-${b?.id ?? 'new'}`}><input id={`u-${b?.id ?? 'new'}`} type="datetime-local" name="endsAt" className="input" defaultValue={localInput(b?.endsAt)} /></Field>
      </div>
    </>
  );
}

const STATUS_BUTTONS: Record<string, { to: string; label: string; variant?: 'secondary' | 'danger' }[]> = {
  draft: [{ to: 'published', label: 'Publish' }, { to: 'archived', label: 'Archive', variant: 'secondary' }],
  published: [{ to: 'draft', label: 'Unpublish', variant: 'secondary' }, { to: 'archived', label: 'Archive', variant: 'secondary' }],
  archived: [{ to: 'draft', label: 'Restore as draft', variant: 'secondary' }],
};

export default async function BannersPage() {
  const p = await requireGrant('content_publisher');
  const rows = await listBannersForManage(p);
  const now = new Date();
  return (
    <PublisherShell p={p} current="/publisher/banners" title="Banners" description="Banners appear on the home page only while published and inside their window. Times are UTC.">
      <Card className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">New banner</h2>
        <ActionForm action={saveBannerAction} submitLabel="Save as draft"><BannerFields /></ActionForm>
      </Card>
      {rows.length === 0 ? <EmptyState title="No banners yet">Create one above. It starts as a draft and is not visible until you publish it.</EmptyState> : (
        <ul className="space-y-5">
          {rows.map((b) => {
            const badge = bannerBadge(b, now);
            return (
              <li key={b.id}><Card>
                <div className="mb-3 flex flex-wrap items-center gap-2"><Badge tone={badge.tone}>{badge.label}</Badge><AudienceChip kind={b.audienceKind} /><span className="text-xs text-muted">{b.startsAt || b.endsAt ? `${fmtDate(b.startsAt)} to ${fmtDate(b.endsAt)}` : 'No schedule'}</span></div>
                <BannerStrip banner={bannerFromRow(b)} tone="soft" />
                {b.status === 'published' && !inWindow(b, now) && <Alert tone="warn" className="mt-3">Published but outside its window, so visitors do not see it right now.</Alert>}
                <div className="mt-4 flex flex-wrap gap-3">
                  {(STATUS_BUTTONS[b.status] ?? []).map((s) => (
                    <ActionForm key={s.to} action={bannerStatusAction} submitLabel={s.label} variant={s.variant}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value={s.to} /></ActionForm>
                  ))}
                </div>
                <details className="mt-4 border-t border-line pt-4"><summary className="cursor-pointer text-sm font-semibold text-brown-700">Edit banner</summary>
                  <div className="mt-3"><ActionForm action={saveBannerAction} submitLabel="Save changes"><BannerFields b={b} /></ActionForm></div>
                </details>
              </Card></li>
            );
          })}
        </ul>
      )}
    </PublisherShell>
  );
}
