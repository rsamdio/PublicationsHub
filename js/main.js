/**
 * PubHub Explore (index.html) — public catalog + reader only. No auth.
 */
import './hydrate-pub-icons.js';
import { renderShelf, syncReaderDeepLink } from './shelf.js';

let viewerModPromise = null;
function getViewerModule() {
  if (!viewerModPromise) viewerModPromise = import('./viewer.js');
  return viewerModPromise;
}

const readerPrev = document.getElementById('reader-prev');
const readerNext = document.getElementById('reader-next');
const readerFirst = document.getElementById('reader-first');
const readerLast = document.getElementById('reader-last');
const readerZoomIn = document.getElementById('reader-zoom-in');
const readerZoomOut = document.getElementById('reader-zoom-out');
const readerCloseBtn = document.getElementById('reader-close');
const readerFitReset = document.getElementById('reader-fit-reset');
const readerFullscreen = document.getElementById('reader-fullscreen');
const readerPageJumpGo = document.getElementById('reader-page-jump-go');
const readerPageJump = document.getElementById('reader-page-jump');

readerPrev?.addEventListener('click', () => getViewerModule().then((m) => m.flipPrev()));
readerNext?.addEventListener('click', () => getViewerModule().then((m) => m.flipNext()));
readerFirst?.addEventListener('click', () => getViewerModule().then((m) => m.flipFirst()));
readerLast?.addEventListener('click', () => getViewerModule().then((m) => m.flipLast()));
readerZoomIn?.addEventListener('click', () => getViewerModule().then((m) => m.zoomIn()));
readerZoomOut?.addEventListener('click', () => getViewerModule().then((m) => m.zoomOut()));
readerCloseBtn?.addEventListener('click', () => getViewerModule().then((m) => m.closeReader()));
readerFitReset?.addEventListener('click', () => getViewerModule().then((m) => m.resetReaderZoom()));
readerFullscreen?.addEventListener('click', () => getViewerModule().then((m) => m.readerToggleFullscreen()));
readerPageJumpGo?.addEventListener('click', () => getViewerModule().then((m) => m.readerSubmitPageJump()));
readerPageJump?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    getViewerModule().then((m) => m.readerSubmitPageJump());
  }
});

void renderShelf();
window.addEventListener('hashchange', () => void syncReaderDeepLink());
