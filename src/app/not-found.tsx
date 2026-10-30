import Link from 'next/link';
import { PageHeader } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <PageHeader eyebrow="404" title="We can't find that page" description="It may not exist, or it may not be available to your account." />
      <Link className="btn btn-secondary" href="/">Back to home</Link>
    </div>
  );
}
