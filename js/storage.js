/**
 * Edition PDF + cover WebP upload via Cloud Functions — R2 credentials never touch the browser.
 */
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { config } from './config.js';
import { fbAuth, fbFunctions } from './firebase-init.js';

/** Same cap as `MAX_PDF_BYTES` in functions/index.js */
const MAX_PDF_BYTES = 65 * 1024 * 1024;
/** Multipart POST to `uploadPublicationPdf` must stay under Cloud Functions HTTP body limit (~32 MiB). */
const MULTIPART_PDF_MAX_BYTES = 28 * 1024 * 1024;

/**
 * PDFs larger than this use Firebase Storage (signed URL) then `finalizeEditionPdfUpload`.
 * @param {File} file PDF only
 * @param {{ publisherId: string, seriesId: string }} scope
 * @returns {Promise<{ download_url: string, path?: string, error?: string }>}
 */
export async function uploadEditionPdf(file, { publisherId, seriesId }) {
  const projectId = config.firebase?.projectId;
  if (!projectId) {
    return { download_url: '', error: 'Missing Firebase projectId in config.js' };
  }
  if (file.size > MAX_PDF_BYTES) {
    return {
      download_url: '',
      error: `PDF must be ${MAX_PDF_BYTES / (1024 * 1024)} MB or smaller`
    };
  }

  const auth = fbAuth();
  const user = auth.currentUser;
  if (!user) {
    return { download_url: '', error: 'Sign in required' };
  }

  if (file.size > MULTIPART_PDF_MAX_BYTES) {
    if (config.uploadPublicationPdfUrl) {
      return {
        download_url: '',
        error:
          'PDFs over ~28 MB are not supported when using a custom uploadPublicationPdfUrl (emulator). Test with a smaller file or deploy without that override.'
      };
    }
    return uploadEditionPdfViaStorage(file, { publisherId, seriesId });
  }

  let idToken;
  try {
    idToken = await user.getIdToken();
  } catch (e) {
    return { download_url: '', error: e?.message || 'Could not get ID token' };
  }

  const url =
    config.uploadPublicationPdfUrl ||
    `https://us-central1-${projectId}.cloudfunctions.net/uploadPublicationPdf`;
  const form = new FormData();
  form.append('idToken', idToken);
  form.append('publisherId', publisherId);
  form.append('seriesId', seriesId);
  form.append('file', file, file.name);

  let res;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch (e) {
    return { download_url: '', error: e?.message || 'Network error calling upload endpoint' };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || `Upload failed (${res.status})`;
    return { download_url: '', error: msg };
  }
  if (!data.download_url) {
    return { download_url: '', error: 'Upload succeeded but no download URL returned' };
  }
  return { download_url: data.download_url, path: data.path };
}

/**
 * @param {File} file
 * @param {{ publisherId: string, seriesId: string }} scope
 */
async function uploadEditionPdfViaStorage(file, { publisherId, seriesId }) {
  const prepareFn = httpsCallable(fbFunctions(), 'prepareEditionPdfUpload');
  let prep;
  try {
    const prepRes = await prepareFn({
      publisherId,
      seriesId,
      filename: file.name,
      byteSize: file.size
    });
    prep = prepRes.data;
  } catch (e) {
    const msg =
      e?.message ||
      e?.details ||
      'Could not start large upload. Ensure Firebase Storage is enabled and `storage.rules` are deployed.';
    return { download_url: '', error: msg };
  }

  const uploadUrl = prep?.uploadUrl;
  const uploadId = prep?.uploadId;
  if (!uploadUrl || !uploadId) {
    return { download_url: '', error: 'Upload service did not return a storage URL' };
  }

  let putRes;
  try {
    putRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/pdf' }
    });
  } catch (e) {
    return { download_url: '', error: e?.message || 'Could not upload file to storage' };
  }

  if (!putRes.ok) {
    return {
      download_url: '',
      error: `Storage upload failed (${putRes.status}). If this persists, confirm Storage CORS allows PUT from your site (see docs/STORAGE.md).`
    };
  }

  const finalizeFn = httpsCallable(fbFunctions(), 'finalizeEditionPdfUpload');
  try {
    const done = await finalizeFn({ uploadId });
    const d = done.data;
    if (!d?.download_url) {
      return { download_url: '', error: 'Finalize succeeded but no download URL returned' };
    }
    return { download_url: d.download_url, path: d.path };
  } catch (e) {
    return { download_url: '', error: e?.message || e?.details || 'Could not finalize upload' };
  }
}

