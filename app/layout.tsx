import type { Metadata, Viewport } from 'next';
import './globals.css';
import { siteUrl } from '@/lib/firebase/config';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import { NavigationProgressBar } from '@/components/NavigationProgressBar';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  SITE_NAME,
  TITLE_TEMPLATE,
  TWITTER_HANDLE
} from '@/lib/seo/metadata';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

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
  },
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    yandex: process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined
  },
  other: {
    'geo.region': 'IN',
    'geo.placename': 'South Asia'
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
    <html lang="en" suppressHydrationWarning className={`overflow-x-clip ${inter.variable}`}>
      <body suppressHydrationWarning className="bg-background-light text-slate-900 font-display antialiased min-h-screen flex flex-col overflow-x-clip">
        <NavigationProgressBar />
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
