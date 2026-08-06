'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  isEmbeddedFrame,
  openInNewTabIfEmbedded
} from '@/lib/client/is-embedded';

type Props = {
  /** When provided, hidden while escaping so series UI never paints in the iframe. */
  children?: ReactNode;
};

/**
 * When a `/p/…` route loads inside an iframe, open the same URL in a new tab
 * and send the iframe back to Home so the host preview chrome stays intact.
 */
export function FramedDeepLinkEscape({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const startedRef = useRef(false);
  const [escaping, setEscaping] = useState(false);

  useEffect(() => {
    if (!isEmbeddedFrame()) return;
    setEscaping(true);
    if (startedRef.current) return;
    startedRef.current = true;
    const path = pathname || '/';
    openInNewTabIfEmbedded(path);
    router.replace('/');
  }, [pathname, router]);

  if (escaping) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-500">
        Opening publication…
      </div>
    );
  }

  return children ? <>{children}</> : null;
}