/**
 * Upload edition cover (PNG preferred from PDF preview; server re-encodes to lossless WebP).
 * @param {Blob} webpBlob — PNG, WebP, or JPEG
 * @param {{ publisherId: string, seriesId: string, pdfRepoPath: string }} scope
 * @returns {Promise<{ download_url: string, error?: string }>}
 */
export async function uploadEditionCoverWebp(webpBlob, { publisherId, seriesId, pdfRepoPath }) {
  const projectId = config.firebase?.projectId;
  if (!projectId) {
    return { download_url: '', error: 'Missing Firebase projectId in config.js' };
  }
  const path = typeof pdfRepoPath === 'string' ? pdfRepoPath.trim() : '';
  if (!path) {
    return { download_url: '', error: 'Missing PDF repo path for cover upload' };
  }
  const auth = fbAuth();
  const user = auth.currentUser;
  if (!user) {
    return { download_url: '', error: 'Sign in required' };
  }
  let idToken;
  try {
    idToken = await user.getIdToken();
  } catch (e) {
    return { download_url: '', error: e?.message || 'Could not get ID token' };
  }

  const url =
    config.uploadPublicationCoverUrl ||
    `https://us-central1-${projectId}.cloudfunctions.net/uploadPublicationCover`;
  const form = new FormData();
  form.append('idToken', idToken);
  form.append('publisherId', publisherId);
  form.append('seriesId', seriesId);
  form.append('pdfRepoPath', path);
  const fname =
    webpBlob.type === 'image/jpeg'
      ? 'cover.jpg'
      : webpBlob.type === 'image/png'
        ? 'cover.png'
        : 'cover.webp';
  form.append('file', webpBlob, fname);

  let res;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch (e) {
    return { download_url: '', error: e?.message || 'Network error calling cover upload' };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { download_url: '', error: data.error || `Cover upload failed (${res.status})` };
  }
  if (!data.download_url) {
    return { download_url: '', error: 'Cover upload succeeded but no download URL returned' };
  }
  return {
    download_url: data.download_url,
    cover_thumb_url: data.thumb_download_url || data.cover_thumb_url || null
  };
}

/**
 * Upload series cover image (JPEG/PNG/WebP); server converts to WebP.
 * @param {Blob|File} file
 * @param {{ publisherId: string, seriesId: string }} scope
 */
export async function uploadSeriesCoverFile(file, { publisherId, seriesId }) {
  const projectId = config.firebase?.projectId;
  if (!projectId) {
    return { download_url: '', error: 'Missing Firebase projectId in config.js' };
  }
  const auth = fbAuth();
  const user = auth.currentUser;
  if (!user) {
    return { download_url: '', error: 'Sign in required' };
  }
  let idToken;
  try {
    idToken = await user.getIdToken();
  } catch (e) {
    return { download_url: '', error: e?.message || 'Could not get ID token' };
  }

  const url =
    config.uploadSeriesCoverUrl ||
    `https://us-central1-${projectId}.cloudfunctions.net/uploadSeriesCover`;
  const form = new FormData();
  form.append('idToken', idToken);
  form.append('publisherId', publisherId);
  form.append('seriesId', seriesId);
  const fname = file instanceof File && file.name ? file.name : 'cover.jpg';
  form.append('file', file, fname);

  let res;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch (e) {
    return { download_url: '', error: e?.message || 'Network error calling upload endpoint' };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { download_url: '', error: data.error || `Upload failed (${res.status})` };
  }
  if (!data.download_url) {
    return { download_url: '', error: 'Upload succeeded but no download URL returned' };
  }
  return {
    download_url: data.download_url,
    path: data.path,
    cover_thumb_url: data.thumb_download_url || data.cover_thumb_url || null
  };
}
