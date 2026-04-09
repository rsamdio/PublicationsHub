const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const busboy = require('busboy');
const { encodeCoverToLosslessWebp } = require('./cover-encode');

const callableOptions = { region: 'us-central1' };

function activeGcpProjectId() {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    ''
  ).trim();
}

/**
 * Bucket name for admin.storage() — must match the default bucket in Firebase Console
 * (client `config.firebase.storageBucket`; new projects use *.firebasestorage.app).
 * Optional override: set STORAGE_BUCKET in `functions/.env` for deploy.
 */
function resolveStorageBucketForAdmin() {
  const fromEnv = typeof process.env.STORAGE_BUCKET === 'string' ? process.env.STORAGE_BUCKET.trim() : '';
  if (fromEnv) return fromEnv;
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
    if (cfg.storageBucket) return cfg.storageBucket;
  } catch (_) {}
  const pid = activeGcpProjectId();
  return pid ? `${pid}.firebasestorage.app` : undefined;
}

/**
 * Realtime Database URL for `admin.database()` (mirror.js). `FIREBASE_CONFIG` in Cloud Functions
 * often omits this when the default RTDB instance is in a non-us-central region.
 * Optional: set `FIREBASE_DATABASE_URL` in `functions/.env` (same value as `js/config.js` `databaseURL`).
 */
function resolveDatabaseUrlForAdmin() {
  const fromEnv =
    typeof process.env.FIREBASE_DATABASE_URL === 'string' ? process.env.FIREBASE_DATABASE_URL.trim() : '';
  if (fromEnv) return fromEnv;
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
    if (cfg.databaseURL) return cfg.databaseURL;
  } catch (_) {}
  let pid = activeGcpProjectId();
  if (!pid) {
    try {
      pid = String(JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || '').trim();
    } catch (_) {}
  }
  // Must match Firebase Console RTDB instance / client `config.firebase.databaseURL`.
  if (pid === 'rsapublicationhub') {
    return 'https://rsapublicationhub-default-rtdb.asia-southeast1.firebasedatabase.app';
  }
  return undefined;
}

const resolvedStorageBucket = resolveStorageBucketForAdmin();
const resolvedDatabaseUrl = resolveDatabaseUrlForAdmin();
admin.initializeApp({
  ...(resolvedStorageBucket ? { storageBucket: resolvedStorageBucket } : {}),
  ...(resolvedDatabaseUrl ? { databaseURL: resolvedDatabaseUrl } : {})
});

const db = admin.firestore();

/** @returns {import('@google-cloud/storage').Bucket} */
function getStorageBucket() {
  const name = admin.app().options.storageBucket;
  if (!name) {
    throw new HttpsError(
      'failed-precondition',
      'Firebase Storage bucket is not configured. Enable Storage in the Firebase Console, then redeploy functions.'
    );
  }
  return admin.storage().bucket(name);
}

const {
  r2AccessKeyId,
  r2SecretAccessKey,
  getR2Context,
  putObjectBuffer,
  putObjectStream
} = require('./r2.js');

/** Max PDF size after upload (Storage path); multipart POST is capped lower (Gen2 HTTP ~32 MiB). */
const MAX_PDF_BYTES = 75 * 1024 * 1024;
/** Larger PDFs must use `prepareEditionPdfUpload` + Storage signed URL + `finalizeEditionPdfUpload`. */
const MULTIPART_PDF_MAX_BYTES = 28 * 1024 * 1024;
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
 * @returns {Promise<{ download_url: string, path: string }>}
 */
async function putPdfBufferToR2({ fileBuffer, originalFilename, publisherId, seriesId }) {
  const ctx = getR2Context();
  const safeName = safeFilename(originalFilename);
  const key = `publications/publishers/${publisherId}/series/${seriesId}/${Date.now()}-${safeName}`;
  return putObjectBuffer(ctx, key, fileBuffer, 'application/pdf');
}

async function assertEditionUploadMembership(uid, publisherId, seriesId) {
  const mem = await db.doc(`users/${uid}/publisherMemberships/${publisherId}`).get();
  if (!mem.exists) {
    throw new HttpsError('permission-denied', 'Not a member of this publisher');
  }
  const pub = await db.doc(`publishers/${publisherId}`).get();
  if (!pub.exists || pub.data().status !== 'active') {
    throw new HttpsError('permission-denied', 'Publisher not found or inactive');
  }
  const ser = await db.doc(`series/${seriesId}`).get();
  if (!ser.exists || ser.data().publisher_id !== publisherId) {
    throw new HttpsError('permission-denied', 'Series does not belong to this publisher');
  }
}

