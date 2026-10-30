import type { ReactNode } from 'react';
import { requireClientAccepted } from '@/lib/client/guard';

/** Terms gate: nothing in the portal renders until the current workspace terms are acknowledged (pages and actions re-check). */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requireClientAccepted();
  return children;
}
