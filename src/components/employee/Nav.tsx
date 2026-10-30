import { SubNav } from '@/components/ui';

const EMPLOYEE = [
  { href: '/employee', label: 'Dashboard' },
  { href: '/employee/playground', label: 'Playground' },
  { href: '/employee/live', label: 'Live' },
  { href: '/employee/experiments', label: 'Experiments' },
  { href: '/employee/teams', label: 'Teams' },
  { href: '/employee/release-notes', label: 'Release notes' },
  { href: '/employee/knowledge', label: 'Knowledge' },
  { href: '/learn', label: 'Learning hub' },
];
export const EmployeeNav = ({ current }: { current: string }) => <SubNav items={EMPLOYEE} current={current} />;

const ADMIN = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/orgs', label: 'Organisations' },
  { href: '/admin/employees', label: 'Employee allowlist' },
  { href: '/admin/grants', label: 'Platform grants' },
  { href: '/admin/support', label: 'Support access' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/admin/leads', label: 'Enquiries' },
  { href: '/admin/config', label: 'Config' },
  { href: '/admin/trust', label: 'Trust console' },
];
export const AdminNav = ({ current }: { current: string }) => <SubNav items={ADMIN} current={current} />;