/**
 * Callable: start large PDF upload (Firebase Storage signed URL). Client PUTs the file, then calls finalizeEditionPdfUpload.
 */
exports.prepareEditionPdfUpload = onCall(callableOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const uid = request.auth.uid;
  const data = request.data || {};
  const publisherId = typeof data.publisherId === 'string' ? data.publisherId.trim() : '';
  const seriesId = typeof data.seriesId === 'string' ? data.seriesId.trim() : '';
  const filename = typeof data.filename === 'string' ? data.filename : 'edition.pdf';
  const byteSize = Number(data.byteSize);

  if (!idLooksSafe(publisherId) || !idLooksSafe(seriesId)) {
    throw new HttpsError('invalid-argument', 'Invalid publisherId or seriesId');
  }
  if (!Number.isFinite(byteSize) || byteSize < 1 || byteSize > MAX_PDF_BYTES) {
    throw new HttpsError(
      'invalid-argument',
      `PDF must be between 1 and ${MAX_PDF_BYTES / (1024 * 1024)} MB`
    );
  }
  const lower = String(filename).toLowerCase();
  if (!lower.endsWith('.pdf')) {
    throw new HttpsError('invalid-argument', 'Only PDF uploads are allowed');
  }

  await assertEditionUploadMembership(uid, publisherId, seriesId);

  const uploadId = crypto.randomBytes(16).toString('hex');
  const safeName = safeFilename(filename);
  const storagePath = `pdf-uploads/${publisherId}/${seriesId}/${uploadId}/${safeName}`;

  try {
    const bucket = getStorageBucket();
    const file = bucket.file(storagePath);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 20 * 60 * 1000,
      contentType: 'application/pdf'
    });

    await db
      .collection('pdf_upload_sessions')
      .doc(uploadId)
      .set({
        uid,
        publisherId,
        seriesId,
        storagePath,
        originalFilename: safeName,
        byteSize,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

    return { uploadUrl, uploadId };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const msg = String(e?.message || e || 'unknown');
    logger.error('prepareEditionPdfUpload failed', {
      message: msg,
      code: e?.code,
      storageBucket: admin.app().options.storageBucket
    });
    if (/sign|Sign|iam\.|IAM|permission|Permission|credential|Credential|access token/i.test(msg)) {
      throw new HttpsError(
        'failed-precondition',
        'Could not create a signed upload URL. In IAM, ensure the Cloud Functions runtime service account has "Service Account Token Creator" (on itself) and roles that allow Storage object create — see Google Cloud documentation for signed URL permissions.'
      );
    }
    if (/not exist|Not Found|404|No such bucket|bucket/i.test(msg)) {
      throw new HttpsError(
        'failed-precondition',
        `Storage bucket mismatch or bucket missing (${admin.app().options.storageBucket || 'unset'}). Set STORAGE_BUCKET in functions/.env to the exact default bucket from Firebase → Storage, then redeploy.`
      );
    }
    throw new HttpsError('internal', `prepareEditionPdfUpload failed: ${msg.slice(0, 280)}`);
  }
});

/**
 * Callable: after client PUT to Storage, copy stream to R2 and delete temp object.
 */
