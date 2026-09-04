/**
 * Render PDF page 1 to a WebP blob (dashboard: first-page cover preview).
 * Loads PDF.js on demand via `viewer.js` (studio no longer includes pdf.min.js in HTML).
 */
import { ensurePdfJs } from '@/lib/client/viewer.js';

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
 * @param {{ maxLongEdge?: number, quality?: number }} [options] - WebP preferred (default 0.92), fallback to PNG/JPEG if unsupported.
 * @returns {Promise<{ blob: Blob | null, error: string | null }>}
 */
export async function renderFirstPageWebpFromPdfFile(file, options = {}) {
  const maxLongEdge = options.maxLongEdge ?? 1200;
  const webpQuality = options.quality ?? 0.92;
  let objectUrl = null;
  try {
    const pdfjsLib = await ensurePdfJs();
    let loadingTask;
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      objectUrl = URL.createObjectURL(file);
      loadingTask = pdfjsLib.getDocument({ url: objectUrl });
    } else {
      const data = await file.arrayBuffer();
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
    }
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
      let blob = await canvasToWebpBlob(canvas, webpQuality);
      if (!blob || blob.size > MAX_COVER_BYTES) {
        blob = await canvasToPngBlob(canvas);
      }
      if (!blob || blob.size > MAX_COVER_BYTES) {
        blob = await canvasToJpegBlob(canvas, 0.92);
      }
      return { blob, error: blob ? null : 'Could not encode preview image' };
    } finally {
      await pdf.destroy().catch(() => {});
    }
  } catch (e) {
    return { blob: null, error: e?.message || 'Failed to read PDF' };
  } finally {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (_) {}
    }
  }
}

/**
 * Render first PDF page directly from URL using Range chunk streaming without downloading the whole file.
 * @param {string} url
 * @param {{ maxLongEdge?: number, quality?: number }} [options]
 * @returns {Promise<{ blob: Blob | null, error: string | null }>}
 */
export async function renderFirstPageWebpFromPdfUrl(url, options = {}) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return { blob: null, error: 'PDF URL required' };
  const maxLongEdge = options.maxLongEdge ?? 1200;
  const webpQuality = options.quality ?? 0.92;

  try {
    const pdfjsLib = await ensurePdfJs();
    const loadingTask = pdfjsLib.getDocument({
      url: cleanUrl,
      withCredentials: false,
      rangeChunkSize: 65536
    });
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
      let blob = await canvasToWebpBlob(canvas, webpQuality);
      if (!blob || blob.size > MAX_COVER_BYTES) {
        blob = await canvasToPngBlob(canvas);
      }
      if (!blob || blob.size > MAX_COVER_BYTES) {
        blob = await canvasToJpegBlob(canvas, 0.92);
      }
      return { blob, error: blob ? null : 'Could not encode preview image' };
    } finally {
      await pdf.destroy().catch(() => {});
    }
  } catch (e) {
    return {
      blob: null,
      error: e?.message || 'Network error loading PDF (CORS or blocked)'
    };
  }
}

