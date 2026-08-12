import type { Metadata } from 'next';
import { safeHttpUrl } from '@/lib/urls';

export const SITE_NAME = 'Publications Hub';
export const ORG_NAME = 'Rotaract South Asia MDIO';
export const DEFAULT_TITLE = `${SITE_NAME} | ${ORG_NAME}`;
export const TITLE_TEMPLATE = `%s | ${SITE_NAME} | ${ORG_NAME}`;
export const DEFAULT_DESCRIPTION =
  'One place for all the digital publications across Rotaract South Asia. An initiative by Rotaract South Asia MDIO.';
export const DEFAULT_OG_IMAGE = '/images/ogimage.webp';

/** Home uses absolute title so the layout template does not double-append. */
export const HOME_TITLE_ABSOLUTE = DEFAULT_TITLE;

/**
 * Edition document/OG title segment: `{Edition} - {Series}` before the brand template.
 * Drops series when missing or identical to edition (case-insensitive).
 */
export function editionTitleSegment(
  editionTitle?: string | null,
  seriesTitle?: string | null
): string {
  const ed = editionTitle != null ? String(editionTitle).trim() : '';
  const series = seriesTitle != null ? String(seriesTitle).trim() : '';
  if (ed && series && ed.toLowerCase() !== series.toLowerCase()) {
    return `${ed} - ${series}`;
  }
  return ed || series || 'Edition';
}

export function seriesTitleSegment(seriesTitle?: string | null): string {
  const t = seriesTitle != null ? String(seriesTitle).trim() : '';
  return t || 'Publication';
}

export function ogImages(
  coverUrl?: string | null,
  alt?: string
): { url: string; width?: number; height?: number; alt: string }[] {
  const label = (alt && String(alt).trim()) || `${SITE_NAME} - ${ORG_NAME}`;
  const cover = safeHttpUrl(coverUrl);
  if (cover) {
    return [{ url: cover, alt: label }];
  }
  return [
    {
      url: DEFAULT_OG_IMAGE,
      width: 1200,
      height: 630,
      alt: label
    }
  ];
}

type ShareMetaInput = {
  title: string;
  description?: string | null;
  path: string;
  coverUrl?: string | null;
  type?: 'website' | 'article';
};

/** Full public-page metadata: canonical + OG + Twitter with brand image fallback. */
export function buildShareMetadata({
  title,
  description,
  path,
  coverUrl,
  type = 'website'
}: ShareMetaInput): Metadata {
  const desc =
    description != null && String(description).trim()
      ? String(description).trim()
      : DEFAULT_DESCRIPTION;
  // Document `title` still uses the layout template; OG/Twitter need the absolute string
  // (explicit openGraph.title bypasses Next’s title template).
  const absoluteTitle = `${title} | ${SITE_NAME} | ${ORG_NAME}`;
  const images = ogImages(coverUrl, absoluteTitle);
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: SITE_NAME,
      locale: 'en_US',
      title: absoluteTitle,
      description: desc,
      url: path,
      images
    },
    twitter: {
      card: 'summary_large_image',
      title: absoluteTitle,
      description: desc,
      images: images.map((img) => img.url)
    }
  };
}

export function enrichDescription(
  primary?: string | null,
  extras?: { publisherName?: string | null; seriesTitle?: string | null; fallback?: string }
): string {
  const base = primary != null ? String(primary).trim() : '';
  if (base) return base;

  const series =
    extras?.seriesTitle != null ? String(extras.seriesTitle).trim() : '';
  const publisher =
    extras?.publisherName != null ? String(extras.publisherName).trim() : '';

  if (series && publisher) {
    return `Read ${series} by ${publisher} on Publications Hub - an initiative by RSAMDIO.`;
  }
  if (series) {
    return `Read ${series} on Publications Hub - an initiative by RSAMDIO.`;
  }
  if (publisher) {
    return `Read publications by ${publisher} on Publications Hub - an initiative by RSAMDIO.`;
  }

  return extras?.fallback || DEFAULT_DESCRIPTION;
}
