'use client';

import { useEffect } from 'react';

const HREF =
  'https://fonts.googleapis.com/icon?family=Material+Icons&display=swap';
const LINK_ID = 'material-icons-font';

/**
 * Studio/admin shells still use `<span class="material-icons">…</span>` ligatures
 * (including markup injected by dashboard/admin JS). Public pages use inline SVGs.
 */
export function MaterialIconsFont() {
  useEffect(() => {
    if (document.getElementById(LINK_ID)) return;
    if (!document.querySelector('link[href*="fonts.googleapis.com"][rel="preconnect"]')) {
      const pre1 = document.createElement('link');
      pre1.rel = 'preconnect';
      pre1.href = 'https://fonts.googleapis.com';
      document.head.appendChild(pre1);
      const pre2 = document.createElement('link');
      pre2.rel = 'preconnect';
      pre2.href = 'https://fonts.gstatic.com';
      pre2.crossOrigin = 'anonymous';
      document.head.appendChild(pre2);
    }
    const link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    link.href = HREF;
    document.head.appendChild(link);
  }, []);

  return null;
}