exports.finalizeEditionPdfUpload = onCall(
  {
    region: 'us-central1',
    secrets: [r2AccessKeyId, r2SecretAccessKey],
    timeoutSeconds: 540,
    memory: '2GiB',
    cpu: 2
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required');
    }
    const uid = request.auth.uid;
    const uploadId = String(request.data?.uploadId || '').trim();
    if (!uploadId || !/^[a-f0-9]{32}$/.test(uploadId)) {
      throw new HttpsError('invalid-argument', 'Invalid uploadId');
    }

    const sessRef = db.collection('pdf_upload_sessions').doc(uploadId);
    const sessSnap = await sessRef.get();
    if (!sessSnap.exists) {
      throw new HttpsError('not-found', 'Upload session not found or already finalized');
    }
    const s = sessSnap.data();
    if (s.uid !== uid) {
      throw new HttpsError('permission-denied', 'Not your upload');
    }

    const bucket = getStorageBucket();
    const file = bucket.file(s.storagePath);

    let meta;
    try {
      [meta] = await file.getMetadata();
    } catch (e) {
      await sessRef.delete().catch(() => {});
      throw new HttpsError('failed-precondition', 'Upload file not found in storage');
    }

    const size = Number(meta.size);
    if (!Number.isFinite(size) || size < 1) {
      await file.delete().catch(() => {});
      await sessRef.delete().catch(() => {});
      throw new HttpsError('failed-precondition', 'Upload missing or empty');
    }
    if (size > MAX_PDF_BYTES) {
      await file.delete().catch(() => {});
      await sessRef.delete().catch(() => {});
      throw new HttpsError('invalid-argument', `PDF must be under ${MAX_PDF_BYTES / (1024 * 1024)} MB`);
    }

    const ctx = getR2Context();
    const safeName = s.originalFilename || safeFilename('edition.pdf');
    const key = `publications/publishers/${s.publisherId}/series/${s.seriesId}/${Date.now()}-${safeName}`;

    try {
      const readStream = file.createReadStream();
      const out = await putObjectStream(ctx, key, readStream, 'application/pdf', size);
      await file.delete().catch((err) => logger.warn('finalizeEditionPdfUpload temp delete', err));
      await sessRef.delete().catch(() => {});
      return out;
    } catch (e) {
      await file.delete().catch(() => {});
      await sessRef.delete().catch(() => {});
      const msg = String(e?.message || e || 'R2 upload failed');
      logger.error('finalizeEditionPdfUpload R2 failed', { message: msg, uploadId, key });
      if (/Server missing R2_/i.test(msg) || /missing R2/i.test(msg)) {
        throw new HttpsError('failed-precondition', msg);
      }
      throw new HttpsError('internal', `Could not store PDF in R2: ${msg.slice(0, 400)}`);
    }
  }
);

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

function trimInternalReference(raw) {
  return String(raw ?? '')
    .trim()
    .slice(0, 200);
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
  const internal_reference = trimInternalReference(data?.internal_reference);
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
    internal_reference,
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
  const payload = { name };
  if (Object.prototype.hasOwnProperty.call(data, 'internal_reference')) {
    payload.internal_reference = trimInternalReference(data.internal_reference);
  }
  await pref.update(payload);
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
 * Stores in R2 under: publications/publishers/{publisherId}/series/{seriesId}/{timestamp}-{name}.pdf
 */
exports.uploadPublicationPdf = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [r2AccessKeyId, r2SecretAccessKey],
    timeoutSeconds: 300,
    memory: '1GiB',
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

      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MULTIPART_PDF_MAX_BYTES } });
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
          if (fileTooLarge || fileBuffer.length > MULTIPART_PDF_MAX_BYTES) {
            res.status(413).json({
              error: `PDF must be under ${MULTIPART_PDF_MAX_BYTES / (1024 * 1024)} MB for direct upload. Use Publisher Studio (Storage path) for up to ${MAX_PDF_BYTES / (1024 * 1024)} MB.`
            });
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

          try {
            const result = await putPdfBufferToR2({
              fileBuffer,
              originalFilename,
              publisherId,
              seriesId
            });
            res.status(200).json(result);
            resolve();
          } catch (r2Err) {
            const msg = r2Err?.message || 'R2 upload failed';
            const isConfig = /missing R2/i.test(msg);
            res.status(isConfig ? 500 : 502).json({ error: msg });
            resolve();
          }
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
 * Multipart: idToken, publisherId, seriesId, pdfRepoPath (object key of the PDF in R2), file (JPEG, PNG, or WebP).
 * Decodes with sharp and writes lossless WebP alongside PDF: …-cover.webp
 */
exports.uploadPublicationCover = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [r2AccessKeyId, r2SecretAccessKey],
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

          let ctx;
          try {
            ctx = getR2Context();
          } catch (cfgErr) {
            res.status(500).json({ error: cfgErr?.message || 'R2 not configured' });
            resolve();
            return;
          }

          const coverOut = await putObjectBuffer(ctx, coverRepoPath, losslessWebpBuffer, 'image/webp');
          res.status(200).json(coverOut);
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
