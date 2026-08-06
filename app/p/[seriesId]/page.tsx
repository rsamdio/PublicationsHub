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

type Props = { params: Promise<{ seriesId: string }> };

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
  const { seriesId: raw } = await params;
  const seriesId = decodeURIComponent(raw);
  const series = await fetchPublicSeries(seriesId);
  const edition = series ? null : await fetchPublicEdition(seriesId);
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
  const path = publicationPath(seriesId);
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
  const { seriesId: raw } = await params;
  const seriesId = decodeURIComponent(raw);
  const seriesDoc = await fetchPublicSeries(seriesId);
  const standalone = seriesDoc ? null : await fetchPublicEdition(seriesId);
  if (!seriesDoc && !standalone) {
    notFound();
  }

  const editionsMap = await fetchPublicEditionsMap();

  const seriesTitle = seriesTitleSegment(
    seriesDoc?.title || standalone?.series_title || standalone?.title
  );
  const description =
    seriesDoc?.description || standalone?.description || null;
  const publisherName =
    seriesDoc?.publisher_name || standalone?.publisher_name || null;
  const freqRaw = seriesDoc?.frequency != null ? String(seriesDoc.frequency) : '';
  const frequencyLabel = freqRaw ? seriesFrequencyLabel(freqRaw) || freqRaw : null;
  const path = publicationPath(seriesId);

  const editionRows = standalone
    ? [{ id: seriesId, ...standalone }]
    : editionsForSeries(editionsMap, seriesId);

  const editionLinks = editionRows.map((ed) => ({
    id: ed.id,
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
    url: editionPath(seriesId, ed.id),
    datePublished: toIsoDate(ed.issue_date ?? ed.created_at)
  }));

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
          seriesId={seriesId}
          seriesTitle={seriesTitle}
          description={description}
          publisherName={publisherName}
          frequencyLabel={frequencyLabel}
          latestLabel={latestLabel}
          editions={editionLinks}
        />
        <div className="flex flex-col flex-1 min-h-0 w-full">
          <PublicationDetail seriesId={seriesId} />
        </div>
        <SiteFooter />
      </FramedDeepLinkEscape>
    </>
  );
}
