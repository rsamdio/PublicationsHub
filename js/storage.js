/**
 * Edition PDF + cover WebP upload via Cloud Functions — GitHub PAT never touches the browser.
 */
import { config } from './config.js';
import { fbAuth } from './firebase-init.js';

/**
 * @param {File} file PDF only
 * @param {{ publisherId: string, seriesId: string }} scope
 * @returns {Promise<{ download_url: string, path?: string, error?: string }>}
 */
export async function uploadEditionPdf(file, { publisherId, seriesId }) {
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
  return { download_url: data.download_url };
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
  return { download_url: data.download_url, path: data.path };
}
