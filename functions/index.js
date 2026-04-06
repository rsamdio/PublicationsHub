const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const busboy = require('busboy');
const { encodeCoverToLosslessWebp } = require('./cover-encode');

const callableOptions = { region: 'us-central1' };

admin.initializeApp();
const db = admin.firestore();

const githubToken = defineSecret('GITHUB_TOKEN');
const githubOwner = defineString('GITHUB_OWNER');
const githubRepo = defineString('GITHUB_REPO');
const githubBranch = defineString('GITHUB_BRANCH', { default: 'main' });

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_COVER_BYTES = 4 * 1024 * 1024;

function safeFilename(name) {
  const base = String(name || 'edition.pdf')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '') || 'edition.pdf';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function idLooksSafe(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function publicationsPathPrefix(publisherId, seriesId) {
  return `publications/publishers/${publisherId}/series/${seriesId}/`;
}

/**
 * @param {string} pdfRepoPath
 * @param {'webp' | 'jpeg'} kind
 */
function coverRepoPathFromPdfRepoPath(pdfRepoPath, kind) {
  const p = typeof pdfRepoPath === 'string' ? pdfRepoPath.trim() : '';
  if (!p.toLowerCase().endsWith('.pdf')) return null;
  const base = p.replace(/\.pdf$/i, '');
  return `${base}-cover.${kind === 'jpeg' ? 'jpg' : 'webp'}`;
}

async function assertPlatformStaff(uid) {
  const snap = await db.doc(`platform_admins/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'Platform access required');
  }
}

async function assertPlatformAdmin(uid) {
  const snap = await db.doc(`platform_admins/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'Platform admin only');
  }
  if (snap.data()?.tier === 'manager') {
    throw new HttpsError('permission-denied', 'Full platform admin only');
  }
}

function normalizeEmailInvite(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

exports.createPublisher = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  await assertPlatformStaff(request.auth.uid);
  const data = request.data || {};
  const name = (data?.name || '').trim();
  let slug = (data?.slug || '').trim().toLowerCase();
  const ownerName = (data?.owner_name || '').trim();
  const ownerEmail = normalizeEmailInvite(data?.owner_email);
  if (!name) {
    throw new HttpsError('invalid-argument', 'name is required');
  }
  if (!ownerName || !ownerEmail) {
    throw new HttpsError('invalid-argument', 'owner_name and owner_email are required');
  }
  if (!slug) {
    slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'publisher';
  }
  const existing = await db.collection('publishers').where('slug', '==', slug).limit(1).get();
  if (!existing.empty) {
    throw new HttpsError('already-exists', 'Slug already in use');
  }
  const ref = db.collection('publishers').doc();
  const batch = db.batch();
  batch.set(ref, {
    name,
    slug,
    status: 'active',
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  const invRef = ref.collection('invites').doc();
  batch.set(invRef, {
    invitee_name: ownerName,
    email_normalized: ownerEmail,
    status: 'pending',
    intended_role: 'owner',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by_uid: request.auth.uid
  });
  await batch.commit();
  return { publisherId: ref.id, ownerInviteId: invRef.id };
});

exports.updatePublisherName = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  await assertPlatformStaff(request.auth.uid);
  const data = request.data || {};
  const publisherId =
    typeof data.publisherId === 'string' ? data.publisherId.trim() : '';
  const name = (data?.name || '').trim();
  if (!idLooksSafe(publisherId)) {
    throw new HttpsError('invalid-argument', 'publisherId required');
  }
  if (!name) {
    throw new HttpsError('invalid-argument', 'name is required');
  }
  const pref = db.doc(`publishers/${publisherId}`);
  const pSnap = await pref.get();
  if (!pSnap.exists) {
    throw new HttpsError('not-found', 'Publisher not found');
  }
  await pref.update({ name });
  return { ok: true };
});

