/**
 * Reader: PDF.js + StPageFlip.
 * - Progressive first-spread render; remaining pages fill in via a priority background queue.
 * - Same-origin vendor assets under /vendor/pdfjs/{version}/ and /vendor/page-flip/{version}/
 *   (bump folder + constants together when upgrading).
 * - HiDPI rendering (Mozilla-recommended outputScale + transform; avoids blurry text).
 * - Load generation guard: closing or opening again invalidates in-flight work (fixes stuck loading).
 * - PDFDocumentProxy.destroy() + per-page cleanup() to release workers/memory.
 * - No full PDF re-fetch on window resize/fullscreen; PageFlip rebuilds only when single/spread mode flips.
 * - Remount #flipbook-container after PageFlip.destroy() (the library removes the host node from the DOM).
 * - Pan/zoom: #flipbook-pan uses translate+scale; pinch + one-finger pan (zoomed), Ctrl+wheel zoom, wheel pan when zoomed, mouse drag when zoomed.
 */
import {
  formatReadLocationHash,
  parseReadRefFromHash,
  isReaderLocationHash,
  readEditionRefFromHash,
  editionPath,
  publicationPath,
  parseEditionPath,
  parsePublicationPath,
  isReservedSlug,
  getSeriesCanonicalIdForPublication
} from '@/lib/urls';
import { pubIconSvgOnly } from '@/lib/catalog/icons-public.js';

export { readEditionRefFromHash };

/** Bump folder + these constants together when upgrading (files live under public/vendor/). */
const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `/vendor/pdfjs/${PDFJS_VERSION}`;
const PDFJS_SCRIPT = `${PDFJS_BASE}/pdf.min.js`;
const PDFJS_WORKER = `${PDFJS_BASE}/pdf.worker.min.js`;
const PDFJS_VIEWER_CSS = `${PDFJS_BASE}/pdf_viewer.min.css`;
const PAGEFLIP_SCRIPT = '/vendor/page-flip/2.0.7/page-flip.browser.min.js';
/** Same-origin path (all entry HTML lives at site root). */
const ST_PAGEFLIP_CSS = '/st-page-flip.css';
/** Cap HiDPI scale for faster first paint + background renders. */
const MAX_OUTPUT_SCALE = 1.75;

let pdfViewerCssPromise = null;
let pageFlipCssPromise = null;

/** Injects pdf.js viewer CSS on first reader open (avoids render-blocking on library pages). */
function ensurePdfViewerCss() {
  if (typeof document === 'undefined') return Promise.resolve();
  const id = 'pdfjs-viewer-css';
  if (document.getElementById(id)) return Promise.resolve();
  if (pdfViewerCssPromise) return pdfViewerCssPromise;
  pdfViewerCssPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = PDFJS_VIEWER_CSS;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return pdfViewerCssPromise;
}

/** Injects StPageFlip base CSS on first reader open (see `/st-page-flip.css`). */
function ensurePageFlipCss() {
  if (typeof document === 'undefined') return Promise.resolve();
  const id = 'st-page-flip-css';
  if (document.getElementById(id)) return Promise.resolve();
  if (pageFlipCssPromise) return pageFlipCssPromise;
  pageFlipCssPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = ST_PAGEFLIP_CSS;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return pageFlipCssPromise;
}

function getPageFlipCtor() {
  return (window.St && window.St.PageFlip) || window.PageFlip || window.StPageFlip || window.pageFlip;
}

let pageFlipLoadPromise = null;

function ensurePageFlip() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (getPageFlipCtor()) return Promise.resolve();
  if (pageFlipLoadPromise) return pageFlipLoadPromise;
  pageFlipLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PAGEFLIP_SCRIPT;
    script.onload = () => {
      if (getPageFlipCtor()) resolve();
      else reject(new Error('PageFlip not found'));
    };
    script.onerror = () => reject(new Error('Failed to load PageFlip'));
    document.head.appendChild(script);
  });
  return pageFlipLoadPromise;
}

let pdfjsLib = null;
let pdfjsLoadPromise = null;

export function ensurePdfJs() {
  if (typeof window.pdfjsLib !== 'undefined' && window.pdfjsLib.getDocument) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(window.pdfjsLib);
  }
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_SCRIPT;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      } else reject(new Error('PDF.js not found'));
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
  return pdfjsLoadPromise;
}

/**
 * Idempotent warm-up of pdf.js + page-flip + CSS (same-origin vendor assets).
 * Safe to call on mount / hover before openReader.
 */
export function preloadReaderAssets() {
  if (typeof window === 'undefined') return Promise.resolve();
  return Promise.all([
    ensurePdfViewerCss(),
    ensurePageFlipCss(),
    ensurePdfJs(),
    ensurePageFlip()
  ]).then(() => undefined);
}

/** @type {Map<string, Promise<void>>} */
const pdfPrefetchInflight = new Map();

/**
 * Intent-only PDF warm-up (hover Read / publication / edition page).
 * Uses link prefetch + a small Range GET so CORS/Range are hot without downloading
 * the entire file (large editions stay progressive via PDF.js 206s).
 * @param {string | null | undefined} pdfUrl
 */
