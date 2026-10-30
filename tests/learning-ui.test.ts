import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContributionForm } from '@/components/learning/ContributionForm';
import { SubmitPanel } from '@/components/learning/SubmitPanel';
import { WithdrawPanel } from '@/components/learning/WithdrawPanel';
import { ReviewForm } from '@/components/learning/ReviewForm';
import { ReportButton } from '@/components/learning/ReportButton';
import { DiffView } from '@/components/learning/DiffView';
import { FlagList, SensitiveText } from '@/components/learning/SensitiveText';
import { SharingChip, StatusBadge } from '@/components/learning/badges';
import { ConsentPassport } from '@/components/learning/ConsentPassport';
import { scanText } from '@/lib/learning/sensitive';
import { wordDiff } from '@/lib/learning/diff';
import { PRODUCTION_PROPAGATION_SLA, SCAN_DISCLAIMER } from '@/lib/learning/constants';

const noop = async () => ({});
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const tag = (out: string, name: string) => out.match(new RegExp(`<(?:input|select|textarea)[^>]*name="${name}"[^>]*>`))?.[0] ?? '';

describe('learning UI renders (server-side render smoke) and states its safeguards', () => {
  it('capture form: client constraints mirror the server, saving is explicitly private, scan is not a guarantee', () => {
    const out = html(h(ContributionForm, { action: noop, communityApproved: true, submitLabel: 'Save private draft', backHref: '/learn/mine' }));
    expect(out).toMatch(/minLength="5"[^>]*maxLength="140"|maxLength="140"[^>]*minLength="5"/);
    expect(out).toContain('maxLength="4000"');
    expect(out).toContain('Saving keeps this private to you');
    expect(out).toContain('Private to me');
    expect(out).toContain('Within my organisation');
    expect(out).toContain('Propose sharing with the approved learning community');
    expect(out).toMatch(/customer identities/);
    expect(out).toMatch(/account, card or IBAN numbers/);
    expect(out).toMatch(/credentials/);
  });
  it('community option is disabled for a non-approved organisation', () => {
    const out = html(h(ContributionForm, { action: noop, communityApproved: false, submitLabel: 'Save', backHref: '/' }));
    expect(out.match(/<input[^>]*value="community"[^>]*>/)?.[0]).toContain('disabled');
    expect(out).toContain('not an approved participant');
  });
  it('submit panel shows four separate consent controls with training default off and explicit "not used in this release"', () => {
    const out = html(h(SubmitPanel, { action: noop, contributionId: 'con_x', sharingChoice: 'community', flags: scanText('observation', 'mail a@b.example'), gaps: [], resubmit: false }));
    for (const n of ['store_process', 'publish_shared', 'attribution', 'training']) expect(out).toContain(`name="${n}"`);
    expect(tag(out, 'store_process')).toContain('required');
    expect(tag(out, 'publish_shared')).toContain('required');
    for (const n of ['attribution', 'training']) {
      expect(tag(out, n)).not.toContain('checked');
      expect(tag(out, n)).not.toContain('required');
    }
    expect(out).toMatch(/not used in this release/i);
    expect(out).toContain('name="acknowledgeFlags"');
    expect(out.toLowerCase()).toContain('not a privacy guarantee');
  });
  it('withdraw panel renders nothing once unavailable (it only stays mounted to show the trace)', () => {
    expect(html(h(WithdrawPanel, { action: noop, contributionId: 'con_x', kind: 'live', available: false }))).toBe('');
  });
  it('withdraw panel states the SLA and what withdrawal cannot do', () => {
    const out = html(h(WithdrawPanel, { action: noop, contributionId: 'con_x', kind: 'live', available: true }));
    expect(out).toContain(PRODUCTION_PROPAGATION_SLA);
    expect(out).toMatch(/cannot be recalled automatically/);
    expect(out).toMatch(/does not untrain a model/);
  });
  it('review form shows the live diff, reviewer-only notes, and consent-gated attribution', () => {
    const out = html(h(ReviewForm, { contributionId: 'con_x', source: { title: 'Orig Mr Smith', observation: 'Mr Smith at Acme Ltd', industry: 'a', region: 'b', period: 'c' }, initial: { title: 'Orig', summary: 'Mr Smith at Acme Ltd', industry: '', region: '', periodLabel: '', evidenceQuality: 'unassessed', includeAttribution: false, redactionNotes: '', reviewed: false }, attributionConsented: false, orgName: 'Org', saveAction: noop, publishAction: noop }));
    expect(out).toContain('Original vs shared');
    expect(tag(out, 'includeAttribution')).toContain('disabled');
    expect(out).toContain('name="acknowledgeResidualFlags"');
    expect(out).toContain('never shown to the contributor');
  });
  it('report button never asks the reporter to identify a client', () => {
    const out = html(h(ReportButton, { sharedId: 'shr_x' }));
    expect(out).toContain('Misleading or inaccurate');
    expect(out).toContain('Contains confidential information');
    expect(out).toContain('Inappropriate content');
    expect(out).toMatch(/do not need to name any client/);
  });
  it('flags and highlights render; diff marks removed and added words', () => {
    const t = 'Call Mr Smith on +1 415 555 0132';
    expect(html(h(SensitiveText, { text: t }))).toContain('<mark');
    expect(html(h(FlagList, { flags: scanText('observation', t) }))).toContain(SCAN_DISCLAIMER.slice(0, 30));
    const d = wordDiff('Mr Smith saw it', 'A reviewer saw it');
    expect(d.original.filter((p) => p.kind === 'removed').map((p) => p.text).join(' ')).toMatch(/Mr.*Smith/);
    expect(d.shared.filter((p) => p.kind === 'added').map((p) => p.text).join(' ')).toContain('reviewer');
    expect(html(h(DiffView, { original: 'a b c', shared: 'a c d' }))).toContain('Original (private)');
  });
  it('audience chips are distinct for private / org / community', () => {
    expect(html(h(SharingChip, { choice: 'private' }))).toContain('Private to author');
    expect(html(h(SharingChip, { choice: 'organisation' }))).toContain('our organisation only');
    expect(html(h(SharingChip, { choice: 'community', status: 'published' }))).toContain('shared community');
    expect(html(h(StatusBadge, { status: 'clarification_requested' }))).toContain('Clarification requested');
  });
  it('consent passport lists all four purposes, who sees each version, history, and offers revocation controls only to the author', () => {
    const st = { store_process: { granted: true, at: new Date(), version: 1 }, publish_shared: { granted: true, at: new Date(), version: 1 }, attribution: { granted: false, at: null, version: null }, training: { granted: false, at: null, version: null } };
    const args = { contributionId: 'con_x', version: 1, sharingChoice: 'community' as const, status: 'published', state: st, history: [{ seq: 1, purpose: 'store_process', granted: true, contributionVersion: 1, at: new Date(), note: 'submitted' }], shared: [{ id: 'shr_x', version: 1, status: 'published', publishedAt: new Date(), withdrawnAt: null }] };
    const mine = html(h(ConsentPassport, { ...args, canEdit: true }));
    expect(mine).toContain('Consent passport');
    expect(mine).toContain('Who can see each version');
    expect(mine).toContain('Consent history');
    expect(mine).toContain('Allow');
    const ro = html(h(ConsentPassport, { ...args, canEdit: false }));
    expect(ro).not.toContain('>Allow<');
  });
});
