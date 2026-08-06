'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReaderChrome } from '@/components/ReaderChrome';
import {
  fetchPublishedEdition,
  fetchPublishedSeries
} from '@/lib/firebase/db-public.js';
import { publicationPath } from '@/lib/urls';
import {
  applyReaderEmbedAttrs,
  clearReaderEmbedAttrs
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
  /** SSR edition fields so open can start without waiting on RTDB when possible. */
  initialEdition?: EditionReaderSeed | null;
  seriesTitle?: string | null;
};

function toReaderPub(
  ed: EditionReaderSeed & { pdf_url: string },
  seriesCanonicalId: string,
  seriesTitle?: string | null
) {
  return {
    id: ed.id,
    title: ed.title || 'Publication',
    description: ed.description ?? undefined,
    pdf_url: ed.pdf_url,
    cover_url: ed.cover_url ?? undefined,
    cover_thumb_url: ed.cover_thumb_url ?? undefined,
    created_at: ed.created_at == null ? undefined : String(ed.created_at),
    issue_date: ed.issue_date == null ? undefined : String(ed.issue_date),
    series_title: seriesTitle || ed.series_title || null,
    series_id: ed.series_id || seriesCanonicalId,
    _seriesCanonicalId: seriesCanonicalId
  };
}

/**
 * Standalone full-viewport edition reader for `/p/[seriesId]/e/[editionId]`.
 */
export function EditionReader({
  seriesId,
  editionId,
  initialEdition = null,
  seriesTitle = null
}: Props) {
  const router = useRouter();
  const openedRef = useRef<string | null>(null);
  const chromeReadyRef = useRef(false);
  const [chromeReady, setChromeReady] = useState(false);
  const seriesPath = publicationPath(seriesId);

  const onChromeReady = useCallback(() => {
    if (chromeReadyRef.current) return;
    chromeReadyRef.current = true;
    applyReaderEmbedAttrs();
    setChromeReady(true);
  }, []);

  // Embed attrs as early as possible so CSS applies before chrome mounts.
  useEffect(() => {
    applyReaderEmbedAttrs();
    return () => {
      clearReaderEmbedAttrs();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let viewerMod: {
      preloadReaderAssets?: () => void;
      warmReaderForEdition?: (url: string) => void;
      setReaderCloseHandler?: (fn: (() => void) | null) => void;
      closeReader?: () => void;
      unlockReaderPageScroll?: () => void;
    } | null = null;

    void import('@/lib/client/viewer.js').then((m) => {
      if (cancelled) {
        // Unmounted before import finished — clear lock without navigating.
        m.setReaderCloseHandler?.(null);
        m.closeReader?.();
        m.unlockReaderPageScroll?.();
        return;
      }
      viewerMod = m;
      applyReaderEmbedAttrs();
      const pdf = initialEdition?.pdf_url;
      if (pdf) m.warmReaderForEdition?.(pdf);
      else m.preloadReaderAssets?.();
      m.setReaderCloseHandler?.(() => {
        // Close is an exit, not a forward navigation: replace so browser Back
        // does not land back on the edition and reopen the reader.
        router.replace(seriesPath);
      });
    });

    return () => {
      cancelled = true;
      const tearDown = (m: NonNullable<typeof viewerMod>) => {
        // Clear handler first so closeReader does not router.push after browser Back.
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
  }, [router, seriesPath, initialEdition?.pdf_url]);

  useEffect(() => {
    if (!chromeReady) return;
    let cancelled = false;
    const key = `${seriesId}:${editionId}`;
    const seedPdf = initialEdition?.pdf_url || null;
    const seedTitle = seriesTitle || initialEdition?.series_title || null;

    (async () => {
      const viewer = await import('@/lib/client/viewer.js');
      if (cancelled) return;

      let seed: EditionReaderSeed | null =
        seedPdf && initialEdition ? { ...initialEdition, id: editionId } : null;
      let titleFromSeries = seedTitle;

      if (!seed?.pdf_url) {
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
        const seriesRes = await fetchPublishedSeries(seriesId);
        if (cancelled) return;
        titleFromSeries =
          (seriesRes.data?.title && String(seriesRes.data.title).trim()) ||
          seed.series_title ||
          null;
      }

      if (!seed?.pdf_url || cancelled) return;
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
          titleFromSeries
        ) as any
      );
    })();

    return () => {
      cancelled = true;
      if (openedRef.current === key) openedRef.current = null;
    };
  }, [chromeReady, seriesId, editionId, initialEdition, seriesTitle]);

  return (
    <div className="reader-route-shell">
      <ReaderChrome onReady={onChromeReady} />
    </div>
  );
}