export function prefetchEditionPdf(pdfUrl) {
  const url = String(pdfUrl || '').trim();
  if (!url || typeof window === 'undefined') return Promise.resolve();

  try {
    const linkId = `pubhub-pdf-prefetch-${btoa(unescape(encodeURIComponent(url))).slice(0, 48)}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'prefetch';
      link.as = 'fetch';
      link.href = url;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  } catch (_) {}

  const existing = pdfPrefetchInflight.get(url);
  if (existing) return existing;

  const p = fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'force-cache',
    headers: { Range: 'bytes=0-131071' },
    // Priority Hint — ignored when unsupported
    priority: 'low'
  })
    .then((res) => (res.ok || res.status === 206 ? res.arrayBuffer() : null))
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      window.setTimeout(() => {
        if (pdfPrefetchInflight.get(url) === p) pdfPrefetchInflight.delete(url);
      }, 120000);
    });
  pdfPrefetchInflight.set(url, p);
  return p;
}

/**
 * Warm vendor assets + start PDF byte prefetch for a known edition URL.
 * @param {string | null | undefined} pdfUrl
 */
export function warmReaderForEdition(pdfUrl) {
  const assets = preloadReaderAssets();
  const pdf = prefetchEditionPdf(pdfUrl);
  return Promise.all([assets, pdf]).then(() => undefined);
}

let flipBook = null;
let readerView = null;
let flipbookContainer = null;
let readerLoading = null;
let readerProgress = null;
let readerLoadingDetail = null;
let readerError = null;
let readerPageInfo = null;
let zoomLevel = 1;
let panX = 0;
let panY = 0;
/**
 * Element-scoped bind guards. The reader chrome DOM is recreated on a React
 * remount, so tracking the bound node (rather than a boolean) lets us rebind to
 * the fresh element while never double-binding the same live node.
 * @type {HTMLElement | null}
 */
let gesturesBoundEl = null;
/** @type {{ d0: number, z0: number } | null} */
let pinchState = null;
/** @type {{ x: number, y: number, ox: number, oy: number } | null} */
let panTouch = null;
/** @type {{ pointerId: number, x: number, y: number, ox: number, oy: number } | null} */
let mousePan = null;
let pageWidth = 400;
let pageHeight = 560;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const MIN_ZOOM_PCT = 50;
const MAX_ZOOM_PCT = 250;
const ZOOM_STEP = 0.25;

/** Invalidates in-flight openReader work when the user closes or opens another edition. */
let loadGeneration = 0;

/** Last page index used for flip SFX (play when index changes, including first user flip). */
let lastFlipSoundPageIndex = -1;

/** @type {HTMLElement | null} */
let downloadBoundEl = null;
/** @type {HTMLElement | null} */
let themeToggleBoundEl = null;
let chromeControlsBound = false;

const READER_THEME_STORAGE_KEY = 'pubhub-reader-theme';

/** @returns {'light' | 'dark'} */
function getStoredReaderTheme() {
  try {
    const v = localStorage.getItem(READER_THEME_STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch (_) {}
  return 'light';
}

/** @param {'light' | 'dark'} theme */
function syncReaderThemeToggleUi(theme) {
  const btn = document.getElementById('reader-theme-toggle');
  if (!btn) return;
  const nextLabel = theme === 'light' ? 'Switch to dark reader' : 'Switch to light reader';
  btn.title = nextLabel;
  btn.setAttribute('aria-label', nextLabel);
  const iconName = theme === 'light' ? 'dark_mode' : 'light_mode';
  const pub = btn.querySelector('.pub-icon');
  if (pub) {
    pub.innerHTML = pubIconSvgOnly(iconName);
    return;
  }
  const material = btn.querySelector('.material-icons');
  if (material) material.textContent = iconName;
}

/** @param {'light' | 'dark'} theme */
function applyReaderTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  const rv = document.getElementById('reader-view');
  if (rv) rv.dataset.readerTheme = t;
  const shell = document.querySelector('.reader-route-shell');
  if (shell instanceof HTMLElement) shell.dataset.readerTheme = t;
  syncReaderThemeToggleUi(t);
}

function persistReaderTheme(theme) {
  try {
    localStorage.setItem(READER_THEME_STORAGE_KEY, theme);
  } catch (_) {}
}

function toggleReaderTheme() {
  const rv = document.getElementById('reader-view');
  const current = rv?.dataset?.readerTheme === 'dark' ? 'dark' : 'light';
  const next = current === 'light' ? 'dark' : 'light';
  applyReaderTheme(next);
  persistReaderTheme(next);
}

function bindReaderThemeToggleOnce() {
  const btn = document.getElementById('reader-theme-toggle');
  if (!btn || themeToggleBoundEl === btn) return;
  themeToggleBoundEl = btn;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleReaderTheme();
  });
}

/** Optional close hook (standalone edition page uses Next router navigation). */
let readerCloseHandler = null;
/** True while page-mode reader holds html/body.reader-page-active (must not depend on #reader-view still existing). */
let readerPageScrollLocked = false;

/** @type {AudioContext | null} */
let flipAudioCtx = null;

/** Cached PDF for resize relayout (destroyed on close). */
let activePdfDoc = null;

/** Page-1 PDF units (scale 1) for fast relayout sizing without re-fetching page 1. */
let cachedPdfBaseSize = null;

/** Last opened publication (for resize). */
let currentPublication = null;

/**
 * Last applied spread vs single-page mode (null until first PageFlip init).
 * @type {boolean | null}
 */
let currentLayoutIsSpread = null;

let layoutRelayoutTimer = null;
let layoutSettleTimer = null;
let layoutListenersBound = false;

/**
 * Two-page spread when wide enough, or phone landscape above a width floor.
 * Uses layout viewport (window). Never visualViewport — keyboard/pinch must not flip mode.
 * @returns {boolean}
 */
function shouldUseSpreadLayout() {
  if (typeof window === 'undefined') return true;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w >= 768 || (w > h && w >= 560);
}

/**
 * Background page-render queue for progressive open.
 * @type {{
 *   myLoad: number,
 *   pdfDoc: object,
 *   pageWidth: number,
 *   pageHeight: number,
 *   shells: HTMLElement[],
 *   ready: Set<number>,
 *   pending: number[],
 *   priority: number[],
 *   running: boolean,
 *   cancelled: boolean
 * } | null}
 */
let pageRenderQueue = null;

let keyboardBound = false;
/** @type {HTMLElement | null} */
let zoomInputBoundEl = null;
let visualViewportResizeTimer = null;

/**
 * Serialize PDF render + PageFlip setup so a window resize relayout cannot run in parallel
 * with a second "Read" open (both used to share the same loadGeneration and corrupted the DOM).
 */
let flipOpChain = Promise.resolve();

function enqueueReaderOp(fn) {
  flipOpChain = flipOpChain.then(() => fn()).catch((err) => {
    getReaderElements();
    setReaderError(err?.message || 'Reader failed');
  });
  return flipOpChain;
}

function ensureFlipbookPanLayer() {
  const wrapper = document.getElementById('flipbook-wrapper');
  if (!wrapper) return null;
  let pan = document.getElementById('flipbook-pan');
  let el = document.getElementById('flipbook-container');
  if (!pan) {
    pan = document.createElement('div');
    pan.id = 'flipbook-pan';
    pan.className = 'relative transition-transform duration-300 ease-out will-change-transform';
    if (el && el.parentNode === wrapper) {
      wrapper.insertBefore(pan, el);
      pan.appendChild(el);
    } else {
      wrapper.appendChild(pan);
    }
  } else if (el && el.parentNode !== pan && el.parentNode) {
    pan.appendChild(el);
  }
  return pan;
}

/**
 * StPageFlip.destroy() calls block.remove(), which detaches #flipbook-container from the document.
 * Recreate it under #flipbook-pan → #flipbook-wrapper so the next openReader() can run.
 */
function ensureFlipbookContainerMounted() {
  const wrapper = document.getElementById('flipbook-wrapper');
  if (!wrapper) return null;
  ensureFlipbookPanLayer();
  const pan = document.getElementById('flipbook-pan');
  let el = document.getElementById('flipbook-container');
  if (el && el.isConnected) return el;
  el = document.createElement('div');
  el.id = 'flipbook-container';
  el.className = 'relative';
  (pan || wrapper).appendChild(el);
  return el;
}

function touchDistance(a, b) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function syncReaderZoomClass() {
  const rv = document.getElementById('reader-view');
  if (!rv) return;
  rv.classList.toggle('reader-zoomed', zoomLevel > 1.02);
}

function bindReaderPointerGesturesOnce() {
  const wrapper = document.getElementById('flipbook-wrapper');
  if (!wrapper || gesturesBoundEl === wrapper) return;
  gesturesBoundEl = wrapper;

  wrapper.addEventListener(
    'wheel',
    (e) => {
      if (!isReaderOpen()) return;
      const path = e.composedPath();
      if (
        path.some((n) => {
          const id = n && typeof n === 'object' && 'id' in n ? /** @type {Element} */ (n).id : '';
          return id === 'reader-page-jump' || id === 'reader-zoom-input';
        })
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06;
        setZoom(zoomLevel * factor);
        return;
      }
      if (zoomLevel > 1.02) {
        e.preventDefault();
        panX -= e.deltaX;
        panY -= e.deltaY;
        applyTransform();
      }
    },
    { passive: false }
  );

  wrapper.addEventListener(
    'touchstart',
    (e) => {
      if (!isReaderOpen()) return;
      if (e.touches.length >= 2) {
        panTouch = null;
        const a = e.touches[0];
        const b = e.touches[1];
        pinchState = { d0: touchDistance(a, b), z0: zoomLevel };
      } else if (e.touches.length === 1 && zoomLevel > 1.02) {
        pinchState = null;
        const t = e.touches[0];
        panTouch = { x: t.clientX, y: t.clientY, ox: panX, oy: panY };
      }
    },
    { passive: true }
  );

  wrapper.addEventListener(
    'touchmove',
    (e) => {
      if (!isReaderOpen()) return;
      if (pinchState && e.touches.length >= 2) {
        e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const d = touchDistance(a, b);
        if (pinchState.d0 > 1 && d > 0) {
          setZoom(pinchState.z0 * (d / pinchState.d0));
        }
        return;
      }
      if (panTouch && e.touches.length === 1 && zoomLevel > 1.02) {
        e.preventDefault();
        const t = e.touches[0];
        panX = panTouch.ox + (t.clientX - panTouch.x);
        panY = panTouch.oy + (t.clientY - panTouch.y);
        applyTransform();
      }
    },
    { passive: false }
  );

  wrapper.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchState = null;
    if (e.touches.length === 0) panTouch = null;
  });

  wrapper.addEventListener('touchcancel', () => {
    pinchState = null;
    panTouch = null;
  });

  wrapper.addEventListener('pointerdown', (e) => {
    if (!isReaderOpen() || e.pointerType !== 'mouse' || e.button !== 0) return;
    if (zoomLevel <= 1.02) return;
    const panLayer = document.getElementById('flipbook-pan');
    if (!panLayer || !panLayer.contains(e.target)) return;
    e.preventDefault();
    mousePan = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, ox: panX, oy: panY };
    try {
      wrapper.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  wrapper.addEventListener('pointermove', (e) => {
    if (!mousePan || e.pointerId !== mousePan.pointerId) return;
    panX = mousePan.ox + (e.clientX - mousePan.x);
    panY = mousePan.oy + (e.clientY - mousePan.y);
    applyTransform();
  });

  const endMousePan = (e) => {
    if (!mousePan || e.pointerId !== mousePan.pointerId) return;
    mousePan = null;
    try {
      wrapper.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };
  wrapper.addEventListener('pointerup', endMousePan);
  wrapper.addEventListener('pointercancel', endMousePan);
}

function isReaderPageMode() {
  const rv = document.getElementById('reader-view');
  return rv?.dataset?.readerMode === 'page';
}

/**
 * Register a close handler (e.g. navigate back to series). Pass null to clear.
 * @param {(() => void) | null} fn
 */
export function setReaderCloseHandler(fn) {
  readerCloseHandler = typeof fn === 'function' ? fn : null;
}

function setReaderLocationHash(publication) {
  if (!publication?.id) return;
  // Standalone edition page already owns `/[seriesSlug]/[editionSlug]` — do not rewrite.
  if (isReaderPageMode()) return;
  // Public App Router paths: /[seriesSlug]/[editionSlug]
  if (typeof location !== 'undefined') {
    const rootSegment = parsePublicationPath(location.pathname);
    if (rootSegment && !isReservedSlug(rootSegment)) {
      const sid =
        publication._seriesSlug ||
        publication.series_slug ||
        publication._seriesCanonicalId ||
        getSeriesCanonicalIdForPublication(publication) ||
        publication.id;
      const eid = publication.slug || publication.id;
      const next = editionPath(String(sid), String(eid));
      const cur = `${location.pathname}${location.search}${location.hash || ''}`;
      if (cur === next) return;
      history.replaceState(null, '', next);
      return;
    }
  }
  const ref = publication.slug || publication.id;
  const next = formatReadLocationHash(ref);
  if (!next || location.hash === next) return;
  const url = `${location.pathname}${location.search}${next}`;
  history.replaceState(null, '', url);
}

function clearReaderLocationHash() {
  // Page-mode close navigates via setReaderCloseHandler / Next router.
  if (isReaderPageMode()) return;
  if (typeof location !== 'undefined' && location.pathname !== '/') {
    const rootSegment = parsePublicationPath(location.pathname);
    if (rootSegment && !isReservedSlug(rootSegment)) {
      const parsed = parseEditionPath(location.pathname);
      if (parsed?.seriesId) {
        history.replaceState(null, '', publicationPath(parsed.seriesId));
        return;
      }
      return;
    }
  }
  const h = location.hash || '';
  if (!h || !isReaderLocationHash(h)) return;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}

function lockReaderPageScroll(lock) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const body = document.body;
  if (!html || !body) return;
  if (lock) {
    html.classList.add('reader-page-active');
    body.classList.add('reader-page-active');
    readerPageScrollLocked = true;
  } else {
    html.classList.remove('reader-page-active');
    body.classList.remove('reader-page-active');
    readerPageScrollLocked = false;
  }
}

/** Clear page-mode scroll lock even if #reader-view was already unmounted (browser Back). */
export function unlockReaderPageScroll() {
  lockReaderPageScroll(false);
}

/**
 * @param {(ref: string) => { id?: string, title: string, pdf_url: string, created_at?: string } | null | undefined} resolve
 */
export function tryOpenReaderFromHash(resolve) {
  const ref = readEditionRefFromHash();
  if (!ref) {
    if (isReaderOpen()) closeReader();
    return;
  }
  const pub = typeof resolve === 'function' ? resolve(ref) : null;
  if (!pub) return;

  // RTDB (studio/org mirror) can emit many times per second; reopening would tear down PDF.js + PageFlip each time.
  if (isReaderOpen() && currentPublication) {
    const sameId = String(pub.id || '').trim() === String(currentPublication.id || '').trim();
    const samePdf = String(pub.pdf_url || '').trim() === String(currentPublication.pdf_url || '').trim();
    if (sameId && samePdf && String(pub.id || '').trim()) {
      getReaderElements();
      const hasFlipbook = !!flipBook;
      const hasErr = !!(readerError && !readerError.classList.contains('hidden'));
      if (hasFlipbook || !hasErr) return;
    }
  }
  openReader(pub);
}

function getReaderElements() {
  readerView = document.getElementById('reader-view');
  ensureFlipbookContainerMounted();
  flipbookContainer = document.getElementById('flipbook-container');
  readerLoading = document.getElementById('reader-loading');
  readerProgress = document.getElementById('reader-progress');
  readerLoadingDetail = document.getElementById('reader-loading-detail');
  readerError = document.getElementById('reader-error');
  readerPageInfo = document.getElementById('reader-page-info');
}

function bindReaderZoomInputOnce() {
  const el = document.getElementById('reader-zoom-input');
  if (!el || zoomInputBoundEl === el) return;
  zoomInputBoundEl = el;
  const applyFromInput = () => {
    let v = parseInt(String(el.value).trim(), 10);
    if (!Number.isFinite(v)) {
      el.value = String(Math.round(zoomLevel * 100));
      return;
    }
    v = Math.min(MAX_ZOOM_PCT, Math.max(MIN_ZOOM_PCT, v));
    setZoom(v / 100);
  };
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFromInput();
      el.blur();
    }
  });
  el.addEventListener('blur', () => applyFromInput());
}

function showReaderView() {
  getReaderElements();
  applyReaderTheme(getStoredReaderTheme());
  if (readerView) {
    readerView.classList.remove('hidden');
    readerView.classList.add('flex');
  }
  if (isReaderPageMode()) lockReaderPageScroll(true);
  if (readerLoading) {
    readerLoading.classList.remove('hidden');
    readerLoading.classList.add('flex');
  }
  if (readerError) readerError.classList.add('hidden');
  if (readerProgress) readerProgress.style.width = '0%';
  if (readerLoadingDetail) readerLoadingDetail.textContent = '';
}

function hideReaderLoading() {
  getReaderElements();
  if (readerLoading) {
    readerLoading.classList.add('hidden');
    readerLoading.classList.remove('flex');
  }
  clearReaderLoadingCover();
}

function cancelPageRenderQueue() {
  if (pageRenderQueue) {
    pageRenderQueue.cancelled = true;
    pageRenderQueue = null;
  }
}

function prioritizePageRender(oneBasedPages) {
  const q = pageRenderQueue;
  if (!q || q.cancelled) return;
  for (let i = oneBasedPages.length - 1; i >= 0; i--) {
    const n = oneBasedPages[i];
    if (!Number.isFinite(n) || n < 1 || q.ready.has(n)) continue;
    const pi = q.priority.indexOf(n);
    if (pi >= 0) q.priority.splice(pi, 1);
    const pend = q.pending.indexOf(n);
    if (pend >= 0) q.pending.splice(pend, 1);
    q.priority.unshift(n);
  }
  void drainPageRenderQueue();
}

async function drainPageRenderQueue() {
  const q = pageRenderQueue;
  if (!q || q.cancelled || q.running) return;
  q.running = true;
  try {
    while (!q.cancelled && pageRenderQueue === q) {
      const next =
        q.priority.length > 0 ? q.priority.shift() : q.pending.length > 0 ? q.pending.shift() : null;
      if (next == null) break;
      if (q.ready.has(next)) continue;
      const shell = q.shells[next - 1];
      if (!shell) continue;
      try {
        await renderPageIntoShell(q.pdfDoc, next, shell, q.pageWidth, q.pageHeight);
      } catch (_) {
        /* leave shell as placeholder; continue */
      }
      if (q.cancelled || pageRenderQueue !== q || q.myLoad !== loadGeneration) return;
      q.ready.add(next);
      if (flipBook) {
        updatePageInfo();
        syncPageJumpInput();
      }
    }
  } finally {
    if (pageRenderQueue === q) q.running = false;
  }
}

/**
 * Destroy PageFlip + page shells only. Keeps activePdfDoc / currentPublication for viewport relayout.
 * PageFlip.destroy() removes #flipbook-container from the DOM; remount it before clearing pages.
 */
function tearDownFlipbookOnly() {
  cancelPageRenderQueue();
  if (flipBook) {
    try {
      flipBook.destroy();
    } catch (_) {}
    flipBook = null;
  }
  ensureFlipbookContainerMounted();
  flipbookContainer = document.getElementById('flipbook-container');
  if (flipbookContainer) flipbookContainer.innerHTML = '';
  lastFlipSoundPageIndex = -1;
  currentLayoutIsSpread = null;
}

/**
 * Tear down flipbook + PDF. Does not hide the overlay.
 */
function tearDownReaderContent() {
  tearDownFlipbookOnly();
  if (activePdfDoc) {
    try {
      activePdfDoc.destroy();
    } catch (_) {}
    activePdfDoc = null;
  }
  cachedPdfBaseSize = null;
  currentPublication = null;
  clearReaderLoadingCover();
}

function hideReaderView() {
  getReaderElements();
  loadGeneration += 1;
  clearReaderLocationHash();
  if (visualViewportResizeTimer) {
    clearTimeout(visualViewportResizeTimer);
    visualViewportResizeTimer = null;
  }
  if (layoutRelayoutTimer) {
    clearTimeout(layoutRelayoutTimer);
    layoutRelayoutTimer = null;
  }
  if (layoutSettleTimer) {
    clearTimeout(layoutSettleTimer);
    layoutSettleTimer = null;
  }
  setPageJumpOpen(false);
  pinchState = null;
  panTouch = null;
  mousePan = null;
  panX = 0;
  panY = 0;
  if (readerView) readerView.classList.remove('reader-zoomed');
  const panEl = document.getElementById('flipbook-pan');
  if (panEl) panEl.style.transform = '';
  tearDownReaderContent();
  const pageMode = isReaderPageMode();
  if (readerView && !pageMode) {
    readerView.classList.add('hidden');
    readerView.classList.remove('flex');
  }
  // Unlock via module flag — do not require #reader-view (gone on browser Back unmount).
  if (readerPageScrollLocked) lockReaderPageScroll(false);
  if (readerLoading) {
    readerLoading.classList.add('hidden');
    readerLoading.classList.remove('flex');
  }
}

/**
 * Largest page slot (CSS px) that fits the wrapper and matches this PDF page’s aspect ratio.
 * Spread viewports: each page may use up to half the available width.
 */
function getViewportPageSizeForPdf(pdfW, pdfH) {
  const wrapper = document.getElementById('flipbook-wrapper');
  if (!wrapper) return { pageWidth: 400, pageHeight: 560 };
  const paddingX = 12;
  const paddingY = 12;
  const availW = Math.max(0, wrapper.clientWidth - paddingX * 2);
  const availH = Math.max(0, wrapper.clientHeight - paddingY * 2);
  const useSpread = shouldUseSpreadLayout();

  const pw = Math.max(1, pdfW);
  const ph = Math.max(1, pdfH);

  if (!useSpread) {
    const maxW = Math.max(160, availW);
    const maxH = Math.max(200, availH);
    let scale = Math.min(maxW / pw, maxH / ph);
    const minScale = Math.max(160 / pw, 200 / ph);
    if (scale < minScale) scale = minScale;
    return { pageWidth: pw * scale, pageHeight: ph * scale };
  }

  const maxWEach = Math.max(110, availW / 2);
  const maxH = Math.max(220, availH);
  let scale = Math.min(maxWEach / pw, maxH / ph);
  const minScale = Math.max(200 / pw, 280 / ph);
  if (scale < minScale) scale = minScale;
  return { pageWidth: pw * scale, pageHeight: ph * scale };
}

/** Max chars of edition title shown in the loading-detail download line. */
const DOWNLOAD_LABEL_TITLE_MAX = 44;

/**
 * Personalized status while PDF bytes stream in.
 * @param {{ title?: string } | null | undefined} pub
 */
function downloadProgressLabel(pub) {
  const raw = pub?.title != null ? String(pub.title).trim() : '';
  if (!raw) return 'Downloading this edition…';
  const title =
    raw.length > DOWNLOAD_LABEL_TITLE_MAX
      ? `${raw.slice(0, DOWNLOAD_LABEL_TITLE_MAX - 1).trimEnd()}…`
      : raw;
  return `Downloading ${title}…`;
}

/**
 * Empty page shell for StPageFlip (filled later by progressive render).
 * Page 1 may show the edition cover as an instant stand-in until the canvas is ready.
 * @param {number} pageNum
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @param {string} [coverPlaceholderUrl]
 */
function createPageShell(pageNum, targetWidth, targetHeight, coverPlaceholderUrl) {
  const div = document.createElement('div');
  div.className = 'page';
  div.dataset.page = String(pageNum);
  div.dataset.ready = '0';
  div.setAttribute('aria-busy', 'true');
  div.setAttribute('aria-label', 'Rendering page');
  div.style.width = `${targetWidth}px`;
  div.style.height = `${targetHeight}px`;
  div.style.backgroundColor = '#e5e7eb';
  div.style.overflow = 'hidden';
  div.style.boxShadow = '0 2px 12px rgba(0,0,0,0.2)';
  const inner = document.createElement('div');
  inner.style.width = '100%';
  inner.style.height = '100%';
  inner.style.display = 'flex';
  inner.style.alignItems = 'center';
  inner.style.justifyContent = 'center';
  inner.style.background = '#f3f4f6';
  const coverUrl = pageNum === 1 ? String(coverPlaceholderUrl || '').trim() : '';
  if (coverUrl) {
    const img = document.createElement('img');
    img.src = coverUrl;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.className = 'reader-page-cover-placeholder';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.display = 'block';
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    inner.style.background = '#fff';
    inner.appendChild(img);
  } else {
    const spinner = document.createElement('span');
    spinner.className = 'reader-page-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    inner.appendChild(spinner);
  }
  div.appendChild(inner);
  return div;
}

/**
 * Renders one PDF page into an existing .page shell (StPageFlip). HiDPI via outputScale + transform.
 * Updates the inner slot in place so StPageFlip keeps a stable page node reference.
 */
async function renderPageIntoShell(pdfDoc, pageNum, shell, targetWidth, targetHeight) {
  const pdfPage = await pdfDoc.getPage(pageNum);
  const base = pdfPage.getViewport({ scale: 1 });
  const scaleFit = Math.min(targetWidth / base.width, targetHeight / base.height);
  const viewport = pdfPage.getViewport({ scale: scaleFit });
  const outputScale = Math.min(window.devicePixelRatio || 1, MAX_OUTPUT_SCALE);

  let inner = shell.firstElementChild;
  if (!inner) {
    inner = document.createElement('div');
    inner.style.width = '100%';
    inner.style.height = '100%';
    inner.style.display = 'flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    shell.appendChild(inner);
  }
  inner.style.background = 'transparent';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const sw = Math.floor(viewport.width * outputScale);
  const sh = Math.floor(viewport.height * outputScale);
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const cw = Math.round(viewport.width);
  const ch = Math.round(viewport.height);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.style.display = 'block';

  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
  const renderTask = pdfPage.render({
    canvasContext: ctx,
    viewport,
    transform,
    background: '#ffffff'
  });
  await renderTask.promise;
  try {
    pdfPage.cleanup();
  } catch (_) {}

  shell.style.backgroundColor = '#d1d5db';
  inner.replaceChildren(canvas);
  shell.dataset.ready = '1';
  shell.setAttribute('aria-busy', 'false');
  shell.removeAttribute('aria-label');
}

function isPageShellReady(oneBased) {
  if (!pageRenderQueue) return true;
  if (pageRenderQueue.cancelled) return true;
  return pageRenderQueue.ready.has(oneBased);
}

/**
 * Wait until listed 1-based pages are ready (or queue cancelled / timeout).
 * @param {number[]} oneBasedPages
 * @param {number} [timeoutMs]
 */
function waitForPagesReady(oneBasedPages, timeoutMs = 4000) {
  const needed = oneBasedPages.filter((n) => Number.isFinite(n) && n >= 1);
  if (!needed.length || !pageRenderQueue) return Promise.resolve();
  prioritizePageRender(needed);
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (!pageRenderQueue || pageRenderQueue.cancelled) {
        resolve();
        return;
      }
      if (needed.every((n) => pageRenderQueue.ready.has(n) || n > pageRenderQueue.shells.length)) {
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

function clearReaderLoadingCover() {
  const img = document.getElementById('reader-loading-cover');
  if (img) img.remove();
}

/** Show edition cover behind the loader while PDF first-spread renders. */
function setReaderLoadingCover(publication) {
  getReaderElements();
  if (!readerLoading) return;
  clearReaderLoadingCover();
  // Prefer full cover for fidelity; thumb is a fine fallback.
  const url = String(publication?.cover_url || publication?.cover_thumb_url || '').trim();
  if (!url) return;
  const img = document.createElement('img');
  img.id = 'reader-loading-cover';
  img.src = url;
  img.alt = '';
  img.decoding = 'async';
  img.fetchPriority = 'high';
  img.className =
    'absolute inset-0 w-full h-full object-contain opacity-40 pointer-events-none select-none';
  readerLoading.insertBefore(img, readerLoading.firstChild);
}

function sanitizeFilenameSegment(s, maxLen) {
  return String(s || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * `<<Edition title>> - <<Publication name>>.pdf` when series/publication title exists.
 * @param {{ title?: string, series_title?: string | null }} pub
 */
function pdfDownloadFilename(pub) {
  const edition = sanitizeFilenameSegment(pub?.title || 'edition', 100);
  const publication = sanitizeFilenameSegment(
    pub?.series_title || pub?.publication_name || '',
    100
  );
  let base = publication ? `${edition} - ${publication}` : edition;
  base = base || 'publication';
  if (base.length > 180) base = base.slice(0, 180);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

/**
 * @param {{ pdf_url?: string, title?: string }} pub
 */
async function downloadPdfFile(pub) {
  const url = String(pub?.pdf_url || '').trim();
  if (!url) throw new Error('No PDF to download');
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const name = pdfDownloadFilename(pub);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function handleReaderDownloadClick(link) {
  if (!isReaderOpen()) return;
  const pub = currentPublication;
  if (!pub?.pdf_url) return;
  link.setAttribute('aria-busy', 'true');
  link.classList.add('opacity-60', 'pointer-events-none');
  try {
    await downloadPdfFile(pub);
  } catch (err) {
    const msg =
      err?.message ||
      'Could not download the PDF. Check your connection and CORS on the PDF host (e.g. R2).';
    window.alert(msg);
  } finally {
    link.removeAttribute('aria-busy');
    link.classList.remove('opacity-60', 'pointer-events-none');
  }
}

function bindReaderDownloadOnce() {
  const link = document.getElementById('reader-download-link');
  if (!link || downloadBoundEl === link) return;
  downloadBoundEl = link;
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleReaderDownloadClick(link);
  });
}

/** Event-delegated chrome controls for standalone page mode (studio wires its own listeners). */
function bindReaderChromeControlsOnce() {
  if (chromeControlsBound) return;
  chromeControlsBound = true;
  document.addEventListener('click', (e) => {
    if (!isReaderPageMode() || !isReaderOpen()) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const actionEl = t.closest(
      '#reader-close, #reader-first, #reader-prev, #reader-next, #reader-last, #reader-zoom-in, #reader-zoom-out, #reader-fit-reset, #reader-fullscreen, #reader-page-jump-go, #reader-download-link, #reader-theme-toggle, #reader-page-info'
    );
    if (!actionEl) return;
    const id = actionEl.id;
    if (id === 'reader-download-link') {
      e.preventDefault();
      void handleReaderDownloadClick(actionEl);
      return;
    }
    if (id === 'reader-theme-toggle') {
      e.preventDefault();
      toggleReaderTheme();
      return;
    }
    if (id === 'reader-page-info') {
      e.preventDefault();
      togglePageJumpOpen();
      return;
    }
    e.preventDefault();
    switch (id) {
      case 'reader-close':
        closeReader();
        break;
      case 'reader-first':
        flipFirst();
        break;
      case 'reader-prev':
        flipPrev();
        break;
      case 'reader-next':
        flipNext();
        break;
      case 'reader-last':
        flipLast();
        break;
      case 'reader-zoom-in':
        zoomIn();
        break;
      case 'reader-zoom-out':
        zoomOut();
        break;
      case 'reader-fit-reset':
        resetReaderZoom();
        break;
      case 'reader-fullscreen':
        readerToggleFullscreen();
        break;
      case 'reader-page-jump-go':
        readerSubmitPageJump();
        break;
      default:
        break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!isReaderPageMode()) return;
    if (!(e.target instanceof HTMLInputElement)) return;
    if (e.target.id !== 'reader-page-jump') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setPageJumpOpen(false);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    readerSubmitPageJump();
  });
}

/** Web Audio fallback when `#page-flip-sound` has no usable `<source>` (HTML uses `/images/pageturn.mp3`). */
function playFlipSoundSynthesized() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!flipAudioCtx || flipAudioCtx.state === 'closed') {
      flipAudioCtx = new AC();
    }
    const ctx = flipAudioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const t0 = ctx.currentTime;
    const rustleDur = 0.165;
    const sampleRate = ctx.sampleRate;
    const n = Math.max(1, Math.floor(sampleRate * rustleDur));
    const buffer = ctx.createBuffer(1, n, sampleRate);
    const data = buffer.getChannelData(0);
    let leak = 0;
    for (let i = 0; i < n; i++) {
      leak = 0.965 * leak + 0.035 * (Math.random() * 2 - 1);
      data[i] = leak;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const hpBody = ctx.createBiquadFilter();
    hpBody.type = 'highpass';
    hpBody.frequency.value = 320;
    hpBody.Q.value = 0.55;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3100;
    lp.Q.value = 0.55;

    const gRustle = ctx.createGain();
    gRustle.gain.setValueAtTime(0.0001, t0);
    gRustle.gain.exponentialRampToValueAtTime(0.2, t0 + 0.014);
    gRustle.gain.exponentialRampToValueAtTime(0.0001, t0 + rustleDur);

    noise.connect(hpBody);
    hpBody.connect(lp);
    lp.connect(gRustle);

    const nCrisp = Math.max(1, Math.floor(sampleRate * 0.055));
    const bufCrisp = ctx.createBuffer(1, nCrisp, sampleRate);
    const d2 = bufCrisp.getChannelData(0);
    for (let i = 0; i < nCrisp; i++) {
      d2[i] = (Math.random() * 2 - 1) * (1 - i / nCrisp) ** 1.6;
    }
    const noiseHi = ctx.createBufferSource();
    noiseHi.buffer = bufCrisp;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4800;
    bp.Q.value = 0.85;
    const gCrisp = ctx.createGain();
    gCrisp.gain.setValueAtTime(0.0001, t0);
    gCrisp.gain.exponentialRampToValueAtTime(0.07, t0 + 0.004);
    gCrisp.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.052);
    noiseHi.connect(bp);
    bp.connect(gCrisp);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(98, t0);
    osc.frequency.exponentialRampToValueAtTime(52, t0 + 0.042);
    const gThump = ctx.createGain();
    gThump.gain.setValueAtTime(0.0001, t0);
    gThump.gain.exponentialRampToValueAtTime(0.068, t0 + 0.006);
    gThump.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    osc.connect(gThump);

    const out = ctx.createGain();
    out.gain.value = 0.92;
    gRustle.connect(out);
    gCrisp.connect(out);
    gThump.connect(out);
    out.connect(ctx.destination);

    noise.start(t0);
    noise.stop(t0 + rustleDur + 0.02);
    noiseHi.start(t0);
    noiseHi.stop(t0 + 0.058);
    osc.start(t0);
    osc.stop(t0 + 0.06);
  } catch (_) {}
}

