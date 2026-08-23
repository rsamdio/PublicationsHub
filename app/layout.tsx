import type { Metadata, Viewport } from 'next';
import './globals.css';
import { siteUrl } from '@/lib/firebase/config';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  SITE_NAME,
  TITLE_TEMPLATE,
  TWITTER_HANDLE
} from '@/lib/seo/metadata';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: DEFAULT_TITLE,
    template: TITLE_TEMPLATE
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'Rotaract',
    'South Asia',
    'MDIO',
    'digital publications',
    'magazines',
    'Rotary',
    'Publications Hub'
  ],
  authors: [{ name: 'Rotaract South Asia MDIO' }],
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: '/',
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Publications Hub - Rotaract South Asia MDIO'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE]
  },
  icons: {
    icon: [
      { url: '/images/favicon.webp', type: 'image/webp' },
      { url: '/images/favicon.ico' }
    ],
    apple: '/images/rsamdio.webp'
  }
};

export const viewport: Viewport = {
  themeColor: '#f6f3ed'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-x-clip">
      <body className="bg-background-light text-slate-900 font-display antialiased min-h-screen flex flex-col overflow-x-clip">
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
