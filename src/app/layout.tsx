import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';

export const metadata: Metadata = {
  title: { default: 'azentio.ai | Build intelligence. Create shared value.', template: '%s | azentio.ai' },
  description: 'Enterprise AI website and secure collaboration portal: public discovery, employee innovation, client collaboration and governed collective learning.',
};

// Every page reads the session; nothing here may be statically cached across principals.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-brown-800 focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
        <SiteHeader />
        <main id="main" className="container-page py-10">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