exports.addPublisherMember = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  await assertPlatformAdmin(request.auth.uid);
  const data = request.data || {};
  const email = (data?.email || '').trim().toLowerCase();
  const publisherId = (data?.publisherId || '').trim();
  const role = data?.role === 'owner' ? 'owner' : 'editor';
  if (!email || !publisherId) {
    throw new HttpsError('invalid-argument', 'email and publisherId required');
  }
  let targetUid;
  try {
    const user = await admin.auth().getUserByEmail(email);
    targetUid = user.uid;
  } catch (_) {
    throw new HttpsError('not-found', 'No Firebase user for that email');
  }
  const pubSnap = await db.doc(`publishers/${publisherId}`).get();
  if (!pubSnap.exists) {
    throw new HttpsError('not-found', 'Publisher not found');
  }
  const existingMemberships = await db.collection(`users/${targetUid}/publisherMemberships`).get();
  for (const d of existingMemberships.docs) {
    if (d.id !== publisherId) {
      throw new HttpsError('failed-precondition', 'User already belongs to another publisher');
    }
  }
  const targetUser = await admin.auth().getUser(targetUid);
  const rosterEmail = (targetUser.email || email).toLowerCase();
  const batch = db.batch();
  batch.set(db.doc(`users/${targetUid}/publisherMemberships/${publisherId}`), {
    role,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by_uid: request.auth.uid
  });
  batch.set(db.doc(`publishers/${publisherId}/roster/${targetUid}`), {
    email: rosterEmail,
    display_name: targetUser.displayName || '',
    role,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    added_by_uid: request.auth.uid
  });
  await batch.commit();
  return { ok: true };
});

/**
 * Toggle Explore "Featured" for a published edition (Firestore + RTDB via mirror).
 */
