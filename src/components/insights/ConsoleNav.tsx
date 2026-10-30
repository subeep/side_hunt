import { SubNav } from '@/components/ui';

export const ConsoleNav = ({ current }: { current: string }) => (
  <SubNav current={current} items={[{ href: '/product', label: 'Ideas & prioritisation' }, { href: '/product/ideas/new', label: 'New idea' }, { href: '/product/themes', label: 'Themes' }, { href: '/learn/ideas', label: 'Client view of ideas' }, { href: '/learn', label: 'Shared feed' }]} />
);
