import { siteUrl } from '@/lib/firebase/config';
import { ORG_NAME, SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo/metadata';
import { safeHttpUrl } from '@/lib/urls';

function abs(pathOrUrl: string): string {
  const safe = safeHttpUrl(pathOrUrl);
  if (safe) return safe;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = siteUrl.replace(/\/$/, '');
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function absImage(url?: string | null): string | undefined {
  if (url == null || !String(url).trim()) return undefined;
  const safe = safeHttpUrl(url);
  if (safe) return safe;
  // Site-relative fallbacks (e.g. default OG) only — never non-http absolute schemes.
  if (String(url).startsWith('/')) return abs(String(url));
  return undefined;
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: ORG_NAME,
    url: 'https://rsamdio.org/',
    logo: abs('/images/rsamdio.webp'),
    sameAs: ['https://rsamdio.org/']
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: abs('/'),
    description: DEFAULT_DESCRIPTION,
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      url: 'https://rsamdio.org/',
      logo: abs('/images/rsamdio.webp')
    }
  };
}

export function seriesJsonLd(input: {
  name: string;
  description?: string | null;
  url: string;
  image?: string | null;
  publisherName?: string | null;
}) {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWorkSeries',
    name: input.name,
    url: abs(input.url),
    description: input.description || undefined,
    image: absImage(input.image),
    publisher: {
      '@type': 'Organization',
      name: input.publisherName || ORG_NAME
    },
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: abs('/')
    }
  };
  return node;
}

export function editionJsonLd(input: {
  name: string;
  description?: string | null;
  url: string;
  image?: string | null;
  datePublished?: string | null;
  seriesName?: string | null;
  seriesUrl?: string | null;
  publisherName?: string | null;
}) {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'PublicationIssue',
    name: input.name,
    url: abs(input.url),
    description: input.description || undefined,
    image: absImage(input.image),
    datePublished: input.datePublished || undefined,
    publisher: {
      '@type': 'Organization',
      name: input.publisherName || ORG_NAME
    }
  };
  if (input.seriesName && input.seriesUrl) {
    node.isPartOf = {
      '@type': 'CreativeWorkSeries',
      name: input.seriesName,
      url: abs(input.seriesUrl)
    };
  }
  return node;
}
