'use client';

import { useEffect, useRef } from 'react';
import { studioBodyHtml } from '@/lib/client/studio-body';
import { MaterialIconsFont } from '@/components/MaterialIconsFont';

/**
 * Mounts the legacy studio DOM shell, then boots `lib/client/dashboard/main.js`
 * (Firebase clients unchanged). Prefer full page loads into `/studio`.
 */
export function StudioApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  useEffect(() => {
    if (!hostRef.current || booted.current) return;
    booted.current = true;
    void import('@/lib/client/dashboard/main.js');
  }, []);

  return (
    <>
      <MaterialIconsFont />
      <div
        ref={hostRef}
        className="min-h-[100dvh] flex flex-col bg-background-light text-slate-900 font-display antialiased overflow-x-clip"
        dangerouslySetInnerHTML={{ __html: studioBodyHtml }}
      />
    </>
  );
}