exports.setEditionFeatured = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  await assertPlatformStaff(request.auth.uid);
  const data = request.data || {};
  const editionId = typeof data.editionId === 'string' ? data.editionId.trim() : '';
  const featured = !!data.featured;
  if (!idLooksSafe(editionId)) {
    throw new HttpsError('invalid-argument', 'editionId required');
  }
  const ref = db.doc(`editions/${editionId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Edition not found');
  }
  if (snap.data().status !== 'published') {
    throw new HttpsError('failed-precondition', 'Only published editions can be featured');
  }
  await ref.update({ featured });
  return { ok: true };
});

exports.setPlatformAdmin = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  await assertPlatformAdmin(request.auth.uid); // break-glass: full admin only
  const data = request.data || {};
  const email = (data?.email || '').trim().toLowerCase();
  if (!email) {
    throw new HttpsError('invalid-argument', 'email required');
  }
  let targetUid;
  try {
    const user = await admin.auth().getUserByEmail(email);
    targetUid = user.uid;
  } catch (_) {
    throw new HttpsError('not-found', 'No Firebase user for that email');
  }
  const existingMemberships = await db.collection(`users/${targetUid}/publisherMemberships`).get();
  if (!existingMemberships.empty) {
    throw new HttpsError('failed-precondition', 'User has publisher membership; remove it first');
  }
  await db.doc(`platform_admins/${targetUid}`).set({
    tier: 'admin',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by_uid: request.auth.uid
  });
  return { ok: true };
});

/**
 * Multipart upload: fields idToken, publisherId, seriesId + file (PDF).
 * Stores under repo path: publications/publishers/{publisherId}/series/{seriesId}/{timestamp}-{name}.pdf
 */
exports.uploadPublicationPdf = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [githubToken],
    timeoutSeconds: 120,
    memory: '512MiB',
    invoker: 'public'
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }

    await new Promise((resolve) => {
      let idToken;
      let publisherId;
      let seriesId;
      let fileBuffer = null;
      let originalFilename = 'edition.pdf';
      let fileTooLarge = false;

      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_PDF_BYTES } });
      bb.on('field', (name, val) => {
        if (name === 'idToken') idToken = val;
        if (name === 'publisherId') publisherId = typeof val === 'string' ? val.trim() : '';
        if (name === 'seriesId') seriesId = typeof val === 'string' ? val.trim() : '';
      });
      bb.on('file', (name, file, info) => {
        originalFilename = info.filename || 'edition.pdf';
        const chunks = [];
        file.on('data', (d) => chunks.push(d));
        file.on('limit', () => {
          fileTooLarge = true;
          file.resume();
        });
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });
      bb.on('error', (err) => {
        logger.warn('uploadPublicationPdf multipart parse error', err?.message || err);
        if (!res.headersSent) {
          res.status(400).json({ error: err.message || 'Invalid upload' });
        }
        resolve();
      });
      bb.on('finish', async () => {
        try {
          if (!idToken) {
            res.status(401).json({ error: 'Missing idToken' });
            resolve();
            return;
          }
          let uid;
          try {
            const decoded = await admin.auth().verifyIdToken(idToken);
            uid = decoded.uid;
          } catch (_) {
            res.status(401).json({ error: 'Invalid or expired idToken' });
            resolve();
            return;
          }

          if (!publisherId || !seriesId || !idLooksSafe(publisherId) || !idLooksSafe(seriesId)) {
            res.status(400).json({ error: 'Invalid publisherId or seriesId' });
            resolve();
            return;
          }
          if (!fileBuffer || fileBuffer.length === 0) {
            res.status(400).json({ error: 'PDF file required' });
            resolve();
            return;
          }
          if (fileTooLarge || fileBuffer.length > MAX_PDF_BYTES) {
            res.status(413).json({ error: `PDF must be under ${MAX_PDF_BYTES / (1024 * 1024)} MB` });
            resolve();
            return;
          }

          const mem = await db.doc(`users/${uid}/publisherMemberships/${publisherId}`).get();
          if (!mem.exists) {
            res.status(403).json({ error: 'Not a member of this publisher' });
            resolve();
            return;
          }
          const pub = await db.doc(`publishers/${publisherId}`).get();
          if (!pub.exists || pub.data().status !== 'active') {
            res.status(403).json({ error: 'Publisher not found or inactive' });
            resolve();
            return;
          }
          const ser = await db.doc(`series/${seriesId}`).get();
          if (!ser.exists || ser.data().publisher_id !== publisherId) {
            res.status(403).json({ error: 'Series does not belong to this publisher' });
            resolve();
            return;
          }

          const lower = originalFilename.toLowerCase();
          if (!lower.endsWith('.pdf')) {
            res.status(400).json({ error: 'Only PDF uploads are allowed' });
            resolve();
            return;
          }

          const owner = githubOwner.value();
          const repo = githubRepo.value();
          const branch = githubBranch.value();
          const token = githubToken.value();
          if (!owner || !repo || !token) {
            res.status(500).json({ error: 'Server missing GITHUB_OWNER, GITHUB_REPO, or GITHUB_TOKEN secret' });
            resolve();
            return;
          }

          const safeName = safeFilename(originalFilename);
          const repoPath = `publications/publishers/${publisherId}/series/${seriesId}/${Date.now()}-${safeName}`;
          const pathForApi = repoPath.split('/').map(encodeURIComponent).join('/');
          const contentBase64 = fileBuffer.toString('base64');

          const ghRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${pathForApi}`,
            {
              method: 'PUT',
              headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                message: `Upload ${repoPath}`,
                content: contentBase64,
                branch
              })
            }
          );
          const ghJson = await ghRes.json().catch(() => ({}));
          if (!ghRes.ok) {
            const msg = ghJson.message || `GitHub API error ${ghRes.status}`;
            res.status(502).json({ error: msg });
            resolve();
            return;
          }
          const downloadUrl =
            ghJson.content?.download_url ||
            `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${repoPath}`;
          res.status(200).json({ download_url: downloadUrl, path: repoPath });
          resolve();
        } catch (e) {
          logger.error('uploadPublicationPdf failed', e);
          if (!res.headersSent) {
            res.status(500).json({ error: e.message || 'Upload failed' });
          }
          resolve();
        }
      });
      // Gen 2 / Cloud Run expose the full body as rawBody; piping req often breaks multipart (400 / empty file).
      const raw = req.rawBody;
      if (Buffer.isBuffer(raw) && raw.length > 0) {
        bb.end(raw);
      } else {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            bb.end(chunks.length ? Buffer.concat(chunks) : undefined);
          } catch (e) {
            logger.warn('uploadPublicationPdf busboy.end failed', e?.message || e);
            if (!res.headersSent) res.status(400).json({ error: 'Invalid upload body' });
            resolve();
          }
        });
        req.on('error', (e) => {
          logger.warn('uploadPublicationPdf request stream error', e?.message || e);
          if (!res.headersSent) res.status(400).json({ error: 'Upload read failed' });
          resolve();
        });
      }
    });
  }
);

