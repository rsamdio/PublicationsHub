import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { PublicationDetail } from '@/components/PublicationDetail';
import { PublicationCrawlSummary } from '@/components/PublicationCrawlSummary';
import { JsonLd } from '@/components/JsonLd';
import { fetchPublicEdition, fetchPublicSeries } from '@/lib/firebase/rtdb-rest';
import { publicationPath } from '@/lib/urls';
import {
  buildShareMetadata,
  enrichDescription,
  seriesTitleSegment
} from '@/lib/seo/metadata';
import { seriesJsonLd } from '@/lib/seo/jsonld';

type Props = { params: Promise<{ seriesId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesId: raw } = await params;
  const seriesId = decodeURIComponent(raw);
  const series = await fetchPublicSeries(seriesId);
  const edition = series ? null : await fetchPublicEdition(seriesId);
  if (!series && !edition) {
    return {
      title: 'Publication not found',
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
      seriesTitle: series?.title || edition?.series_title,
      fallback: 'Read this publication on Publications Hub.'
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
  const series = await fetchPublicSeries(seriesId);
  const standaloneEdition = series ? null : await fetchPublicEdition(seriesId);
  if (!series && !standaloneEdition) {
    notFound();
  }

  const seriesTitle = seriesTitleSegment(
    series?.title || standaloneEdition?.series_title || standaloneEdition?.title
  );
  const description =
    series?.description || standaloneEdition?.description || null;
  const publisherName =
    series?.publisher_name || standaloneEdition?.publisher_name || null;
  const path = publicationPath(seriesId);

  return (
    <>
      <JsonLd
        data={seriesJsonLd({
          name: seriesTitle,
          description,
          url: path,
          image: series?.cover_url || standaloneEdition?.cover_url,
          publisherName
        })}
      />
      <SiteNav />
      <PublicationCrawlSummary
        mode="series"
        seriesId={seriesId}
        seriesTitle={seriesTitle}
        description={description}
        publisherName={publisherName}
        editions={
          standaloneEdition
            ? [{ id: seriesId, title: standaloneEdition.title }]
            : []
        }
      />
      <div className="flex flex-col flex-1 min-h-0 w-full">
        <PublicationDetail seriesId={seriesId} />
      </div>
      <SiteFooter />
    </>
  );
}
