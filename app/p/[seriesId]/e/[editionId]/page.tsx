import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EditionReader } from '@/components/EditionReader';
import { PublicationCrawlSummary } from '@/components/PublicationCrawlSummary';
import { JsonLd } from '@/components/JsonLd';
import { fetchPublicEdition, fetchPublicSeries } from '@/lib/firebase/rtdb-rest';
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
  params: Promise<{ seriesId: string; editionId: string }>;
};

/** Series path must match edition.series_id, or standalone `/p/{id}/e/{id}`. */
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
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesId: sRaw, editionId: eRaw } = await params;
  const seriesId = decodeURIComponent(sRaw);
  const editionId = decodeURIComponent(eRaw);
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
  const path = editionPath(seriesId, editionId);
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
  const { seriesId: sRaw, editionId: eRaw } = await params;
  const seriesId = decodeURIComponent(sRaw);
  const editionId = decodeURIComponent(eRaw);
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
  const path = editionPath(seriesId, editionId);
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
            seriesUrl: publicationPath(seriesId),
            publisherName,
            pdfUrl: edition.pdf_url
          })
        ]}
      />
      <PublicationCrawlSummary
        mode="edition"
        seriesId={seriesId}
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
