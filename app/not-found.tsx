import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false }
};

export default function NotFound() {
  return (
    <>
      <SiteNav showStudioCta={false} />
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Page not found</h1>
        <p className="text-slate-600 mb-8">
          That link may be outdated, or the publication is no longer available.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-dark"
        >
          Home
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
