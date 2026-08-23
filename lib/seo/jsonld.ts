import { siteUrl } from '@/lib/firebase/config';
import {
  ORG_NAME,
  SITE_NAME,
  DEFAULT_DESCRIPTION,
  TWITTER_URL
} from '@/lib/seo/metadata';
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

export function organizationId(): string {
  return `${abs('/')}#organization`;
}

export function websiteId(): string {
  return `${abs('/')}#website`;
}

function seriesNodeId(seriesUrl: string): string {
  return `${abs(seriesUrl)}#series`;
}

function issueNodeId(editionUrl: string): string {
  return `${abs(editionUrl)}#issue`;
}

function breadcrumbList(
  items: { name: string; url: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: abs(item.url)
    }))
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId(),
    name: ORG_NAME,
    url: 'https://rsamdio.org/',
    logo: abs('/images/rsamdio.webp'),
    sameAs: ['https://rsamdio.org/', TWITTER_URL]
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteId(),
    name: SITE_NAME,
    url: abs('/'),
    description: DEFAULT_DESCRIPTION,
    publisher: { '@id': organizationId() }
  };
}

export function aboutPageJsonLd(input: { url: string; description?: string | null }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': `${abs(input.url)}#about`,
    name: `About ${SITE_NAME}`,
    url: abs(input.url),
    description: input.description || DEFAULT_DESCRIPTION,
    isPartOf: { '@id': websiteId() },
    about: { '@id': organizationId() },
    publisher: { '@id': organizationId() }
  };
}

export function seriesJsonLd(input: {
  name: string;
  description?: string | null;
  url: string;
  image?: string | null;
  publisherName?: string | null;
  hasPart?: { name: string; url: string; datePublished?: string | null }[];
}) {
  const seriesUrl = abs(input.url);
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWorkSeries',
    '@id': seriesNodeId(input.url),
    name: input.name,
    url: seriesUrl,
    description: input.description || undefined,
    image: absImage(input.image),
    publisher: {
      '@type': 'Organization',
      name: input.publisherName || ORG_NAME
    },
    isPartOf: { '@id': websiteId() }
  };
  if (input.hasPart?.length) {
    node.hasPart = input.hasPart.map((part) => ({
      '@type': 'PublicationIssue',
      '@id': issueNodeId(part.url),
      name: part.name,
      url: abs(part.url),
      datePublished: part.datePublished || undefined
    }));
  }
  return [
    node,
    breadcrumbList([
      { name: SITE_NAME, url: '/' },
      { name: input.name, url: input.url }
    ])
  ];
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
  pdfUrl?: string | null;
}) {
  const editionUrl = abs(input.url);
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'PublicationIssue',
    '@id': issueNodeId(input.url),
    name: input.name,
    url: editionUrl,
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
      '@id': seriesNodeId(input.seriesUrl),
      name: input.seriesName,
      url: abs(input.seriesUrl)
    };
  }
  const pdf = safeHttpUrl(input.pdfUrl);
  if (pdf) {
    node.associatedMedia = {
      '@type': 'MediaObject',
      contentUrl: pdf,
      encodingFormat: 'application/pdf',
      name: input.name
    };
    node.encoding = {
      '@type': 'MediaObject',
      contentUrl: pdf,
      encodingFormat: 'application/pdf'
    };
  }

  const crumbs: { name: string; url: string }[] = [{ name: SITE_NAME, url: '/' }];
  if (input.seriesName && input.seriesUrl) {
    crumbs.push({ name: input.seriesName, url: input.seriesUrl });
  }
  crumbs.push({ name: input.name, url: input.url });

  return [node, breadcrumbList(crumbs)];
}

export function itemListJsonLd(input: {
  name: string;
  items: { name: string; url: string; image?: string | null }[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item, i) => {
      const entry: Record<string, unknown> = {
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: abs(item.url),
        item: {
          '@type': 'CreativeWork',
          name: item.name,
          url: abs(item.url),
          image: absImage(item.image)
        }
      };
      return entry;
    })
  };
}
