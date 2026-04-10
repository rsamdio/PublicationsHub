/**
 * Render PDF page 1 to a WebP blob (dashboard: first-page cover preview).
 * Loads PDF.js on demand via `viewer.js` (studio no longer includes pdf.min.js in HTML).
 */
import { ensurePdfJs } from './viewer.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality 0–1
 * @returns {Promise<Blob | null>}
 */
const MAX_COVER_BYTES = 4 * 1024 * 1024;

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
}

function canvasToWebpBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/webp', quality);
  });
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

/**
 * @param {File | Blob} file
 * @param {{ maxLongEdge?: number, quality?: number }} [options] — `quality` is used only if PNG exceeds 4MB (WebP fallback, default 1 = max browser quality).
 * @returns {Promise<{ blob: Blob | null, error: string | null }>}
 */
export async function renderFirstPageWebpFromPdfFile(file, options = {}) {
  const maxLongEdge = options.maxLongEdge ?? 1200;
  const webpFallbackQuality = options.quality ?? 1;
  try {
    const pdfjsLib = await ensurePdfJs();
    const data = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
    const pdf = await loadingTask.promise;
    try {
      const page = await pdf.getPage(1);
      const baseVp = page.getViewport({ scale: 1 });
      const longEdge = Math.max(baseVp.width, baseVp.height);
      const scale = Math.min(maxLongEdge / longEdge, 2.5);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return { blob: null, error: 'Canvas not available' };
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      let blob = await canvasToPngBlob(canvas);
      if (!blob || blob.size > MAX_COVER_BYTES) {
        blob = await canvasToWebpBlob(canvas, webpFallbackQuality);
      }
      if (!blob) {
        blob = await canvasToJpegBlob(canvas, 0.95);
      }
      return { blob, error: blob ? null : 'Could not encode preview image' };
    } finally {
      await pdf.destroy().catch(() => {});
    }
  } catch (e) {
    return { blob: null, error: e?.message || 'Failed to read PDF' };
  }
}

/**
 * @param {string} url
 * @param {{ maxLongEdge?: number, quality?: number }} [options]
 * @returns {Promise<{ blob: Blob | null, error: string | null }>}
 */
export async function renderFirstPageWebpFromPdfUrl(url, options = {}) {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) {
      return { blob: null, error: `Could not fetch PDF (${res.status})` };
    }
    const buf = await res.arrayBuffer();
    const file = new File([buf], 'edition.pdf', { type: 'application/pdf' });
    return renderFirstPageWebpFromPdfFile(file, options);
  } catch (e) {
    return {
      blob: null,
      error: e?.message || 'Network error loading PDF (CORS or blocked)'
    };
  }
}
