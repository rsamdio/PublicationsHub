/**
 * Reader: PDF.js + StPageFlip.
 * - HiDPI rendering (Mozilla-recommended outputScale + transform; avoids blurry text).
 * - Load generation guard: closing or opening again invalidates in-flight work (fixes stuck loading).
 * - PDFDocumentProxy.destroy() + per-page cleanup() to release workers/memory.
 * - No full PDF re-render on window resize/fullscreen (that caused stuck loading and blocked reopen).
 * - Remount #flipbook-container after PageFlip.destroy() (the library removes the host node from the DOM).
 * - Pan/zoom: #flipbook-pan uses translate+scale; pinch + one-finger pan (zoomed), Ctrl+wheel zoom, wheel pan when zoomed, mouse drag when zoomed.
 */
import { formatReadLocationHash, parseReadRefFromHash, isReaderLocationHash } from './url-routes.js';

const PDFJS_VERSION = '3.11.174';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

let pdfjsLib = null;
let pdfjsLoadPromise = null;

function ensurePdfJs() {
  if (typeof window.pdfjsLib !== 'undefined' && window.pdfjsLib.getDocument) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    return Promise.resolve(window.pdfjsLib);
  }
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_CDN;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        resolve(window.pdfjsLib);
      } else reject(new Error('PDF.js not found'));
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
  return pdfjsLoadPromise;
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
let gesturesBound = false;
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

/** Skip page-flip sound on first `flip` after open (library may emit an initial flip). */
let lastFlipSoundPageIndex = -1;

let downloadClickBound = false;

/** @type {AudioContext | null} */
let flipAudioCtx = null;

/** Cached PDF for resize relayout (destroyed on close). */
let activePdfDoc = null;

/** Last opened publication (for resize). */
let currentPublication = null;

let keyboardBound = false;
let zoomInputBound = false;
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
  if (gesturesBound) return;
  const wrapper = document.getElementById('flipbook-wrapper');
  if (!wrapper) return;
  gesturesBound = true;

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

export function readEditionRefFromHash() {
  return parseReadRefFromHash(typeof location !== 'undefined' ? location.hash || '' : '');
}

function setReaderLocationHash(publication) {
  if (!publication?.id) return;
  const next = formatReadLocationHash(publication.id);
  if (!next || location.hash === next) return;
  const url = `${location.pathname}${location.search}${next}`;
  history.replaceState(null, '', url);
}

function clearReaderLocationHash() {
  const h = location.hash || '';
  if (!h || !isReaderLocationHash(h)) return;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
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
  if (zoomInputBound) return;
  const el = document.getElementById('reader-zoom-input');
  if (!el) return;
  zoomInputBound = true;
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
  if (readerView) {
    readerView.classList.remove('hidden');
    readerView.classList.add('flex');
  }
  if (readerLoading) {
    readerLoading.classList.remove('hidden');
    readerLoading.classList.add('flex');
  }
  if (readerError) readerError.classList.add('hidden');
  if (readerProgress) readerProgress.style.width = '0%';
  if (readerLoadingDetail) readerLoadingDetail.textContent = '';
}

/**
 * Tear down flipbook + PDF. Does not hide the overlay.
 * PageFlip.destroy() removes #flipbook-container from the DOM; remount it before clearing pages.
 */
function tearDownReaderContent() {
  if (flipBook) {
    try {
      flipBook.destroy();
    } catch (_) {}
    flipBook = null;
  }
  ensureFlipbookContainerMounted();
  flipbookContainer = document.getElementById('flipbook-container');
  if (flipbookContainer) flipbookContainer.innerHTML = '';
  if (activePdfDoc) {
    try {
      activePdfDoc.destroy();
    } catch (_) {}
    activePdfDoc = null;
  }
  currentPublication = null;
  lastFlipSoundPageIndex = -1;
}

function hideReaderView() {
  getReaderElements();
  loadGeneration += 1;
  clearReaderLocationHash();
  if (visualViewportResizeTimer) {
    clearTimeout(visualViewportResizeTimer);
    visualViewportResizeTimer = null;
  }
  pinchState = null;
  panTouch = null;
  mousePan = null;
  panX = 0;
  panY = 0;
  if (readerView) readerView.classList.remove('reader-zoomed');
  const panEl = document.getElementById('flipbook-pan');
  if (panEl) panEl.style.transform = '';
  tearDownReaderContent();
  if (readerView) {
    readerView.classList.add('hidden');
    readerView.classList.remove('flex');
  }
  if (readerLoading) {
    readerLoading.classList.add('hidden');
    readerLoading.classList.remove('flex');
  }
}

