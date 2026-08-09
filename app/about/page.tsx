import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { JsonLd } from '@/components/JsonLd';
import {
  aboutPageJsonLd,
  organizationJsonLd,
  websiteJsonLd
} from '@/lib/seo/jsonld';
import { buildShareMetadata } from '@/lib/seo/metadata';

const description =
  'About Publications Hub: the public digital catalog operated by Rotaract South Asia MDIO (RSAMDIO) for publications across South Asia.';

export const metadata: Metadata = buildShareMetadata({
  title: 'About',
  description,
  path: '/about'
});

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={[websiteJsonLd(), organizationJsonLd(), aboutPageJsonLd({ url: '/about', description })]}
      />
      <SiteNav />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">About Publications Hub</h1>
        <p className="text-sm text-slate-500 mb-10">
          Operated by <strong className="text-slate-700">Rotaract South Asia MDIO (RSAMDIO)</strong>
        </p>

        <div className="space-y-8 text-slate-600 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">What it is</h2>
            <p className="mt-2">
              Publications Hub is the public digital catalog operated by Rotaract South Asia MDIO
              (RSAMDIO) for publications across South Asia. Readers can
              browse series, open editions in the online flipbook reader, and download PDFs when
              publishers provide them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Who it is for</h2>
            <ul className="mt-2 list-disc pl-5 space-y-2">
              <li>
                <strong className="text-slate-800">Readers</strong> - members, Rotaractors, and the
                public looking for club and district magazines, newsletters, and digital editions.
              </li>
              <li>
                <strong className="text-slate-800">Publishers</strong> - authorized club or district
                teams who upload and manage editions in Publisher Studio.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">How to read</h2>
            <p className="mt-2">
              Start on the{' '}
              <Link href="/" className="text-primary hover:underline">
                home catalog
              </Link>
              , open a publication page, then choose an edition. Each edition has a stable public
              URL under <code className="text-xs bg-slate-100 px-1 rounded">/p/…/e/…</code> that you
              can share.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">How publishers publish</h2>
            <p className="mt-2">
              Signed-in publishers use{' '}
              <a href="/studio" className="text-primary hover:underline">
                Publisher Studio
              </a>{' '}
              to create publication series, upload PDF editions and covers, and publish to the public
              catalog. A short edition description helps readers (and search) understand each issue.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Operator</h2>
            <p className="mt-2">
              Publications Hub is an initiative of{' '}
              <a
                href="https://rsamdio.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Rotaract South Asia MDIO
              </a>
              . See also our{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy policy
              </Link>{' '}
              and{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of use
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