function playFlipSound() {
  const audio = document.getElementById('page-flip-sound');
  const hasSrc =
    audio &&
    (String(audio.getAttribute('src') || '').trim() !== '' ||
      audio.querySelector('source[src]'));
  if (hasSrc) {
    try {
      const clone = audio.cloneNode(true);
      clone.volume = 0.48;
      clone.play().catch(() => {});
    } catch (_) {}
    return;
  }
  playFlipSoundSynthesized();
}

function applyTransform() {
  getReaderElements();
  const pan = document.getElementById('flipbook-pan');
  if (!pan) return;
  pan.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  pan.style.transformOrigin = 'center center';
}

function isReaderOpen() {
  const rv = document.getElementById('reader-view');
  return rv && !rv.classList.contains('hidden');
}

function syncFullscreenIcon() {
  const btn = document.getElementById('reader-fullscreen');
  const pub = btn?.querySelector('.pub-icon');
  if (pub) {
    pub.innerHTML = pubIconSvgOnly(document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen');
    return;
  }
  const icon = btn?.querySelector('.material-icons');
  if (!icon) return;
  icon.textContent = document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen';
}

function onReaderFullscreenOrVisualViewportChange() {
  if (!isReaderOpen() || !flipBook) return;
  requestAnimationFrame(() => {
    applyTransform();
    try {
      updatePageInfo();
    } catch (_) {}
  });
}

function bindReaderKeyboardOnce() {
  if (keyboardBound) return;
  keyboardBound = true;
  document.addEventListener('fullscreenchange', () => {
    syncFullscreenIcon();
    onReaderFullscreenOrVisualViewportChange();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (visualViewportResizeTimer) clearTimeout(visualViewportResizeTimer);
      visualViewportResizeTimer = setTimeout(() => {
        visualViewportResizeTimer = null;
        onReaderFullscreenOrVisualViewportChange();
      }, 120);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!isReaderOpen()) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) {
      if (e.key === 'Escape') {
        e.target.blur();
        if (e.target?.id === 'reader-page-jump') setPageJumpOpen(false);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (document.getElementById('reader-view')?.dataset?.pageJumpOpen === 'true') {
          setPageJumpOpen(false);
          break;
        }
        closeReader();
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        flipNext();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        flipPrev();
        break;
      case 'Home':
        e.preventDefault();
        flipFirst();
        break;
      case 'End':
        e.preventDefault();
        flipLast();
        break;
      default:
        break;
    }
  });
}

