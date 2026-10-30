import { Alert, Badge, PageHeader } from '@/components/ui';
import { AdminNav } from '@/components/employee/Nav';
import { requireGrant } from '@/lib/authz/guards';
import { getConfig } from '@/lib/admin/views';

export const metadata = { title: 'Configuration' };

export default async function ConfigPage() {
  const p = await requireGrant('portal_admin');
  const c = await getConfig(p);
  const rows: [string, string, string, boolean | null][] = [
    ['DEMO_MODE', c.demoMode ? 'On' : 'Off', 'Shows one-click demo personas. Must be off for any real deployment.', c.demoMode],
    ['MIN_COHORT_ORGS', String(c.minCohortOrgs), 'Minimum distinct organisations before shared trend statistics are shown.', null],
    ['Email provider', c.emailProviderConfigured ? 'Configured' : 'Not configured', c.emailProviderConfigured ? `Sending as ${c.emailFrom}. Emails are recorded as sent to the provider, never "delivered".` : 'Emails are stored in the outbox as queued and are not sent.', null],
    ['Database', c.database, 'Embedded PGlite is for local development; production uses Postgres.', null],
    ['AUTH_SECRET', c.authSecretConfigured ? 'Set' : 'Not set (dev fallback)', 'The value is never displayed.', !c.authSecretConfigured],
  ];
  return (
    <div>
      <PageHeader eyebrow="Portal administration" title="Configuration" description="Read-only. Settings are changed through the deployment environment, not through this console." />
      <AdminNav current="/admin/config" />
      <Alert tone="info" className="mb-6">Secrets are reported as set or not set, never shown.</Alert>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="table-basic">
          <thead><tr><th scope="col">Setting</th><th scope="col">Value</th><th scope="col">Meaning</th></tr></thead>
          <tbody>{rows.map(([k, v, d, warn]) => <tr key={k}><td><code className="text-xs">{k}</code></td><td><Badge tone={warn ? 'amber' : 'neutral'}>{v}</Badge></td><td className="text-muted">{d}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
