import { absoluteUrl } from '@/lib/urls';

/**
 * True when this document is running inside an iframe (e.g. rsamdio.org embed).
 * Cross-origin parents throw on `window.top` access — treat that as embedded.
 */
export function isEmbeddedFrame(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * When running inside an iframe, open the path in a new top-level tab and return true.
 * Otherwise return false so the caller can use normal in-app navigation.
 */
export function openInNewTabIfEmbedded(
  path: string,
  event?: { preventDefault(): void }
): boolean {
  if (!isEmbeddedFrame()) return false;
  event?.preventDefault();
  const href = absoluteUrl(path);
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}