async function buildFlipFromPdfDoc(pdfDoc, myLoad, opts = {}) {
  const startPage = Math.max(0, Number(opts.startPage) || 0);
  const skipFullLoadingOverlay = !!opts.skipFullLoadingOverlay;

  getReaderElements();
  if (!flipbookContainer || myLoad !== loadGeneration) return;

  const numPages = pdfDoc.numPages;
  if (numPages === 0) {
    setReaderError('PDF has no pages');
    return;
  }

  if (!skipFullLoadingOverlay) {
    await new Promise((r) => requestAnimationFrame(r));
    if (myLoad !== loadGeneration) return;
  }

  let baseW;
  let baseH;
  if (cachedPdfBaseSize && skipFullLoadingOverlay) {
    baseW = cachedPdfBaseSize.width;
    baseH = cachedPdfBaseSize.height;
  } else {
    const pdfPage1 = await pdfDoc.getPage(1);
    const base1 = pdfPage1.getViewport({ scale: 1 });
    if (myLoad !== loadGeneration) {
      try {
        pdfPage1.cleanup();
      } catch (_) {}
      return;
    }
    baseW = base1.width;
    baseH = base1.height;
    cachedPdfBaseSize = { width: baseW, height: baseH };
    try {
      pdfPage1.cleanup();
    } catch (_) {}
  }

  const slot = getViewportPageSizeForPdf(baseW, baseH);
  const scaleSlot = Math.min(slot.pageWidth / baseW, slot.pageHeight / baseH);
  pageWidth = Math.max(1, Math.round(baseW * scaleSlot));
  pageHeight = Math.max(1, Math.round(baseH * scaleSlot));

  const coverPlaceholder = String(
    currentPublication?.cover_url || currentPublication?.cover_thumb_url || ''
  ).trim();

  const shells = [];
  for (let i = 1; i <= numPages; i++) {
    const shell = createPageShell(
      i,
      pageWidth,
      pageHeight,
      i === 1 ? coverPlaceholder : ''
    );
    shells.push(shell);
    flipbookContainer.appendChild(shell);
  }

  const useSpread = shouldUseSpreadLayout();
  const firstSpreadEnd = Math.min(useSpread ? 4 : 2, numPages);
  if (!skipFullLoadingOverlay) {
    if (readerLoadingDetail) {
      readerLoadingDetail.textContent = coverPlaceholder
        ? 'Opening…'
        : firstSpreadEnd > 1
          ? 'Rendering first pages…'
          : 'Rendering cover…';
    }
    if (readerProgress) readerProgress.style.width = '100%';
  }

  // Cold open: with cover stand-in, show flipbook immediately (page 1 looks ready).
  // Without cover, sync-render page 1 only. Relayout: current view only.
  // Remaining first-spread pages go through the priority queue (non-blocking).
  const focusOneBased = Math.min(numPages, Math.max(1, startPage + 1));
  /** @type {number[]} */
  let syncPages;
  /** @type {number[]} */
  let immediatePriority = [];
  if (skipFullLoadingOverlay) {
    syncPages = [focusOneBased];
    if (useSpread) {
      const neighbor = focusOneBased % 2 === 0 ? focusOneBased - 1 : focusOneBased + 1;
      if (neighbor >= 1 && neighbor <= numPages) syncPages.push(neighbor);
    }
  } else if (coverPlaceholder) {
    syncPages = [];
    immediatePriority = [];
    for (let i = 1; i <= firstSpreadEnd; i++) immediatePriority.push(i);
  } else {
    syncPages = [1];
    immediatePriority = [];
    for (let i = 2; i <= firstSpreadEnd; i++) immediatePriority.push(i);
  }

  if (syncPages.length) {
    await Promise.all(
      syncPages.map((i) => {
        if (myLoad !== loadGeneration) return Promise.resolve();
        return renderPageIntoShell(pdfDoc, i, shells[i - 1], pageWidth, pageHeight);
      })
    );
  }

  if (myLoad !== loadGeneration) return;

  if (!skipFullLoadingOverlay) hideReaderLoading();

  const PageFlip = getPageFlipCtor();
  if (!PageFlip) {
    setReaderError('StPageFlip not loaded. Check that page-flip script loaded.');
    return;
  }

  const clampedStart = Math.min(startPage, Math.max(0, numPages - 1));
  const settings = {
    width: pageWidth,
    height: pageHeight,
    size: 'fixed',
    minWidth: 160,
    minHeight: 200,
    startPage: clampedStart,
    showCover: true,
    drawShadow: true,
    maxShadowOpacity: 0.35,
    flippingTime: 480,
    usePortrait: !useSpread,
    mobileScrollSupport: !useSpread
  };

  try {
    flipBook = new PageFlip(flipbookContainer, settings);
    // Only pages that are direct children of the flipbook host (never footer/chrome).
    const pageNodes = Array.from(flipbookContainer.children).filter(
      (el) => el.classList && el.classList.contains('page')
    );
    flipBook.loadFromHTML(pageNodes);
    if (clampedStart > 0) {
      try {
        flipBook.turnToPage(clampedStart);
      } catch (_) {}
    }
    flipBook.on('flip', () => {
      const cur = flipBook.getCurrentPageIndex();
      if (cur !== lastFlipSoundPageIndex) {
        playFlipSound();
      }
      lastFlipSoundPageIndex = cur;
      prioritizePageRender([cur + 1, cur + 2, cur + 3]);
      updatePageInfo();
      syncPageJumpInput();
      syncPreparingHint();
    });
    currentLayoutIsSpread = useSpread;
    updatePageInfo();
    syncPageJumpInput();
    applyTransform();
  } catch (e) {
    setReaderError(e.message || 'Failed to init flipbook');
    return;
  }

  const ready = new Set(syncPages);
  const pending = [];
  for (let i = 1; i <= numPages; i++) {
    if (!ready.has(i)) pending.push(i);
  }

  cancelPageRenderQueue();
  pageRenderQueue = {
    myLoad,
    pdfDoc,
    pageWidth,
    pageHeight,
    shells,
    ready,
    pending,
    priority: [],
    running: false,
    cancelled: false
  };
  if (immediatePriority.length) {
    prioritizePageRender(immediatePriority);
  } else if (skipFullLoadingOverlay) {
    prioritizePageRender(
      [focusOneBased - 1, focusOneBased + 1, focusOneBased + 2].filter(
        (p) => p >= 1 && p <= numPages
      )
    );
  }
  void drainPageRenderQueue();
}