/**
 * Largest page slot (CSS px) that fits the wrapper and matches this PDF page’s aspect ratio.
 * Wide viewports: each page may use up to half the available width (spread).
 */
function getViewportPageSizeForPdf(pdfW, pdfH) {
  const wrapper = document.getElementById('flipbook-wrapper');
  if (!wrapper) return { pageWidth: 400, pageHeight: 560 };
  const paddingX = 12;
  const paddingY = 12;
  const availW = Math.max(0, wrapper.clientWidth - paddingX * 2);
  const availH = Math.max(0, wrapper.clientHeight - paddingY * 2);
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;

  const pw = Math.max(1, pdfW);
  const ph = Math.max(1, pdfH);

  if (isNarrow) {
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

/**
 * Renders one PDF page into a fixed .page div (StPageFlip). HiDPI via outputScale + transform (pdf.js docs).
 */
async function renderPageToDiv(pdfPage, pageNum, targetWidth, targetHeight) {
  const base = pdfPage.getViewport({ scale: 1 });
  const scaleFit = Math.min(targetWidth / base.width, targetHeight / base.height);
  const viewport = pdfPage.getViewport({ scale: scaleFit });
  const outputScale = Math.min(window.devicePixelRatio || 1, 2.5);

  const div = document.createElement('div');
  div.className = 'page';
  div.dataset.page = String(pageNum);
  div.style.width = `${targetWidth}px`;
  div.style.height = `${targetHeight}px`;
  div.style.backgroundColor = '#d1d5db';
  div.style.overflow = 'hidden';
  div.style.boxShadow = '0 2px 12px rgba(0,0,0,0.2)';

  const inner = document.createElement('div');
  inner.style.width = '100%';
  inner.style.height = '100%';
  inner.style.display = 'flex';
  inner.style.alignItems = 'center';
  inner.style.justifyContent = 'center';
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

  inner.appendChild(canvas);
  div.appendChild(inner);
  return div;
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

function bindReaderDownloadOnce() {
  if (downloadClickBound) return;
  const link = document.getElementById('reader-download-link');
  if (!link) return;
  downloadClickBound = true;
  link.addEventListener('click', async (e) => {
    e.preventDefault();
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
  });
}

/** Web Audio fallback: soft rustle + brief low thump (no `<source>` on `#page-flip-sound`). */
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
    const rustleDur = 0.14;
    const sampleRate = ctx.sampleRate;
    const n = Math.max(1, Math.floor(sampleRate * rustleDur));
    const buffer = ctx.createBuffer(1, n, sampleRate);
    const data = buffer.getChannelData(0);
    let leak = 0;
    for (let i = 0; i < n; i++) {
      leak = 0.97 * leak + 0.03 * (Math.random() * 2 - 1);
      data[i] = leak;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 0.5;

    const gRustle = ctx.createGain();
    gRustle.gain.setValueAtTime(0.0001, t0);
    gRustle.gain.exponentialRampToValueAtTime(0.085, t0 + 0.016);
    gRustle.gain.exponentialRampToValueAtTime(0.0001, t0 + rustleDur);

    noise.connect(lp);
    lp.connect(gRustle);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, t0);
    osc.frequency.exponentialRampToValueAtTime(58, t0 + 0.038);
    const gThump = ctx.createGain();
    gThump.gain.setValueAtTime(0.0001, t0);
    gThump.gain.exponentialRampToValueAtTime(0.035, t0 + 0.007);
    gThump.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.048);
    osc.connect(gThump);

    const out = ctx.createGain();
    out.gain.value = 0.78;
    gRustle.connect(out);
    gThump.connect(out);
    out.connect(ctx.destination);

    noise.start(t0);
    noise.stop(t0 + rustleDur + 0.02);
    osc.start(t0);
    osc.stop(t0 + 0.055);
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
      clone.volume = 0.28;
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

function getPageFlipCtor() {
  return (window.St && window.St.PageFlip) || window.PageFlip || window.StPageFlip || window.pageFlip;
}

function isReaderOpen() {
  const rv = document.getElementById('reader-view');
  return rv && !rv.classList.contains('hidden');
}

function syncFullscreenIcon() {
  const btn = document.getElementById('reader-fullscreen');
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
  bindReaderPointerGesturesOnce();

  document.addEventListener('keydown', (e) => {
    if (!isReaderOpen()) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
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

function hideReaderLoading() {
  getReaderElements();
  if (readerLoading) {
    readerLoading.classList.add('hidden');
    readerLoading.classList.remove('flex');
  }
}

async function buildFlipFromPdfDoc(pdfDoc, myLoad) {
  getReaderElements();
  if (!flipbookContainer || myLoad !== loadGeneration) return;

  const numPages = pdfDoc.numPages;
  if (numPages === 0) {
    setReaderError('PDF has no pages');
    return;
  }

  await new Promise((r) => requestAnimationFrame(r));
  if (myLoad !== loadGeneration) return;

  const pdfPage1 = await pdfDoc.getPage(1);
  const base1 = pdfPage1.getViewport({ scale: 1 });
  try {
    pdfPage1.cleanup();
  } catch (_) {}
  if (myLoad !== loadGeneration) return;

  const slot = getViewportPageSizeForPdf(base1.width, base1.height);
  const scaleSlot = Math.min(slot.pageWidth / base1.width, slot.pageHeight / base1.height);
  pageWidth = Math.max(1, Math.round(base1.width * scaleSlot));
  pageHeight = Math.max(1, Math.round(base1.height * scaleSlot));

  for (let i = 1; i <= numPages; i++) {
    if (myLoad !== loadGeneration) return;
    const pct = Math.round((i / numPages) * 100);
    if (readerProgress) readerProgress.style.width = `${pct}%`;
    if (readerLoadingDetail) readerLoadingDetail.textContent = `Rendering page ${i} of ${numPages}…`;
    const pdfPage = await pdfDoc.getPage(i);
    if (myLoad !== loadGeneration) {
      try {
        pdfPage.cleanup();
      } catch (_) {}
      return;
    }
    const div = await renderPageToDiv(pdfPage, i, pageWidth, pageHeight);
    if (myLoad !== loadGeneration) return;
    flipbookContainer.appendChild(div);
  }

  if (myLoad !== loadGeneration) return;

  hideReaderLoading();

  const PageFlip = getPageFlipCtor();
  if (!PageFlip) {
    setReaderError('StPageFlip not loaded. Check that page-flip script loaded.');
    return;
  }

  const isWideViewport = typeof window !== 'undefined' && window.innerWidth >= 768;
  const settings = {
    width: pageWidth,
    height: pageHeight,
    size: 'fixed',
    minWidth: 160,
    minHeight: 200,
    startPage: 0,
    showCover: true,
    drawShadow: true,
    maxShadowOpacity: 0.35,
    flippingTime: 480,
    usePortrait: !isWideViewport,
    mobileScrollSupport: !isWideViewport
  };

  try {
    flipBook = new PageFlip(flipbookContainer, settings);
    flipBook.loadFromHTML(Array.from(flipbookContainer.querySelectorAll('.page')));
    flipBook.on('flip', () => {
      const cur = flipBook.getCurrentPageIndex();
      if (lastFlipSoundPageIndex >= 0 && cur !== lastFlipSoundPageIndex) {
        playFlipSound();
      }
      lastFlipSoundPageIndex = cur;
      updatePageInfo();
      syncPageJumpInput();
    });
    updatePageInfo();
    syncPageJumpInput();
    applyTransform();
  } catch (e) {
    setReaderError(e.message || 'Failed to init flipbook');
  }
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
  if (readerPageInfo) readerPageInfo.textContent = `${current + 1} / ${total}`;
  applyTransform();
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
  bindReaderZoomInputOnce();
  bindReaderDownloadOnce();

  showReaderView();
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
  if (readerPageInfo) readerPageInfo.textContent = '—';
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

      try {
        await ensurePdfJs();
        pdfjsLib = window.pdfjsLib;
      } catch (e) {
        if (myLoad !== loadGeneration) return;
        setReaderError(e.message || 'Failed to load PDF engine');
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
          if (readerLoadingDetail) readerLoadingDetail.textContent = 'Downloading PDF…';
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
  hideReaderView();
}

export function flipPrev() {
  if (flipBook) flipBook.flipPrev();
}

export function flipNext() {
  if (flipBook) flipBook.flipNext();
}

export function flipFirst() {
  if (flipBook) flipBook.flip(0);
}

export function flipLast() {
  if (flipBook) flipBook.flip(flipBook.getPageCount() - 1);
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

/** Go to 1-based spread/page index in the flipbook. */
export function readerGoToPage(oneBased) {
  if (!flipBook) return;
  const n = Math.floor(Number(oneBased));
  const total = flipBook.getPageCount();
  if (!Number.isFinite(n) || n < 1 || n > total) return;
  flipBook.flip(n - 1);
  syncPageJumpInput();
}

export function readerSubmitPageJump() {
  const input = document.getElementById('reader-page-jump');
  if (!input) return;
  readerGoToPage(input.value);
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
