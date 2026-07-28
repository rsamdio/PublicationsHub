import Link from 'next/link';
import { editionPath, publicationPath } from '@/lib/urls';
import { editionTitleSegment } from '@/lib/seo/metadata';

type EditionLink = {
  id: string;
  title?: string;
  dateLabel?: string;
};

type Props = {
  mode: 'series' | 'edition';
  seriesId: string;
  seriesTitle: string;
  editionTitle?: string;
  description?: string | null;
  publisherName?: string | null;
  frequencyLabel?: string | null;
  latestLabel?: string | null;
  datePublishedLabel?: string | null;
  editions?: EditionLink[];
  editionId?: string;
};

/**
 * Server-rendered crawl/GEO facts (sr-only). Interactive UI carries the visible UX;
 * JSON-LD on the page carries structured data.
 */
export function PublicationCrawlSummary({
  mode,
  seriesId,
  seriesTitle,
  editionTitle,
  description,
  publisherName,
  frequencyLabel,
  latestLabel,
  datePublishedLabel,
  editions = [],
  editionId
}: Props) {
  const heading =
    mode === 'edition'
      ? editionTitleSegment(editionTitle, seriesTitle)
      : seriesTitle || 'Publication';

  return (
    <section className="sr-only" aria-label="Publication summary">
      <h1>{heading}</h1>
      {mode === 'edition' && seriesTitle ? (
        <p>
          Part of <Link href={publicationPath(seriesId)}>{seriesTitle}</Link>
        </p>
      ) : null}
      {publisherName ? <p>Publisher: {publisherName}</p> : null}
      {frequencyLabel ? <p>Frequency: {frequencyLabel}</p> : null}
      {latestLabel ? <p>Latest edition: {latestLabel}</p> : null}
      {datePublishedLabel ? <p>Published: {datePublishedLabel}</p> : null}
      {description ? <p>{description}</p> : null}
      {publisherName ? (
        <p>
          Published by {publisherName} on Publications Hub (Rotaract South Asia MDIO).
        </p>
      ) : (
        <p>Published on Publications Hub (Rotaract South Asia MDIO).</p>
      )}
      <p>
        <Link href="/">Publications Hub home</Link>
      </p>
      {editions.length > 0 ? (
        <nav aria-label="Editions">
          <ul>
            {editions.map((ed) => (
              <li key={ed.id}>
                <Link href={editionPath(seriesId, ed.id)}>
                  {ed.title || ed.id}
                  {ed.dateLabel ? ` — ${ed.dateLabel}` : ''}
                  {editionId && ed.id === editionId ? ' (current)' : ''}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