/**
 * Rebuild PageFlip when single/spread mode flips. Reuses activePdfDoc; does not bump loadGeneration.
 */
async function relayoutReaderForViewport() {
  if (!isReaderOpen() || !flipBook || !activePdfDoc) return;
  const nextSpread = shouldUseSpreadLayout();
  if (currentLayoutIsSpread === nextSpread) return;

  const startPage = flipBook.getCurrentPageIndex();
  const myLoad = loadGeneration;
  setZoom(1);
  setPageJumpOpen(false);
  tearDownFlipbookOnly();
  getReaderElements();
  if (!flipbookContainer || myLoad !== loadGeneration) return;
  await buildFlipFromPdfDoc(activePdfDoc, myLoad, {
    startPage,
    skipFullLoadingOverlay: true
  });
}

function scheduleLayoutRelayoutCheck() {
  if (layoutRelayoutTimer) clearTimeout(layoutRelayoutTimer);
  // Short debounce: wait for rotation to settle without feeling sluggish.
  layoutRelayoutTimer = setTimeout(() => {
    layoutRelayoutTimer = null;
    void enqueueReaderOp(() => relayoutReaderForViewport());
  }, 40);
}

function bindReaderLayoutListenersOnce() {
  if (layoutListenersBound) return;
  layoutListenersBound = true;
  window.addEventListener('resize', scheduleLayoutRelayoutCheck);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleLayoutRelayoutCheck);
  }
  const mql = window.matchMedia('(orientation: landscape)');
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', scheduleLayoutRelayoutCheck);
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(scheduleLayoutRelayoutCheck);
  }
}

