import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { PublicationDetail } from '@/components/PublicationDetail';
import { PublicationCrawlSummary } from '@/components/PublicationCrawlSummary';
import { FramedDeepLinkEscape } from '@/components/FramedDeepLinkEscape';
import { JsonLd } from '@/components/JsonLd';
import {
  editionsForSeries,
  fetchPublicEdition,
  fetchPublicEditionsMap,
  fetchPublicSeries,
  fetchPublicSeriesMap,
  resolveSeriesBySlugOrId,
  resolveEditionBySlugOrId,
  toIsoDate
} from '@/lib/firebase/rtdb-rest';
import { editionPath, publicationPath } from '@/lib/urls';
import {
  buildShareMetadata,
  enrichDescription,
  seriesTitleSegment
} from '@/lib/seo/metadata';
import { organizationJsonLd, seriesJsonLd, websiteJsonLd } from '@/lib/seo/jsonld';
import { seriesFrequencyLabel } from '@/lib/catalog/frequency-label.js';
import { buildSingleSeriesGroup } from '@/lib/catalog/catalog-series.js';

export const revalidate = 60;

type Props = { params: Promise<{ seriesSlug: string }> };

function formatUiDate(v: number | string | null | undefined): string {
  const iso = toIsoDate(v);
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesSlug: raw } = await params;
  const seriesSlug = decodeURIComponent(raw);
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  const seriesRes = resolveSeriesBySlugOrId(seriesMap, seriesSlug);
  const seriesId = seriesRes?.seriesId;
  const editionRes = !seriesId ? resolveEditionBySlugOrId(editionsMap, seriesSlug, seriesSlug) : null;
  const editionId = editionRes?.editionId;
  const resolvedId = seriesId || editionId;

  if (!resolvedId) {
    return {
      title: 'Publication not found',
      description: 'This publication could not be found on Publications Hub.',
      robots: { index: false, follow: false }
    };
  }

  const series = seriesRes?.data || (seriesId ? seriesMap[seriesId] || await fetchPublicSeries(seriesId) : null);
  const edition = editionRes?.data || (editionId ? editionsMap[editionId] || await fetchPublicEdition(editionId) : null);
  if (!series && !edition) {
    return {
      title: 'Publication not found',
      description: 'This publication could not be found on Publications Hub.',
      robots: { index: false, follow: false }
    };
  }
  const title = seriesTitleSegment(
    series?.title || edition?.series_title || edition?.title
  );
  const description = enrichDescription(
    series?.description || edition?.description,
    {
      publisherName: series?.publisher_name || edition?.publisher_name,
      seriesTitle: series?.title || edition?.series_title || edition?.title
    }
  );
  const path = publicationPath(seriesSlug);
  const cover = series?.cover_url || edition?.cover_url;
  return buildShareMetadata({
    title,
    description,
    path,
    coverUrl: cover,
    type: 'website'
  });
}

export default async function PublicationPage({ params }: Props) {
  const { seriesSlug: raw } = await params;
  const seriesSlug = decodeURIComponent(raw);
  
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  const seriesRes = resolveSeriesBySlugOrId(seriesMap, seriesSlug);
  const seriesId = seriesRes?.seriesId;
  const editionRes = !seriesId ? resolveEditionBySlugOrId(editionsMap, seriesSlug, seriesSlug) : null;
  const editionId = editionRes?.editionId;
  const resolvedId = seriesId || editionId;

  if (!resolvedId) {
    notFound();
  }

  const seriesDoc = seriesRes?.data || (seriesId ? seriesMap[seriesId] || await fetchPublicSeries(seriesId) : null);
  const standalone = editionRes?.data || (editionId ? editionsMap[editionId] || await fetchPublicEdition(editionId) : null);

  const seriesTitle = seriesTitleSegment(
    seriesDoc?.title || standalone?.series_title || standalone?.title
  );
  const description =
    seriesDoc?.description || standalone?.description || null;
  const publisherName =
    seriesDoc?.publisher_name || standalone?.publisher_name || null;
  const freqRaw = seriesDoc?.frequency != null ? String(seriesDoc.frequency) : '';
  const frequencyLabel = freqRaw ? seriesFrequencyLabel(freqRaw) || freqRaw : null;
  const path = publicationPath(seriesSlug);

  const editionRows = standalone
    ? [{ id: String(seriesId || ""), ...standalone }]
    : editionsForSeries(editionsMap, resolvedId);

  const editionLinks = editionRows.map((ed) => ({
    id: String(ed.id || ""), // ensure id is always a string
    slug: ed.slug || undefined,
    title: ed.title,
    dateLabel: formatUiDate(ed.issue_date ?? ed.created_at) || undefined
  }));

  const latest = editionRows[0];
  const latestDate = latest
    ? formatUiDate(latest.issue_date ?? latest.created_at)
    : '';
  const latestLabel = latest
    ? `${latest.title || latest.id}${latestDate ? ` (${latestDate})` : ''}`
    : null;

  const hasPart = editionRows.map((ed) => ({
    name: (ed.title && String(ed.title).trim()) || ed.id,
    url: editionPath(seriesSlug, ed.slug || ed.id),
    datePublished: toIsoDate(ed.issue_date ?? ed.created_at)
  }));

  const initialGroup = buildSingleSeriesGroup(
    resolvedId,
    seriesId || null,
    seriesDoc,
    editionRows
  );

  return (
    <>
      <JsonLd
        data={[
          websiteJsonLd(),
          organizationJsonLd(),
          ...seriesJsonLd({
            name: seriesTitle,
            description,
            url: path,
            image: seriesDoc?.cover_url || standalone?.cover_url,
            publisherName,
            hasPart
          })
        ]}
      />
      <FramedDeepLinkEscape>
        <SiteNav />
        <PublicationCrawlSummary
          mode="series"
          seriesId={seriesSlug}
          seriesTitle={seriesTitle}
          description={description}
          publisherName={publisherName}
          frequencyLabel={frequencyLabel}
          latestLabel={latestLabel}
          editions={editionLinks}
        />
        <div className="flex flex-col flex-1 min-h-0 w-full">
          <PublicationDetail seriesId={resolvedId} initialGroup={initialGroup} />
        </div>
        <SiteFooter />
      </FramedDeepLinkEscape>
    </>
  );
}
