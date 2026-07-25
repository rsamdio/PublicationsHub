'use client';

/**
 * Public home catalog (React port of `js/shelf.js`): featured editions row + "All Publications"
 * grid of series, with search filtering and infinite scroll.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchPublishedCatalog, fetchPublishedSeriesMap } from '@/lib/firebase/db-public.js';
import { groupEditionsIntoSeries } from '@/lib/catalog/catalog-series.js';
import { sortEditionsNewestFirstInPlace } from '@/lib/catalog/edition-sort.js';
import { seriesFrequencyBadgeAttrs, seriesFrequencyLabel } from '@/lib/catalog/frequency-label.js';
import { pubIcon } from '@/lib/catalog/icons-public.js';
import {
  publicationPath,
  editionPath,
  getSeriesCanonicalIdForPublication,
  buildEditionDeepLink,
  absoluteUrl
} from '@/lib/urls';
import { CoverImage } from './CoverImage';
import { ShareMenu } from './ShareMenu';

const PAGE_SIZE = 12;
const SKELETON_SHELF_COUNT = 8;
const SKELETON_FEATURED_COUNT = 5;

/** Inline SVG icon from `lib/catalog/icons-public.js` (no Material Icons webfont on public pages). */
function Icon({
  name,
  className = ''
}: {
  name: Parameters<typeof pubIcon>[0];
  className?: string;
}) {
  return <span dangerouslySetInnerHTML={{ __html: pubIcon(name, className) }} />;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * "All Publications" card — one per series group from `groupEditionsIntoSeries`. The whole card is
 * an overlay `Link` (z-10) to the publication page; the share button sits above it (z-20) so its
 * clicks don't trigger navigation.
 */
function SeriesCard({ group }: { group: any }) {
  const badge = seriesFrequencyBadgeAttrs(group.frequency, { compact: true });
  const href = publicationPath(group.canonicalId);
  const coverFull = group.coverUrl || '';
  const coverThumb = group.coverThumbUrl || '';

  return (
    <article className="edition-card group relative flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden transition-colors hover:border-primary/50">
      <Link
        href={href}
        className="absolute inset-0 z-10"
        aria-label={`Open ${group.seriesTitle}`}
        onPointerEnter={() => {
          void import('@/lib/client/viewer.js').then((m: any) => m.preloadReaderAssets?.());
        }}
        onFocus={() => {
          void import('@/lib/client/viewer.js').then((m: any) => m.preloadReaderAssets?.());
        }}
      >
        <span className="sr-only">{group.seriesTitle}</span>
      </Link>
      <div className="relative aspect-[3/4] bg-gray-200 overflow-hidden">
        <CoverImage
          fullUrl={coverFull}
          thumbUrl={coverThumb}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 34vw, 25vw"
          className="book-cover w-full h-full object-cover"
        />
        {!coverFull && !coverThumb ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 font-display font-bold">
            PDF
          </div>
        ) : null}
        <div className="absolute top-3 right-3">
          <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-bold rounded">
            {group.editionCount} edition{group.editionCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center text-xs text-slate-500 mb-2">
          <Icon name="new_releases" className="text-sm mr-1" />
          {group.lastActivityIso ? `Latest Issue · ${formatDate(group.lastActivityIso)}` : 'Latest Issue'}
        </div>
        <p className="text-xs text-slate-500 mb-1 line-clamp-1">{group.publisherName || 'Publisher'}</p>
        <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-primary transition-colors line-clamp-2">
          {group.seriesTitle}
        </h3>
        <span className={badge.className}>{badge.text}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 mt-auto">
          <div className="flex-1 border border-primary/50 bg-primary/10 text-primary font-medium py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2">
            <Icon name="library_books" className="text-base" />
            Open publication
          </div>
          <ShareMenu
            title={group.seriesTitle || 'Publication'}
            text={`${group.seriesTitle || 'Publication'}${group.publisherName ? ` — ${group.publisherName}` : ''}`}
            getUrl={() => absoluteUrl(href)}
          />
        </div>
      </div>
    </article>
  );
}

/** Featured row card — one per featured edition. Overlay `Link` to the edition deep link. */
function FeaturedCard({
  pub,
  seriesMap,
  eager,
  highPriority
}: {
  pub: any;
  seriesMap: Record<string, any>;
  eager: boolean;
  highPriority: boolean;
}) {
  const seriesCanonical = getSeriesCanonicalIdForPublication(pub);
  const href = editionPath(seriesCanonical, pub.id);
  const coverFull = pub.cover_url || '';
  const coverThumb = pub.cover_thumb_url || '';
  const liveSeries =
    pub.series_id != null && seriesMap[String(pub.series_id)]
      ? seriesMap[String(pub.series_id)]
      : null;
  // Prefer live series/publisher labels from catalog/series over edition snapshots.
  const badgeLabel =
    (liveSeries?.publisher_name || pub.publisher_name || '').trim() || 'Publisher';
  const seriesLine = (liveSeries?.title || pub.series_title || '').trim() || '—';
  const title = pub.title || 'Edition';

  return (
    <article className="group relative flex flex-col edition-card">
      <Link
        href={href}
        className="absolute inset-0 z-10"
        aria-label={title}
        onPointerEnter={() => {
          void import('@/lib/client/viewer.js').then((m: any) => m.preloadReaderAssets?.());
        }}
        onFocus={() => {
          void import('@/lib/client/viewer.js').then((m: any) => m.preloadReaderAssets?.());
        }}
      >
        <span className="sr-only">{title}</span>
      </Link>
      {/* Share must be a sibling of the overlay Link (not inside the transformed cover)
          or transform creates a stacking context under z-10 and blocks clicks. */}
      <div className="absolute top-2 right-2 z-20">
        <ShareMenu
          title={title}
          text={`${title}${badgeLabel !== 'Publisher' ? ` — ${badgeLabel}` : pub.publisher_name ? ` — ${pub.publisher_name}` : ''}`}
          getUrl={() => buildEditionDeepLink(pub.id, seriesCanonical)}
          variant="dark"
        />
      </div>
      <div className="aspect-[3/4] rounded-lg overflow-hidden bg-slate-100 relative shadow-lg shadow-slate-300/40 group-hover:shadow-primary/20 group-hover:shadow-2xl transition-all duration-300 transform group-hover:-translate-y-1 book-cover border border-slate-200">
        <CoverImage
          fullUrl={coverFull}
          thumbUrl={coverThumb}
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={highPriority ? 'high' : undefined}
        />
        {!coverFull && !coverThumb ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-rose-400/20 text-slate-400 font-bold text-sm">
            PDF
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 pointer-events-none" />
        <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
          <span className="inline-block max-w-full px-2 py-0.5 rounded bg-primary/90 text-white text-[10px] font-semibold leading-tight line-clamp-2 text-left">
            {badgeLabel}
          </span>
        </div>
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-r from-white/20 to-transparent pointer-events-none" />
      </div>
      <div className="mt-3">
        <h3 className="text-base font-semibold text-slate-900 leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {title}
        </h3>
        <p className="text-sm text-slate-500 mt-1 line-clamp-1">{seriesLine}</p>
      </div>
    </article>
  );
}

function SeriesCardSkeleton() {
  return (
    <article
      className="shelf-skeleton-card pointer-events-none animate-pulse rounded-xl border border-slate-200 bg-white overflow-hidden"
      aria-hidden="true"
    >
      <div className="aspect-[3/4] bg-slate-200" />
      <div className="p-5 space-y-3">
        <div className="h-3 w-1/2 rounded bg-slate-200" />
        <div className="h-3 w-2/3 rounded bg-slate-200" />
        <div className="h-5 w-4/5 rounded bg-slate-200" />
        <div className="h-10 w-full rounded-lg bg-slate-200 mt-4" />
      </div>
    </article>
  );
}

function FeaturedCardSkeleton() {
  return (
    <article className="shelf-skeleton-card pointer-events-none animate-pulse" aria-hidden="true">
      <div className="aspect-[3/4] rounded-lg bg-slate-200 border border-slate-200" />
      <div className="mt-3 space-y-2">
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-3 w-3/4 rounded bg-slate-200" />
      </div>
    </article>
  );
}

export function ShelfCatalog() {
  const [editions, setEditions] = useState<any[] | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [catRes, seriesRes] = await Promise.all([fetchPublishedCatalog(), fetchPublishedSeriesMap()]);
      if (cancelled) return;
      if (catRes.error) {
        setError(catRes.error.message || 'Failed to load publications');
        setEditions([]);
        setLoading(false);
        return;
      }
      setEditions(catRes.data || []);
      setSeriesMap(seriesRes.data && !seriesRes.error ? seriesRes.data : {});
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const seriesGroups = useMemo(() => {
    if (!editions || editions.length === 0) return [];
    return groupEditionsIntoSeries(editions, seriesMap);
  }, [editions, seriesMap]);

  const featuredEditions = useMemo(() => {
    if (!editions || editions.length === 0) return [];
    return sortEditionsNewestFirstInPlace(editions.filter((p: any) => p.featured === true));
  }, [editions]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return seriesGroups;
    return seriesGroups.filter((s: any) => {
      const freqSearch = seriesFrequencyLabel(s.frequency) || String(s.frequency || '').trim();
      const key = `${s.seriesTitle} ${s.publisherName} ${s.description || ''} ${freqSearch}`.toLowerCase();
      return key.includes(q);
    });
  }, [seriesGroups, searchQuery]);

  // Reset to the first page whenever the search query changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery]);

  // Infinite scroll: load the next batch once the sentinel nears the viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filteredGroups.length));
        }
      },
      { root: null, rootMargin: '480px 0px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredGroups.length]);

  // Short viewports: keep auto-loading batches while the sentinel is still within reach.
  useEffect(() => {
    if (loading) return;
    if (visibleCount >= filteredGroups.length) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const raf = requestAnimationFrame(() => {
      const rect = sentinel.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 480) {
        setVisibleCount((c) => Math.min(c + PAGE_SIZE, filteredGroups.length));
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [visibleCount, filteredGroups.length, loading]);

  const visibleGroups = filteredGroups.slice(0, Math.min(visibleCount, filteredGroups.length));
  const searching = searchQuery.trim().length > 0;
  const noMatches = !loading && searching && filteredGroups.length === 0;
  const hasMore = visibleGroups.length < filteredGroups.length;
  const isEmptyCatalog = !loading && !error && editions != null && editions.length === 0;

  let statusText = '';
  if (!noMatches && filteredGroups.length > 0) {
    if (hasMore) {
      statusText = `Showing ${visibleGroups.length} of ${filteredGroups.length} publication${filteredGroups.length === 1 ? '' : 's'}`;
    } else if (searching) {
      statusText = `Showing all ${filteredGroups.length} match${filteredGroups.length === 1 ? '' : 'es'}`;
    } else {
      statusText = `Showing all ${filteredGroups.length} publication${filteredGroups.length === 1 ? '' : 's'}`;
    }
  }

  if (error) {
    return <p className="text-center py-4 text-sm text-red-500 max-w-7xl mx-auto px-4">{error}</p>;
  }

  if (isEmptyCatalog) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="inline-flex p-6 rounded-2xl bg-slate-100 border border-slate-200 mb-6">
          <Icon name="menu_book" className="text-5xl text-primary/80" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No publications yet</h2>
        <p className="text-slate-600 max-w-md mx-auto mb-8">
          When a publisher uploads a PDF, it will appear here for everyone to read.
        </p>
        <a
          href="/studio"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium transition-colors"
        >
          <Icon name="login" className="text-sm" />
          Publisher Studio
        </a>
      </div>
    );
  }

  const showFeaturedSection = loading || featuredEditions.length > 0;

  return (
    <main className="flex-grow pt-8 lg:pt-12 space-y-16 lg:space-y-20 pb-20">
      {showFeaturedSection ? (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Featured</h2>
              <p className="text-sm text-slate-500 mt-1">Highlights from across the Publications</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6" aria-busy={loading}>
            {loading
              ? Array.from({ length: SKELETON_FEATURED_COUNT }, (_, i) => <FeaturedCardSkeleton key={i} />)
              : featuredEditions.map((pub: any, idx: number) => (
                  <FeaturedCard
                    key={pub.id}
                    pub={pub}
                    seriesMap={seriesMap}
                    eager={idx < 6}
                    highPriority={idx === 0}
                  />
                ))}
          </div>
        </section>
      ) : null}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="sticky top-16 z-30 -mx-4 px-4 py-4 bg-[#fffcf8]/90 backdrop-blur border-b border-stone-200/80 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              All Publications
              <span className="text-sm font-normal text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
                {loading ? '…' : String(seriesGroups.length)}
              </span>
            </h2>
            <div className="relative w-full md:max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Icon name="filter_list" className="text-lg" />
              </div>
              <input
                id="shelf-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:ring-1 focus:ring-primary focus:border-primary text-sm"
                placeholder="Filter by title or publisher…"
              />
            </div>
          </div>
        </div>

        <div
          id="shelf-grid"
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8${noMatches ? ' hidden' : ''}`}
          aria-busy={loading}
        >
          {loading
            ? Array.from({ length: SKELETON_SHELF_COUNT }, (_, i) => <SeriesCardSkeleton key={i} />)
            : visibleGroups.map((group: any) => <SeriesCard key={group.canonicalId} group={group} />)}
        </div>

        {noMatches ? (
          <p className="text-center text-slate-500 text-sm py-12">No publications match your search.</p>
        ) : null}

        <p className="text-sm text-slate-600 mt-6 text-center" aria-live="polite">
          {loading ? '' : statusText}
        </p>

        <div
          ref={sentinelRef}
          className={`h-8 w-full shrink-0${hasMore && !loading ? '' : ' hidden'}`}
          aria-hidden="true"
        />
      </section>
    </main>
  );
}