function setPageJumpOpen(open) {
  const rv = document.getElementById('reader-view');
  if (!rv) return;
  if (open) {
    rv.dataset.pageJumpOpen = 'true';
    const info = document.getElementById('reader-page-info');
    if (info) info.setAttribute('aria-expanded', 'true');
    const input = document.getElementById('reader-page-jump');
    if (input) {
      syncPageJumpInput();
      requestAnimationFrame(() => {
        try {
          input.focus();
          input.select();
        } catch (_) {}
      });
    }
  } else {
    delete rv.dataset.pageJumpOpen;
    const info = document.getElementById('reader-page-info');
    if (info) info.setAttribute('aria-expanded', 'false');
  }
}

export { setPageJumpOpen };

function togglePageJumpOpen() {
  const rv = document.getElementById('reader-view');
  const open = rv?.dataset?.pageJumpOpen === 'true';
  setPageJumpOpen(!open);
}

/** @type {HTMLElement | null} */
let pageInfoBoundEl = null;

function bindReaderPageInfoOnce() {
  const el = document.getElementById('reader-page-info');
  if (!el || pageInfoBoundEl === el) return;
  pageInfoBoundEl = el;
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePageJumpOpen();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePageJumpOpen();
    }
  });
}

function setReaderError(msg) {
  if (readerLoading) {
    readerLoading.classList.add('hidden');
    readerLoading.classList.remove('flex');
  }
  if (readerError) {
    readerError.textContent = msg;
    readerError.classList.remove('hidden');
  }
}

