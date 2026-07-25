import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { ShelfCatalog } from '@/components/ShelfCatalog';
import { JsonLd } from '@/components/JsonLd';
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  HOME_TITLE_ABSOLUTE,
  SITE_NAME
} from '@/lib/seo/metadata';

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE_ABSOLUTE },
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    title: HOME_TITLE_ABSOLUTE,
    description: DEFAULT_DESCRIPTION,
    url: '/',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 600,
        height: 400,
        alt: 'Publications Hub — Rotaract South Asia MDIO'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME_TITLE_ABSOLUTE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE]
  }
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={[websiteJsonLd(), organizationJsonLd()]} />
      <SiteNav />
      <div className="flex flex-col flex-1 min-h-0">
        <div className="relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="text-center max-w-3xl mx-auto">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-transparent text-slate-800 text-xs font-medium mb-6 border border-primary/25">
                <span className="w-2 h-2 rounded-full bg-primary mr-2 shrink-0" />
                RSA Publications Hub
              </div>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
                Discover, read, and publish
                <br className="hidden md:block" />{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-rose-400">
                  digital editions
                </span>
              </h1>
              <p className="text-lg md:text-xl text-slate-600 mb-6 max-w-2xl mx-auto leading-relaxed">
                Browse and read publications. Publishers use{' '}
                <a href="/studio" className="text-primary hover:underline font-medium">
                  Publisher Studio
                </a>{' '}
                to upload editions.
              </p>
            </div>
          </div>
        </div>
        <ShelfCatalog />
      </div>
      <SiteFooter />
    </>
  );
}
