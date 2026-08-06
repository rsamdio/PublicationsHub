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
 * Mark html / reader shell / #reader-view for embed-only CSS.
 * Idempotent; clears attrs when not embedded.
 */
export function applyReaderEmbedAttrs(): void {
  if (typeof document === 'undefined') return;
  const embedded = isEmbeddedFrame();
  const html = document.documentElement;
  const shell = document.querySelector('.reader-route-shell');
  const rv = document.getElementById('reader-view');

  if (embedded) {
    html.dataset.readerEmbed = 'true';
    if (shell instanceof HTMLElement) shell.dataset.readerEmbed = 'true';
    if (rv) rv.dataset.readerEmbed = 'true';
  } else {
    delete html.dataset.readerEmbed;
    if (shell instanceof HTMLElement) delete shell.dataset.readerEmbed;
    if (rv) delete rv.dataset.readerEmbed;
  }
}

/** Clear embed attrs (route unmount). */
export function clearReaderEmbedAttrs(): void {
  if (typeof document === 'undefined') return;
  delete document.documentElement.dataset.readerEmbed;
  const shell = document.querySelector('.reader-route-shell');
  if (shell instanceof HTMLElement) delete shell.dataset.readerEmbed;
  const rv = document.getElementById('reader-view');
  if (rv) delete rv.dataset.readerEmbed;
}