function updatePageInfo() {
  if (!flipBook) return;
  const current = flipBook.getCurrentPageIndex();
  const total = flipBook.getPageCount();
  const oneBased = current + 1;
  if (readerPageInfo) {
    const preparing = pageRenderQueue && !pageRenderQueue.ready.has(oneBased);
    readerPageInfo.textContent = preparing
      ? `${oneBased} / ${total} · …`
      : `${oneBased} / ${total}`;
    readerPageInfo.title = preparing ? 'Preparing this page…' : '';
  }
  applyTransform();
}

function syncPreparingHint() {
  updatePageInfo();
}

function syncPageJumpInput() {
  const input = document.getElementById('reader-page-jump');
  if (!input || !flipBook) return;
  input.max = String(flipBook.getPageCount());
  input.value = String(flipBook.getCurrentPageIndex() + 1);
}

/**
 * @param {{ id?: string, title: string, pdf_url: string, created_at?: string, issue_date?: string, series_title?: string | null, publication_name?: string | null }} publication
 */
export function openReader(publication) {
  const myLoad = ++loadGeneration;
  /** Unblock reopen if a previous relayout/render hung on the shared promise chain. */
  flipOpChain = Promise.resolve();
  tearDownReaderContent();
  currentPublication = publication;
  bindReaderKeyboardOnce();
  bindReaderLayoutListenersOnce();
  bindReaderZoomInputOnce();
  bindReaderChromeControlsOnce();
  // Pointer/zoom/download/theme binds are element-scoped: re-run each open so a
  // remounted reader chrome rebinds to its fresh DOM nodes.
  bindReaderPointerGesturesOnce();
  // Overlay (studio) uses dedicated listeners; page mode uses chrome delegation.
  if (!isReaderPageMode()) {
    bindReaderPageInfoOnce();
    bindReaderThemeToggleOnce();
    bindReaderDownloadOnce();
  }

  showReaderView();
  setReaderLoadingCover(publication);
  if (publication?.pdf_url) void prefetchEditionPdf(publication.pdf_url);
  getReaderElements();
  if (!flipbookContainer) return flipOpChain;

  const titleEl = document.getElementById('reader-title');
  const editionEl = document.getElementById('reader-edition');
  const downloadLink = document.getElementById('reader-download-link');
  if (titleEl) titleEl.textContent = publication.title || 'Publication';
  if (editionEl) {
    const pubLine = String(
      publication.series_title || publication.publication_name || ''
    ).trim();
    editionEl.textContent = pubLine;
    editionEl.classList.toggle('hidden', !pubLine);
  }
  if (downloadLink && publication.pdf_url) {
    downloadLink.href = '#';
    downloadLink.classList.remove('hidden');
  } else if (downloadLink) {
    downloadLink.href = '#';
    downloadLink.classList.add('hidden');
  }

  zoomLevel = 1;
  panX = 0;
  panY = 0;
  pinchState = null;
  panTouch = null;
  mousePan = null;
  syncReaderZoomClass();
  const zinOpen = document.getElementById('reader-zoom-input');
  if (zinOpen) zinOpen.value = '100';
  if (readerPageInfo) readerPageInfo.textContent = '-';
  const jump = document.getElementById('reader-page-jump');
  if (jump) {
    jump.value = '1';
    jump.removeAttribute('max');
  }

  applyTransform();

  setReaderLocationHash(publication);

  return enqueueReaderOp(async () => {
    try {
      if (myLoad !== loadGeneration) return;

      await Promise.all([ensurePdfViewerCss(), ensurePageFlipCss()]);

      try {
        const [lib] = await Promise.all([ensurePdfJs(), ensurePageFlip()]);
        pdfjsLib = lib;
      } catch (e) {
        if (myLoad !== loadGeneration) return;
        setReaderError(e.message || 'Failed to load reader');
        return;
      }

      if (myLoad !== loadGeneration) return;

      const pdfUrl = publication.pdf_url;
      if (!pdfUrl) {
        setReaderError('No PDF URL');
        return;
      }

      let pdfDoc;
      try {
        const loading = pdfjsLib.getDocument({
          url: pdfUrl,
          disableRange: false,
          disableStream: false
        });
        loading.onProgress = (p) => {
          if (myLoad !== loadGeneration || !readerProgress || !p.total) return;
          const pct = Math.min(99, Math.round((p.loaded / p.total) * 100));
          readerProgress.style.width = `${pct}%`;
          if (readerLoadingDetail) {
            readerLoadingDetail.textContent = downloadProgressLabel(publication);
          }
        };
        pdfDoc = await loading.promise;
      } catch (e) {
        if (myLoad !== loadGeneration) return;
        setReaderError(e.message || 'Failed to load PDF. Check CORS on your PDF host (e.g. R2).');
        return;
      }

      if (myLoad !== loadGeneration) {
        try {
          await pdfDoc.destroy();
        } catch (_) {}
        return;
      }

      activePdfDoc = pdfDoc;
      await buildFlipFromPdfDoc(pdfDoc, myLoad);
    } catch (e) {
      if (myLoad !== loadGeneration) return;
      setReaderError(e?.message || 'Reader failed');
    }
  });
}

