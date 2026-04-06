/**
 * PubHub Explore (index.html) — public catalog + reader only. No auth.
 */
import { renderShelf, syncReaderDeepLink } from './shelf.js';
import {
  closeReader,
  flipPrev,
  flipNext,
  flipFirst,
  flipLast,
  zoomIn,
  zoomOut,
  resetReaderZoom,
  readerToggleFullscreen,
  readerSubmitPageJump
} from './viewer.js';

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

readerPrev?.addEventListener('click', flipPrev);
readerNext?.addEventListener('click', flipNext);
readerFirst?.addEventListener('click', flipFirst);
readerLast?.addEventListener('click', flipLast);
readerZoomIn?.addEventListener('click', zoomIn);
readerZoomOut?.addEventListener('click', zoomOut);
readerCloseBtn?.addEventListener('click', closeReader);
readerFitReset?.addEventListener('click', resetReaderZoom);
readerFullscreen?.addEventListener('click', readerToggleFullscreen);
readerPageJumpGo?.addEventListener('click', readerSubmitPageJump);
readerPageJump?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    readerSubmitPageJump();
  }
});

renderShelf();
window.addEventListener('hashchange', syncReaderDeepLink);
