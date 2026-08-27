'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchPublishedCatalog, fetchPublishedSeriesMap } from '@/lib/firebase/db-public.js';
import { groupEditionsIntoSeries, findSeriesGroup } from '@/lib/catalog/catalog-series.js';
import { seriesFrequencyLabel } from '@/lib/catalog/frequency-label.js';
import { pubIcon } from '@/lib/catalog/icons-public.js';
import {
  editionPath,
  publicationPath,
  buildEditionDeepLink,
  getSeriesCanonicalIdForPublication,
  absoluteUrl
} from '@/lib/urls';
import { openInNewTabIfEmbedded } from '@/lib/client/is-embedded';
import { CoverImage } from './CoverImage';
import { ShareMenu } from './ShareMenu';

type Props = {
  seriesId: string;
  initialGroup?: any | null;
};

function formatDate(iso?: string | null) {
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

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: pubIcon(name as Parameters<typeof pubIcon>[0], className)
      }}
    />
  );
}

export function PublicationDetail({ seriesId, initialGroup = null }: Props) {
  const router = useRouter();
  const [group, setGroup] = useState<any | null>(initialGroup);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(!initialGroup);

  function warmReader(pdfUrl?: string | null) {
    void import('@/lib/client/viewer.js').then((m: any) => {
      if (pdfUrl) m.warmReaderForEdition?.(pdfUrl);
      else m.preloadReaderAssets?.();
    });
  }

  // Warm pdf.js / page-flip only on intent (hover/focus), not on every series mount.
  // Eager warm injects viewer CSS into the document and is unnecessary for browsing.

  useEffect(() => {
    if (initialGroup) return; // Zero-latency hydration, skip fetch entirely
    
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [catRes, seriesRes] = await Promise.all([
        fetchPublishedCatalog(),
        fetchPublishedSeriesMap()
      ]);
      if (cancelled) return;
      if (catRes.error) {
        setError(catRes.error.message || 'Failed to load catalog');
        setLoading(false);
        return;
      }
      const seriesMap = seriesRes.data && !seriesRes.error ? seriesRes.data : {};
      const groups = groupEditionsIntoSeries(catRes.data || [], seriesMap);
      const g = findSeriesGroup(groups, seriesId);
      if (!g) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setGroup(g);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesId, initialGroup]);

  const openEdition = (ed: any) => {
    const sId = group?.slug || ed.series_slug || seriesId;
    const eId = ed.slug || ed.id;
    const path = editionPath(sId, eId);
    if (openInNewTabIfEmbedded(path)) return;
    router.push(path);
  };

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex-1 flex items-center justify-center py-24 text-slate-500 text-sm">
        Loading publication…
      </div>
    );
  } else if (error) {
    body = (
      <p className="text-center py-16 text-sm text-red-500 max-w-7xl mx-auto px-4">{error}</p>
    );
  } else if (notFound || !group) {
    body = (
      <div className="flex flex-col flex-1 items-center justify-center px-4 py-20 text-center">
        <Icon name="search_off" className="text-5xl text-slate-400 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Series not found</h1>
        <p className="text-slate-600 mb-8 max-w-md">
          Check the link or browse all publication series.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium"
          >
            All publications
          </Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-primary transition-colors">
            Home
          </Link>
        </div>
      </div>
    );
  } else {
    const freq = seriesFrequencyLabel(group.frequency);
    const latestWhen = formatDate(
      group.latestEdition?.issue_date || group.latestEdition?.created_at
    );
    const description =
      group.description ||
      `Digital editions from ${group.publisherName || 'this publisher'}. Pick an issue below or read the latest.`;
    const total = group.editions.length;
    const seriesShareTitle = group.seriesTitle || 'Publication';
    const seriesShareText = `${seriesShareTitle}${
      group.publisherName ? ` - ${group.publisherName}` : ''
    }`;
    const seriesShareUrl = () => absoluteUrl(publicationPath(group?.slug || seriesId));

    body = (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Hero - glow stays inside the hero box (no negative-margin overflow). */}
        <div className="relative bg-white border-b border-slate-200 overflow-x-clip overflow-y-hidden">
          <div
            className="pointer-events-none absolute top-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
            aria-hidden
          />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
            <div className="lg:grid lg:grid-cols-12 lg:gap-12 items-center">
              <div className="lg:col-span-4 flex justify-center lg:justify-start mb-8 lg:mb-0">
                <div className="relative w-64 max-w-full overflow-hidden p-3 -m-1">
                  <div className="relative rounded-lg shadow-2xl origin-center transform -rotate-2 hover:rotate-0 transition-transform duration-500">
                    <div className="absolute inset-0 bg-primary blur-xl opacity-20 rounded-lg" />
                    <div className="relative w-full aspect-[3/4] rounded-lg shadow-lg border border-white/10 overflow-hidden bg-slate-200 book-cover">
                      {group.coverUrl || group.coverThumbUrl ? (
                        <CoverImage
                          fullUrl={group.coverUrl}
                          thumbUrl={group.coverThumbUrl}
                          className="absolute inset-0 w-full h-full object-cover"
                          sizes="(max-width: 1024px) 80vw, 256px"
                          loading="eager"
                          fetchPriority="high"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-rose-400/20 text-slate-500 font-bold">
                          PDF
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-8 text-center lg:text-left">
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-4">
                  <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-900">
                    {group.publisherName || 'Publisher'}
                  </span>
                  {freq ? (
                    <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {freq}
                    </span>
                  ) : null}
                  <span className="text-slate-600 text-sm flex items-center">
                    <Icon name="new_releases" className="text-sm mr-1" />
                    <span>{latestWhen ? `Latest Issue · ${latestWhen}` : '-'}</span>
                  </span>
                  <span className="text-slate-600 text-sm flex items-center">
                    <Icon name="library_books" className="text-sm mr-1" />
                    <span>
                      {group.editionCount} edition{group.editionCount === 1 ? '' : 's'}
                    </span>
                  </span>
                </div>

                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4">
                  {group.seriesTitle}
                </h1>
                <p className="text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 mb-8">
                  {description}
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  {group.latestEdition ? (
                    <Link
                      href={editionPath(group?.slug || seriesId, group.latestEdition.slug || group.latestEdition.id)}
                      onClick={(e) => {
                        openInNewTabIfEmbedded(
                          editionPath(group?.slug || seriesId, group.latestEdition.slug || group.latestEdition.id),
                          e
                        );
                      }}
                      onPointerEnter={() => {
                        router.prefetch(editionPath(group?.slug || seriesId, group.latestEdition.slug || group.latestEdition.id));
                        warmReader(group.latestEdition?.pdf_url);
                      }}
                      onFocus={() => {
                        router.prefetch(editionPath(group?.slug || seriesId, group.latestEdition.slug || group.latestEdition.id));
                        warmReader(group.latestEdition?.pdf_url);
                      }}
                      className="w-full sm:w-auto flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-primary hover:bg-primary-dark md:py-3 md:text-lg md:px-10 transition-all shadow-lg shadow-primary/20"
                    >
                      <Icon name="auto_stories" className="mr-2" />
                      Read latest edition
                    </Link>
                  ) : null}
                  <ShareMenu
                    title={seriesShareTitle}
                    text={seriesShareText}
                    getUrl={seriesShareUrl}
                    label="Share"
                    stretchOnMobile
                    triggerClassName="w-full sm:w-auto flex items-center justify-center px-8 py-3 border border-slate-300 text-base font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 md:py-3 md:text-lg md:px-10 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 border-b border-slate-200 pb-6">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center">
              All Editions
              <span className="ml-3 text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                {group.editionCount}
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
            {group.editions.map((ed: any, i: number) => {
              const vol = total - i;
              const when = formatDate(ed.issue_date || ed.created_at) || 'Edition';
              return (
                <article
                  key={ed.id}
                  className="edition-card group flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden transition-colors hover:border-primary/50 cursor-pointer"
                  onPointerEnter={() => {
                    const eId = ed.slug || ed.id;
                    const path = editionPath(group?.slug || ed.series_slug || seriesId, eId);
                    router.prefetch(path);
                    warmReader(ed.pdf_url);
                  }}
                  onFocus={() => {
                    const eId = ed.slug || ed.id;
                    const path = editionPath(group?.slug || ed.series_slug || seriesId, eId);
                    router.prefetch(path);
                    warmReader(ed.pdf_url);
                  }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    openEdition(ed);
                  }}
                >
                  <div className="relative aspect-[3/4] bg-gray-200 overflow-hidden">
                    {ed.cover_url || ed.cover_thumb_url ? (
                      <CoverImage
                        fullUrl={ed.cover_url}
                        thumbUrl={ed.cover_thumb_url}
                        className="book-cover w-full h-full object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-xs font-bold text-primary">
                        PDF
                      </div>
                    )}
                    <div className="absolute top-3 right-3">
                      <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-bold rounded">
                        VOL {vol}
                      </span>
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center text-xs text-slate-500 mb-2">
                      <Icon name="calendar_today" className="text-sm mr-1" />
                      {when}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-primary transition-colors line-clamp-2">
                      {ed.title || 'Edition'}
                    </h3>
                    <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">
                      {ed.description || ''}
                    </p>
                    <div className="flex items-center gap-2 mt-auto">
                      <button
                        type="button"
                        className="flex-1 border border-primary/50 bg-primary/10 text-primary-dark hover:bg-primary hover:text-white hover:border-primary font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                        onPointerEnter={() => {
                          const eId = ed.slug || ed.id;
                          const path = editionPath(group?.slug || ed.series_slug || seriesId, eId);
                          router.prefetch(path);
                          warmReader(ed.pdf_url);
                        }}
                        onFocus={() => {
                          const eId = ed.slug || ed.id;
                          const path = editionPath(group?.slug || ed.series_slug || seriesId, eId);
                          router.prefetch(path);
                          warmReader(ed.pdf_url);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdition(ed);
                        }}
                      >
                        <Icon name="auto_stories" className="text-base" />
                        Read now
                      </button>
                      <ShareMenu
                        title={ed.title || 'Edition'}
                        text={`${ed.title || 'Edition'}${
                          group.publisherName ? ` - ${group.publisherName}` : ''
                        }`}
                        getUrl={() =>
                          buildEditionDeepLink(
                            ed.slug || ed.id,
                            group?.slug || ed.series_slug || getSeriesCanonicalIdForPublication(ed) || seriesId
                          )
                        }
                        label=""
                        triggerClassName="p-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors"
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  return <>{body}</>;
}
