'use client';

import { useEffect, useRef } from 'react';
import { adminBodyHtml } from '@/lib/client/admin-body';
import { MaterialIconsFont } from '@/components/MaterialIconsFont';

export function AdminApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  useEffect(() => {
    if (!hostRef.current || booted.current) return;
    booted.current = true;
    void import('@/lib/client/admin/main.js');
  }, []);

  return (
    <>
      <MaterialIconsFont />
      <div
        ref={hostRef}
        className="min-h-[100dvh] flex flex-col bg-background-light text-slate-900 font-display antialiased overflow-x-clip"
        dangerouslySetInnerHTML={{ __html: adminBodyHtml }}
      />
    </>
  );
}
