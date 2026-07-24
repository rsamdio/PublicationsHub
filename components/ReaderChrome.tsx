'use client';

import { useEffect, useRef } from 'react';
import { readerChromeHtml } from '@/lib/client/reader-chrome';
import { hydratePubIcons } from '@/lib/catalog/hydrate-pub-icons.js';

type Props = {
  /** Wire chrome buttons after mount (series-detail / reader route). */
  onReady?: () => void | (() => void);
};

/**
 * Imperative flipbook chrome expected by `lib/client/viewer.js`.
 *
 * Important: set innerHTML once via effect — do NOT use dangerouslySetInnerHTML.
 * A parent re-render would re-apply the raw HTML and wipe hydrated SVG icons
 * (empty clickable buttons that "flashed" then vanished).
 */
export function ReaderChrome({ onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyOnce = useRef(false);

  useEffect(() => {
    if (!hostRef.current || readyOnce.current) return;
    readyOnce.current = true;
    hostRef.current.innerHTML = readerChromeHtml;
    hydratePubIcons(hostRef.current);
    // Second pass after layout in case any placeholders were missed.
    requestAnimationFrame(() => {
      if (hostRef.current) hydratePubIcons(hostRef.current);
    });
    const cleanup = onReady?.();
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [onReady]);

  return <div ref={hostRef} />;
}
