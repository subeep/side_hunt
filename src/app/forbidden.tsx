import Link from 'next/link';
import { PageHeader } from '@/components/ui';

export default function Forbidden() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <PageHeader eyebrow="403" title="You don't have access to this" description="Your account does not hold the role, grant or workspace membership required. Access is enforced on the server; hiding or showing a menu item never grants it." />
      <Link className="btn btn-secondary" href="/">Back to home</Link>
    </div>
  );
}
