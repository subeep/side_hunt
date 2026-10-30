import Link from 'next/link';
import { Alert, AudienceChip, Badge, Card, EmptyState, Field } from '@/components/ui';
import { ActionForm } from '@/components/public/ActionForm';
import { PublisherShell } from '@/components/public/PublisherShell';
import { requireGrant } from '@/lib/authz/guards';
import { audienceOptions, listMediaForManage } from '@/lib/public/publisher';
import { fmtDuration } from '@/lib/public/media';
import { mediaAudienceAction, mediaStatusAction } from '../actions';

export const metadata = { title: 'Publisher: media audiences' };

export default async function MediaAudiencesPage() {
  const p = await requireGrant('video_publisher');
  const [rows, opts] = await Promise.all([listMediaForManage(p), audienceOptions(p)]);
  const orgName = new Map(opts.orgs.map((o) => [o.id, o.name]));
  return (
    <PublisherShell p={p} current="/publisher/media" title="Media audiences" description="Choose who may watch each video and whether it is published. Access is enforced on the server for every media request.">
      <Alert tone="warn" className="mb-6">Making a video public makes it available to anyone on the internet and cacheable for up to five minutes. Narrowing or unpublishing takes effect on the next request. This tab changes video audience and status only; it cannot edit identities, roles or memberships. Recordings that belong to one client organisation are private to that client and are not listed here.</Alert>
      {rows.length === 0 ? <EmptyState title="No media yet">Uploaded or seeded videos will be listed here.</EmptyState> : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id}><Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.status === 'published' ? 'sage' : 'neutral'}>{r.status}</Badge>
                {r.audienceKind ? <AudienceChip kind={r.audienceKind} orgName={r.audienceOrgId ? orgName.get(r.audienceOrgId) : undefined} /> : <Badge tone="clay">No audience: denied to everyone</Badge>}
                {r.audienceKind === 'product' && r.audienceProduct && <Badge>{r.audienceProduct}</Badge>}
                {r.durationSec != null && <span className="text-xs text-muted">{fmtDuration(r.durationSec)}</span>}
              </div>
              <h3 className="mt-2 text-lg font-semibold">{r.title}</h3>
              <p className="font-mono text-xs text-muted">{r.id}</p>
              <p className="mt-1 text-sm"><Link href={`/media/${r.id}`}>Preview as you</Link> <span className="text-muted">(subject to the same audience rule)</span></p>
              <div className="mt-3"><ActionForm action={mediaStatusAction} submitLabel={r.status === 'published' ? 'Unpublish' : 'Publish'} variant={r.status === 'published' ? 'secondary' : 'primary'}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === 'published' ? 'draft' : 'published'} /></ActionForm></div>
              <details className="mt-4 border-t border-line pt-4"><summary className="cursor-pointer text-sm font-semibold text-brown-700">Change audience</summary>
                <div className="mt-3">
                  <ActionForm action={mediaAudienceAction} submitLabel="Save audience">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Who can watch" htmlFor={`k-${r.id}`}><select id={`k-${r.id}`} name="kind" className="select" defaultValue={r.audienceKind ?? 'employees'}><option value="public">Public (everyone)</option><option value="employees">Employees only</option><option value="org">One client organisation</option><option value="product">Clients entitled to a product</option></select></Field>
                      <Field label="Organisation" htmlFor={`o-${r.id}`} hint="Used only for 'One client organisation'."><select id={`o-${r.id}`} name="orgId" className="select" defaultValue={r.audienceOrgId ?? ''}><option value="">Select...</option>{opts.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
                      <Field label="Product" htmlFor={`p-${r.id}`} hint="Used only for 'Clients entitled to a product'."><select id={`p-${r.id}`} name="product" className="select" defaultValue={r.audienceProduct ?? ''}><option value="">Select...</option>{opts.products.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</select></Field>
                    </div>
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmPublic" className="mt-1 accent-brown-700" /><span>I confirm this video is safe for anyone on the internet (required when changing to Public).</span></label>
                  </ActionForm>
                </div>
              </details>
            </Card></li>
          ))}
        </ul>
      )}
    </PublisherShell>
  );
}