function setZoom(value) {
  zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  if (zoomLevel <= 1.02) {
    panX = 0;
    panY = 0;
  }
  syncReaderZoomClass();
  applyTransform();
  const pct = Math.round(zoomLevel * 100);
  const zin = document.getElementById('reader-zoom-input');
  if (zin && document.activeElement !== zin) zin.value = String(pct);
}

export function closeReader() {
  const handler = readerCloseHandler;
  hideReaderView();
  if (typeof handler === 'function') {
    try {
      handler();
    } catch (_) {}
  }
}

export function flipPrev() {
  if (!flipBook) return;
  const cur = flipBook.getCurrentPageIndex();
  const total = flipBook.getPageCount();
  if (cur <= 0) return;
  const dest = Math.max(1, cur); // 1-based page we're leaving toward (prev index = cur-1 → page cur)
  prioritizePageRender([dest, dest - 1, dest + 1].filter((p) => p >= 1 && p <= total));
  const need = [cur]; // 1-based of destination page index cur-1+1 = cur
  if (!isPageShellReady(cur)) {
    syncPreparingHint();
    void waitForPagesReady(need).then(() => {
      if (flipBook) flipBook.flipPrev();
      updatePageInfo();
      syncPageJumpInput();
    });
    return;
  }
  flipBook.flipPrev();
}

export function flipNext() {
  if (!flipBook) return;
  const cur = flipBook.getCurrentPageIndex();
  const total = flipBook.getPageCount();
  if (cur >= total - 1) return;
  // Next page is index cur+1 → 1-based cur+2; also warm the following spread.
  const nextOneBased = cur + 2;
  prioritizePageRender(
    [nextOneBased, nextOneBased + 1, nextOneBased + 2].filter((p) => p >= 1 && p <= total)
  );
  if (nextOneBased <= total && !isPageShellReady(nextOneBased)) {
    syncPreparingHint();
    void waitForPagesReady([nextOneBased, Math.min(total, nextOneBased + 1)]).then(() => {
      if (!flipBook) return;
      // Only advance one step — never jump to last.
      flipBook.flipNext();
      updatePageInfo();
      syncPageJumpInput();
    });
    return;
  }
  flipBook.flipNext();
}

export function flipFirst() {
  if (!flipBook) return;
  prioritizePageRender([1, 2]);
  flipBook.flip(0);
}

/** Go to 1-based spread/page index in the flipbook. */
export function readerGoToPage(oneBased) {
  if (!flipBook) return;
  const n = Math.floor(Number(oneBased));
  const total = flipBook.getPageCount();
  if (!Number.isFinite(n) || n < 1 || n > total) return;
  prioritizePageRender([n, n + 1, n - 1].filter((p) => p >= 1 && p <= total));
  const go = () => {
    if (!flipBook) return;
    flipBook.flip(n - 1);
    syncPageJumpInput();
    syncPreparingHint();
  };
  if (!isPageShellReady(n)) {
    syncPreparingHint();
    void waitForPagesReady([n, Math.min(total, n + 1)]).then(go);
    return;
  }
  go();
}

export function flipLast() {
  if (!flipBook) return;
  const last = flipBook.getPageCount();
  prioritizePageRender([last, last - 1].filter((p) => p >= 1));
  const go = () => {
    if (!flipBook) return;
    flipBook.flip(last - 1);
    syncPageJumpInput();
    syncPreparingHint();
  };
  if (!isPageShellReady(last)) {
    syncPreparingHint();
    void waitForPagesReady([last, Math.max(1, last - 1)]).then(go);
    return;
  }
  go();
}

export function zoomIn() {
  setZoom(zoomLevel + ZOOM_STEP);
}

export function zoomOut() {
  setZoom(zoomLevel - ZOOM_STEP);
}

/** Reset zoom to 100% (book size follows viewport; use after resize relayout for best fit). */
export function resetReaderZoom() {
  panX = 0;
  panY = 0;
  pinchState = null;
  panTouch = null;
  mousePan = null;
  setZoom(1);
}

export function readerSubmitPageJump() {
  const input = document.getElementById('reader-page-jump');
  if (!input) return;
  readerGoToPage(input.value);
  setPageJumpOpen(false);
}

export function readerToggleFullscreen() {
  const el = document.getElementById('reader-view');
  if (!el) return;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}
