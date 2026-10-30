import { SubNav } from '@/components/ui';

export function LearnNav({ current }: { current: string }) {
  return (
    <SubNav
      current={current}
      items={[
        { href: '/learn', label: 'Shared learning (cross-client)' },
        { href: '/learn/mine', label: 'My observations' },
        { href: '/learn/org', label: 'Our organisation' },
        { href: '/learn/new', label: 'New observation' },
      ]}
    />
  );
}
