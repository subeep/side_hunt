import type { ReactNode } from 'react';
import { PageHeader, SubNav } from '@/components/ui';
import type { Principal } from '@/lib/auth/principal';
import { publisherTabsFor } from '@/lib/public/publisher';

/** Console frame. The tab list is a UI hint derived from grants; every tab page and action re-checks its own grant. */
export function PublisherShell({ p, current, title, description, children }: { p: Principal; current: string; title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <PageHeader eyebrow="Publisher console" title={title} description={description} />
      <SubNav items={[{ href: '/publisher', label: 'Overview' }, ...publisherTabsFor(p)]} current={current} />
      {children}
    </div>
  );
}
