import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EditionReader } from '@/components/EditionReader';
import { PublicationCrawlSummary } from '@/components/PublicationCrawlSummary';
import { JsonLd } from '@/components/JsonLd';
import { fetchPublicEdition, fetchPublicSeries,
  fetchPublicSeriesMap,
  fetchPublicEditionsMap,
  resolveSeriesBySlugOrId,
  resolveEditionBySlugOrId
} from '@/lib/firebase/rtdb-rest';
import { editionPath, publicationPath } from '@/lib/urls';
import {
  buildShareMetadata,
  editionTitleSegment,
  enrichDescription,
  seriesTitleSegment
} from '@/lib/seo/metadata';
import { editionJsonLd, organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld';
import { toIsoDate } from '@/lib/seo/dates';

type Props = {
  params: Promise<{ seriesSlug: string; editionSlug: string }>;
};

export const revalidate = 60;

/** Series path must match edition.series_id, or standalone `/[editionSlug]/[editionSlug]`. */
function editionBelongsToSeries(
  edition: { series_id?: string | null },
  seriesId: string,
  editionId: string
): boolean {
  const sid =
    edition.series_id != null && String(edition.series_id).trim()
      ? String(edition.series_id).trim()
      : '';
  if (sid) return sid === seriesId;
  return seriesId === editionId;
}

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
  const { seriesSlug: sRaw, editionSlug: eRaw } = await params;
  const seriesSlug = decodeURIComponent(sRaw);
  const editionSlug = decodeURIComponent(eRaw);
  
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  
  const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug)?.seriesId || seriesSlug;
  const editionId = resolveEditionBySlugOrId(editionsMap, seriesId, editionSlug)?.editionId || editionSlug;
  
  const [series, edition] = await Promise.all([
    fetchPublicSeries(seriesId),
    fetchPublicEdition(editionId)
  ]);
  if (!edition || !editionBelongsToSeries(edition, seriesId, editionId)) {
    return {
      title: 'Edition not found',
      description: 'This edition could not be found on Publications Hub.',
      robots: { index: false, follow: false }
    };
  }
  const seriesTitle = seriesTitleSegment(series?.title || edition.series_title);
  const title = editionTitleSegment(edition.title, seriesTitle);
  const description = enrichDescription(edition.description || series?.description, {
    publisherName: edition.publisher_name || series?.publisher_name,
    seriesTitle: editionTitleSegment(edition.title, seriesTitle)
  });
  const path = editionPath(seriesSlug, editionSlug);
  const cover = edition.cover_url || series?.cover_url;
  return buildShareMetadata({
    title,
    description,
    path,
    coverUrl: cover,
    type: 'article'
  });
}

export default async function EditionReaderPage({ params }: Props) {
  const { seriesSlug: sRaw, editionSlug: eRaw } = await params;
  const seriesSlug = decodeURIComponent(sRaw);
  const editionSlug = decodeURIComponent(eRaw);
  
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  
  const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug)?.seriesId || seriesSlug;
  const editionId = resolveEditionBySlugOrId(editionsMap, seriesId, editionSlug)?.editionId || editionSlug;
  
  const [series, edition] = await Promise.all([
    fetchPublicSeries(seriesId),
    fetchPublicEdition(editionId)
  ]);
  if (!edition || !editionBelongsToSeries(edition, seriesId, editionId)) {
    notFound();
  }

  const seriesTitle = seriesTitleSegment(series?.title || edition.series_title);
  const editionTitle = edition.title || 'Edition';
  const description = edition.description || series?.description || null;
  const publisherName = edition.publisher_name || series?.publisher_name || null;
  const path = editionPath(seriesSlug, editionSlug);
  const datePublished = toIsoDate(edition.issue_date ?? edition.created_at);
  const datePublishedLabel = formatUiDate(edition.issue_date ?? edition.created_at) || null;

  return (
    <>
      <JsonLd
        data={[
          websiteJsonLd(),
          organizationJsonLd(),
          ...editionJsonLd({
            name: editionTitleSegment(editionTitle, seriesTitle),
            description,
            url: path,
            image: edition.cover_url || series?.cover_url,
            datePublished,
            seriesName: seriesTitle,
            seriesUrl: publicationPath(seriesSlug),
            publisherName,
            pdfUrl: edition.pdf_url
          })
        ]}
      />
      <link rel="preload" href="/vendor/pdfjs/3.11.174/pdf.worker.min.js" as="script" />
      <link rel="preload" href="/vendor/pdfjs/3.11.174/pdf.min.js" as="script" />
      <PublicationCrawlSummary
        mode="edition"
        seriesId={seriesSlug}
        seriesTitle={seriesTitle}
        editionTitle={editionTitle}
        description={description}
        publisherName={publisherName}
        datePublishedLabel={datePublishedLabel}
        editions={[{ id: editionId, title: editionTitle }]}
        editionId={editionId}
      />
      <EditionReader
        seriesId={seriesId}
        editionId={editionId}
        seriesSlug={seriesSlug}
        editionSlug={editionSlug}
        seriesTitle={seriesTitle}
        initialEdition={{
          id: editionId,
          title: edition.title,
          description: edition.description,
          pdf_url: edition.pdf_url,
          cover_url: edition.cover_url,
          cover_thumb_url: edition.cover_thumb_url,
          created_at: edition.created_at,
          issue_date: edition.issue_date,
          series_title: edition.series_title || seriesTitle,
          series_id: seriesId
        }}
      />
    </>
  );
}