/**
 * Multipart: idToken, publisherId, seriesId, pdfRepoPath (GitHub path of the PDF), file (JPEG, PNG, or WebP).
 * Decodes with sharp and writes lossless WebP alongside PDF: …-cover.webp
 */
exports.uploadPublicationCover = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [githubToken],
    timeoutSeconds: 120,
    memory: '512MiB',
    invoker: 'public'
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }

    await new Promise((resolve) => {
      let idToken;
      let publisherId;
      let seriesId;
      let pdfRepoPath;
      let fileBuffer = null;
      let fileTooLarge = false;

      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_COVER_BYTES } });
      bb.on('field', (name, val) => {
        if (name === 'idToken') idToken = val;
        if (name === 'publisherId') publisherId = typeof val === 'string' ? val.trim() : '';
        if (name === 'seriesId') seriesId = typeof val === 'string' ? val.trim() : '';
        if (name === 'pdfRepoPath') pdfRepoPath = typeof val === 'string' ? val.trim() : '';
      });
      bb.on('file', (name, file) => {
        const chunks = [];
        file.on('data', (d) => chunks.push(d));
        file.on('limit', () => {
          fileTooLarge = true;
          file.resume();
        });
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });
      bb.on('error', (err) => {
        logger.warn('uploadPublicationCover multipart error', err?.message || err);
        if (!res.headersSent) res.status(400).json({ error: err.message || 'Invalid upload' });
        resolve();
      });
      bb.on('finish', async () => {
        try {
          if (!idToken) {
            res.status(401).json({ error: 'Missing idToken' });
            resolve();
            return;
          }
          let uid;
          try {
            const decoded = await admin.auth().verifyIdToken(idToken);
            uid = decoded.uid;
          } catch (_) {
            res.status(401).json({ error: 'Invalid or expired idToken' });
            resolve();
            return;
          }

          if (!publisherId || !seriesId || !idLooksSafe(publisherId) || !idLooksSafe(seriesId)) {
            res.status(400).json({ error: 'Invalid publisherId or seriesId' });
            resolve();
            return;
          }

          const prefix = publicationsPathPrefix(publisherId, seriesId);
          if (!pdfRepoPath || !pdfRepoPath.startsWith(prefix) || !pdfRepoPath.toLowerCase().endsWith('.pdf')) {
            res.status(400).json({ error: 'Invalid pdfRepoPath' });
            resolve();
            return;
          }

          if (!fileBuffer || fileBuffer.length === 0) {
            res.status(400).json({ error: 'Cover file required' });
            resolve();
            return;
          }
          if (fileTooLarge || fileBuffer.length > MAX_COVER_BYTES) {
            res.status(413).json({ error: `Cover must be under ${MAX_COVER_BYTES / (1024 * 1024)} MB` });
            resolve();
            return;
          }

          let losslessWebpBuffer;
          try {
            losslessWebpBuffer = await encodeCoverToLosslessWebp(fileBuffer);
          } catch (_) {
            res.status(400).json({ error: 'Cover must be a supported image (JPEG, PNG, or WebP)' });
            resolve();
            return;
          }
          if (losslessWebpBuffer.length > MAX_COVER_BYTES) {
            res.status(413).json({
              error: `Lossless WebP exceeds ${MAX_COVER_BYTES / (1024 * 1024)} MB — reduce PDF preview size or use a smaller image`
            });
            resolve();
            return;
          }

          const coverRepoPath = coverRepoPathFromPdfRepoPath(pdfRepoPath, 'webp');
          if (!coverRepoPath) {
            res.status(400).json({ error: 'Could not derive cover path' });
            resolve();
            return;
          }

          const mem = await db.doc(`users/${uid}/publisherMemberships/${publisherId}`).get();
          if (!mem.exists) {
            res.status(403).json({ error: 'Not a member of this publisher' });
            resolve();
            return;
          }
          const pub = await db.doc(`publishers/${publisherId}`).get();
          if (!pub.exists || pub.data().status !== 'active') {
            res.status(403).json({ error: 'Publisher not found or inactive' });
            resolve();
            return;
          }
          const ser = await db.doc(`series/${seriesId}`).get();
          if (!ser.exists || ser.data().publisher_id !== publisherId) {
            res.status(403).json({ error: 'Series does not belong to this publisher' });
            resolve();
            return;
          }

          const owner = githubOwner.value();
          const repo = githubRepo.value();
          const branch = githubBranch.value();
          const token = githubToken.value();
          if (!owner || !repo || !token) {
            res.status(500).json({ error: 'Server missing GITHUB_OWNER, GITHUB_REPO, or GITHUB_TOKEN secret' });
            resolve();
            return;
          }

          const pathForApi = coverRepoPath.split('/').map(encodeURIComponent).join('/');
          const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${pathForApi}?ref=${encodeURIComponent(branch)}`;
          const getRes = await fetch(getUrl, {
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${token}`,
              'X-GitHub-Api-Version': '2022-11-28'
            }
          });
          let existingSha;
          if (getRes.ok) {
            const gj = await getRes.json().catch(() => ({}));
            if (gj.sha) existingSha = gj.sha;
          }

          const contentBase64 = losslessWebpBuffer.toString('base64');
          const putBody = {
            message: `Upload cover ${coverRepoPath}`,
            content: contentBase64,
            branch
          };
          if (existingSha) putBody.sha = existingSha;

          const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${pathForApi}`, {
            method: 'PUT',
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${token}`,
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(putBody)
          });
          const ghJson = await ghRes.json().catch(() => ({}));
          if (!ghRes.ok) {
            const msg = ghJson.message || `GitHub API error ${ghRes.status}`;
            res.status(502).json({ error: msg });
            resolve();
            return;
          }
          const downloadUrl =
            ghJson.content?.download_url ||
            `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${coverRepoPath}`;
          res.status(200).json({ download_url: downloadUrl, path: coverRepoPath });
          resolve();
        } catch (e) {
          logger.error('uploadPublicationCover failed', e);
          if (!res.headersSent) {
            res.status(500).json({ error: e.message || 'Upload failed' });
          }
          resolve();
        }
      });

      const raw = req.rawBody;
      if (Buffer.isBuffer(raw) && raw.length > 0) {
        bb.end(raw);
      } else {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            bb.end(chunks.length ? Buffer.concat(chunks) : undefined);
          } catch (e) {
            logger.warn('uploadPublicationCover busboy.end failed', e?.message || e);
            if (!res.headersSent) res.status(400).json({ error: 'Invalid upload body' });
            resolve();
          }
        });
        req.on('error', (e) => {
          logger.warn('uploadPublicationCover stream error', e?.message || e);
          if (!res.headersSent) res.status(400).json({ error: 'Upload read failed' });
          resolve();
        });
      }
    });
  }
);

Object.assign(exports, require('./extra-exports'));
Object.assign(exports, require('./mirror'));
