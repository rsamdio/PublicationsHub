'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReaderChrome } from '@/components/ReaderChrome';
import { editionPath, publicationPath } from '@/lib/urls';
import {
  isEmbeddedFrame,
  openInNewTabIfEmbedded
} from '@/lib/client/is-embedded';

export type EditionReaderSeed = {
  id: string;
  title?: string | null;
  description?: string | null;
  pdf_url?: string | null;
  cover_url?: string | null;
  cover_thumb_url?: string | null;
  created_at?: string | number | null;
  issue_date?: string | number | null;
  series_title?: string | null;
  series_id?: string | null;
};

type Props = {
  seriesId: string;
  editionId: string;
  seriesSlug?: string;
  editionSlug?: string;
  /** SSR edition fields so open can start without waiting on RTDB when possible. */
  initialEdition?: EditionReaderSeed | null;
  seriesTitle?: string | null;
};

function toReaderPub(
  ed: EditionReaderSeed & { pdf_url: string; slug?: string | null },
  seriesCanonicalId: string,
  seriesTitle?: string | null,
  seriesSlug?: string | null,
  editionSlug?: string | null
) {
  return {
    id: ed.id,
    slug: editionSlug || ed.slug || null,
    title: ed.title || 'Publication',
    description: ed.description ?? undefined,
    pdf_url: ed.pdf_url,
    cover_url: ed.cover_url ?? undefined,
    cover_thumb_url: ed.cover_thumb_url ?? undefined,
    created_at: ed.created_at == null ? undefined : String(ed.created_at),
    issue_date: ed.issue_date == null ? undefined : String(ed.issue_date),
    series_title: seriesTitle || ed.series_title || null,
    series_id: ed.series_id || seriesCanonicalId,
    _seriesCanonicalId: seriesCanonicalId,
    _seriesSlug: seriesSlug || null
  };
}

/**
 * Standalone full-viewport edition reader for `/[seriesSlug]/[editionSlug]`.
 * When framed (any third-party iframe), opens the edition in a new tab and
 * returns the iframe to Home — never mounts the fullscreen flipbook.
 */
export function EditionReader({
  seriesId,
  editionId,
  seriesSlug,
  editionSlug,
  initialEdition = null,
  seriesTitle = null
}: Props) {
  const router = useRouter();
  const openedRef = useRef<string | null>(null);
  const chromeReadyRef = useRef(false);
  const framedEscapeStartedRef = useRef(false);
  const [chromeReady, setChromeReady] = useState(false);
  const [framedEscape, setFramedEscape] = useState(false);
  const seriesPath = publicationPath(seriesSlug || seriesId);

  const onChromeReady = useCallback(() => {
    if (chromeReadyRef.current) return;
    chromeReadyRef.current = true;
    setChromeReady(true);
  }, []);

  // Framed: break out to a top-level tab; keep Home in the iframe preview.
  useEffect(() => {
    if (!isEmbeddedFrame()) return;
    setFramedEscape(true);
    if (framedEscapeStartedRef.current) return;
    framedEscapeStartedRef.current = true;
    openInNewTabIfEmbedded(editionPath(seriesSlug || seriesId, editionSlug || editionId));
    router.replace('/');
  }, [seriesId, editionId, router]);

  useEffect(() => {
    if (framedEscape || isEmbeddedFrame() || !chromeReady) return;

    let cancelled = false;
    let viewerMod: {
      setReaderCloseHandler?: (fn: (() => void) | null) => void;
      closeReader?: () => void;
      unlockReaderPageScroll?: () => void;
      openReader?: (pub: any) => any;
    } | null = null;

    const key = `${seriesId}:${editionId}`;
    const seedPdf = initialEdition?.pdf_url || null;
    const seedTitle = seriesTitle || initialEdition?.series_title || null;

    (async () => {
      const viewer = await import('@/lib/client/viewer.js');
      if (cancelled || isEmbeddedFrame()) return;
      viewerMod = viewer;

      viewer.setReaderCloseHandler?.(() => {
        // If the user navigated here from within PublicationsHub in this tab, router.back()
        // returns cleanly to the previous page without polluting the history stack.
        // If the user landed directly on the edition, navigate to the series overview.
        let hasInternalHistory = false;
        if (typeof window !== 'undefined') {
          try {
            const internalRef = sessionStorage.getItem('pubhub_internal_referrer');
            hasInternalHistory = Boolean(internalRef && window.history.length > 1);
          } catch (_) {}
        }
        if (hasInternalHistory) {
          router.back();
        } else {
          router.replace(seriesPath);
        }
      });

      let seed: EditionReaderSeed | null =
        seedPdf && initialEdition ? { ...initialEdition, id: editionId } : null;
      let titleFromSeries = seedTitle;

      if (!seed?.pdf_url) {
        const { fetchPublishedEdition, fetchPublishedSeries } = await import('@/lib/firebase/db-public.js');
        if (cancelled) return;
        const [edRes, seriesRes] = await Promise.all([
          fetchPublishedEdition(editionId),
          fetchPublishedSeries(seriesId)
        ]);
        if (cancelled) return;
        const ed = edRes.data;
        if (!ed?.pdf_url) return;
        seed = ed;
        titleFromSeries =
          (seriesRes.data?.title && String(seriesRes.data.title).trim()) ||
          seedTitle ||
          ed.series_title ||
          null;
      } else if (!titleFromSeries) {
        const { fetchPublishedSeries } = await import('@/lib/firebase/db-public.js');
        if (cancelled) return;
        const seriesRes = await fetchPublishedSeries(seriesId);
        if (cancelled) return;
        titleFromSeries =
          (seriesRes.data?.title && String(seriesRes.data.title).trim()) ||
          seed.series_title ||
          null;
      }

      if (!seed?.pdf_url || cancelled || isEmbeddedFrame()) return;
      if (openedRef.current === key) return;
      openedRef.current = key;

      const pdfUrl = String(seed.pdf_url);
      viewer.openReader(
        toReaderPub(
          {
            ...seed,
            id: seed.id || editionId,
            pdf_url: pdfUrl,
            created_at:
              seed.created_at == null ? undefined : String(seed.created_at),
            issue_date:
              seed.issue_date == null ? undefined : String(seed.issue_date)
          },
          seriesId,
          titleFromSeries,
          seriesSlug,
          editionSlug
        ) as any
      );
    })();

    return () => {
      cancelled = true;
      if (openedRef.current === key) openedRef.current = null;
      const tearDown = (m: NonNullable<typeof viewerMod>) => {
        m.setReaderCloseHandler?.(null);
        m.closeReader?.();
        m.unlockReaderPageScroll?.();
      };
      if (viewerMod) {
        tearDown(viewerMod);
      } else {
        void import('@/lib/client/viewer.js').then(tearDown);
      }
    };
  }, [
    framedEscape,
    chromeReady,
    seriesId,
    editionId,
    seriesSlug,
    editionSlug,
    initialEdition,
    seriesTitle,
    router,
    seriesPath
  ]);

  if (framedEscape) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-500">
        Opening reader…
      </div>
    );
  }

  return (
    <div className="reader-route-shell">
      <ReaderChrome onReady={onChromeReady} />
    </div>
  );
}
