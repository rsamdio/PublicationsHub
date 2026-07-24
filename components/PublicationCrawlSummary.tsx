import Link from 'next/link';
import { editionPath, publicationPath } from '@/lib/urls';
import { editionTitleSegment } from '@/lib/seo/metadata';

type EditionLink = {
  id: string;
  title?: string;
};

type Props = {
  mode: 'series' | 'edition';
  seriesId: string;
  seriesTitle: string;
  editionTitle?: string;
  description?: string | null;
  publisherName?: string | null;
  editions?: EditionLink[];
  editionId?: string;
};

/**
 * Server-rendered crawlable summary so View Source / non-JS crawlers see H1 + description + edition links.
 * Visually hidden; interactive UI remains in PublicationDetail.
 */
export function PublicationCrawlSummary({
  mode,
  seriesId,
  seriesTitle,
  editionTitle,
  description,
  publisherName,
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
          Part of{' '}
          <Link href={publicationPath(seriesId)}>{seriesTitle}</Link>
        </p>
      ) : null}
      {publisherName ? <p>Publisher: {publisherName}</p> : null}
      {description ? <p>{description}</p> : null}
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
