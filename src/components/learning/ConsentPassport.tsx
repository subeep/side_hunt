import { Badge, fmtDate } from '@/components/ui';
import type { ConsentState } from '@/lib/learning/consent';
import { CONSENT_COPY, USE_POLICY } from '@/lib/learning/constants';
import { CONSENT_PURPOSES } from '@/db/schema/learning';
import { optionalConsentAction } from '@/app/learn/c/[id]/actions';

type Row = { seq: number; purpose: string; granted: boolean; contributionVersion: number; at: Date; note: string | null };
type Shared = { id: string; version: number; status: string; publishedAt: Date | null; withdrawnAt: Date | null };

/**
 * Consent passport: current consent per purpose, who can see each version and how it may be used, and the full append-only
 * history. Joining an organisation is not consent: each purpose below is recorded and changeable separately.
 */
export function ConsentPassport({
  contributionId, version, sharingChoice, status, state, history, shared, canEdit,
}: { contributionId: string; version: number; sharingChoice: 'private' | 'organisation' | 'community'; status: string; state: ConsentState; history: Row[]; shared: Shared[]; canEdit: boolean }) {
  const toggle = (purpose: 'attribution' | 'training', to: boolean, label: string) => (
    <form action={optionalConsentAction}>
      <input type="hidden" name="contributionId" value={contributionId} />
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="granted" value={to ? '1' : '0'} />
      <button className="btn btn-secondary btn-sm" type="submit">{label}</button>
    </form>
  );
  const canGrantAttribution = sharingChoice === 'community' && ['draft', 'clarification_requested'].includes(status);
  return (
    <section className="card space-y-5" aria-labelledby="passport">
      <div>
        <h2 id="passport" className="text-xl">Consent passport</h2>
        <p className="mt-1 text-sm text-muted">Four separate permissions. Being a member of your organisation is not consent to share or train, and each one can be withdrawn on its own.</p>
      </div>

      <div className="space-y-2">
        {CONSENT_PURPOSES.map((p) => {
          const s = state[p];
          return (
            <div key={p} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-3">
              <div className="max-w-xl">
                <p className="font-medium text-brown-900">{CONSENT_COPY[p].label}</p>
                <p className="text-sm text-muted">{CONSENT_COPY[p].body}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={s.granted ? 'sage' : 'neutral'}>{s.granted ? 'Granted' : s.at ? 'Withdrawn' : 'Not granted'}</Badge>
                {s.at && <span className="text-xs text-muted">{fmtDate(s.at)} · v{s.version}</span>}
                {canEdit && p === 'publish_shared' && s.granted && ['submitted', 'in_review', 'clarification_requested'].includes(status) && <span className="max-w-[16rem] text-right text-xs text-muted">To revoke this, withdraw the proposal below.</span>}
                {canEdit && p === 'training' && toggle('training', !s.granted, s.granted ? 'Withdraw' : 'Allow')}
                {canEdit && p === 'attribution' && s.granted && toggle('attribution', false, 'Withdraw attribution')}
                {canEdit && p === 'attribution' && !s.granted && canGrantAttribution && toggle('attribution', true, 'Allow attribution')}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="text-base">Who can see each version, and how it may be used</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="table-basic">
            <thead><tr><th>Version</th><th>Who can see it</th><th>How it may be used</th></tr></thead>
            <tbody>
              <tr>
                <td>Your private original (v{version})</td>
                <td>{sharingChoice === 'private' ? 'You only' : sharingChoice === 'organisation' ? 'You and members of your organisation' : 'You, members of your organisation and, once submitted, learning moderators'}</td>
                <td>{sharingChoice === 'private' ? USE_POLICY.private : sharingChoice === 'organisation' ? USE_POLICY.organisation : USE_POLICY.source}</td>
              </tr>
              {shared.map((s) => (
                <tr key={s.id}>
                  <td>Shared reviewed copy (v{s.version}) <Badge tone={s.status === 'published' ? 'sage' : s.status === 'superseded' ? 'neutral' : 'clay'}>{s.status}</Badge></td>
                  <td>{s.status === 'published' ? 'Approved participating organisations, product owners and moderators. Not shown with your identity unless you consented and a moderator approved it.' : 'Nobody. It is offline.'}</td>
                  <td>{s.status === 'published' ? USE_POLICY.shared : s.status === 'withdrawn' ? `Withdrawn ${fmtDate(s.withdrawnAt)}. Removed from search and caches.` : s.status === 'superseded' ? 'Replaced by a newer approved version.' : 'Temporarily offline while a concern is reviewed.'}</td>
                </tr>
              ))}
              {!shared.length && <tr><td>Shared reviewed copy</td><td>None yet</td><td>Nothing has been published. {sharingChoice === 'community' ? 'It will exist only if a moderator approves a redacted version.' : sharingChoice === 'organisation' ? 'Organisation-only items never get a shared copy and are never shown to other clients.' : ''}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-base">Consent history (append-only)</h3>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No consent has been recorded yet. Saving a private draft records none; consent is captured when you submit.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="table-basic">
              <thead><tr><th>When</th><th>Purpose</th><th>Change</th><th>Version</th><th>Note</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.seq}>
                    <td className="whitespace-nowrap">{fmtDate(h.at)}</td>
                    <td>{CONSENT_COPY[h.purpose as keyof typeof CONSENT_COPY]?.label ?? h.purpose}</td>
                    <td><Badge tone={h.granted ? 'sage' : 'neutral'}>{h.granted ? 'Granted' : 'Withdrawn'}</Badge></td>
                    <td>v{h.contributionVersion}</td>
                    <td className="text-muted">{h.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
