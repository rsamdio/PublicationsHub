/**
 * Series cover upload (sharp→WebP), R2 deletes, publisher/platform invites, delete edition/series.
 */
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const busboy = require('busboy');
const { encodeCoverToLosslessWebp } = require('./cover-encode');
const {
  r2AccessKeyId,
  r2SecretAccessKey,
  getR2Context,
  putObjectBuffer,
  deleteObjectKey
} = require('./r2.js');

const db = admin.firestore();
const callableOptions = { region: 'us-central1' };

const MAX_COVER_BYTES = 4 * 1024 * 1024;

function idLooksSafe(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function publicationsPathPrefix(publisherId, seriesId) {
  return `publications/publishers/${publisherId}/series/${seriesId}/`;
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

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
  const tier = snap.data()?.tier === 'manager' ? 'manager' : 'admin';
  return { tier };
}

async function assertFullPlatformAdmin(uid) {
  const { tier } = await assertPlatformStaff(uid);
  if (tier === 'manager') {
    throw new HttpsError('permission-denied', 'Full platform admin only');
  }
}

async function isPublisherMemberUid(uid, publisherId) {
  const m = await db.doc(`users/${uid}/publisherMemberships/${publisherId}`).get();
  return m.exists;
}

async function isPublisherOwnerUid(uid, publisherId) {
  const m = await db.doc(`users/${uid}/publisherMemberships/${publisherId}`).get();
  return m.exists && m.data().role === 'owner';
}

async function countPublisherMemberships(uid) {
  const col = await db.collection(`users/${uid}/publisherMemberships`).get();
  return col.size;
}

async function assertAtMostOnePublisher(uid, publisherId) {
  const col = await db.collection(`users/${uid}/publisherMemberships`).get();
  for (const d of col.docs) {
    if (d.id === publisherId) continue;
    const pubSnap = await db.doc(`publishers/${d.id}`).get();
    if (!pubSnap.exists) {
      logger.warn('Removing orphan publisherMembership (publisher deleted)', { uid, stalePublisherId: d.id });
      await d.ref.delete();
      continue;
    }
    throw new HttpsError('failed-precondition', 'Account is already linked to another publisher');
  }
}

/**
 * Remove every users/{uid}/publisherMemberships/{publisherId} doc.
 * Uses an unfiltered collection-group read (same pattern as mirror backfill) because
 * documentId() equality cannot be indexed for collection groups in indexes.json.
 */
async function deleteAllPublisherMembershipDocs(publisherId) {
  const snap = await db.collectionGroup('publisherMemberships').get();
  const matches = snap.docs.filter((d) => d.id === publisherId);
  const chunk = 400;
  for (let i = 0; i < matches.length; i += chunk) {
    const batch = db.batch();
    for (const doc of matches.slice(i, i + chunk)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function deleteEditionStorageFiles(d, ctx) {
  const pdfPath = d.pdf_repo_path && String(d.pdf_repo_path).trim();
  if (!pdfPath) return;
  await deleteObjectKey(ctx, pdfPath);
  const webpCover = coverRepoPathFromPdfRepoPath(pdfPath, 'webp');
  const jpgCover = coverRepoPathFromPdfRepoPath(pdfPath, 'jpeg');
  if (webpCover) await deleteObjectKey(ctx, webpCover).catch(() => {});
  if (jpgCover) await deleteObjectKey(ctx, jpgCover).catch(() => {});
}

exports.uploadSeriesCover = onRequest(
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
      let fileBuffer = null;
      let fileTooLarge = false;

      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_COVER_BYTES } });
      bb.on('field', (name, val) => {
        if (name === 'idToken') idToken = val;
        if (name === 'publisherId') publisherId = typeof val === 'string' ? val.trim() : '';
        if (name === 'seriesId') seriesId = typeof val === 'string' ? val.trim() : '';
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
          if (!(await isPublisherMemberUid(uid, publisherId))) {
            res.status(403).json({ error: 'Not a member of this publisher' });
            resolve();
            return;
          }

          const ser = await db.doc(`series/${seriesId}`).get();
          if (!ser.exists || ser.data().publisher_id !== publisherId) {
            res.status(403).json({ error: 'Series does not belong to this publisher' });
            resolve();
            return;
          }

          if (!fileBuffer || fileBuffer.length === 0) {
            res.status(400).json({ error: 'Image file required' });
            resolve();
            return;
          }
          if (fileTooLarge || fileBuffer.length > MAX_COVER_BYTES) {
            res.status(413).json({ error: 'Image too large' });
            resolve();
            return;
          }

          let webpBuffer;
          try {
            webpBuffer = await encodeCoverToLosslessWebp(fileBuffer);
          } catch (e) {
            res.status(400).json({ error: 'Could not process image (use JPEG or PNG)' });
            resolve();
            return;
          }
          if (webpBuffer.length > MAX_COVER_BYTES) {
            res.status(413).json({
              error: `Lossless WebP exceeds ${MAX_COVER_BYTES / (1024 * 1024)} MB — use a smaller source image`
            });
            resolve();
            return;
          }

          const ctx = getR2Context();
          const objectKey = `${publicationsPathPrefix(publisherId, seriesId)}series-cover.webp`;
          const out = await putObjectBuffer(ctx, objectKey, webpBuffer, 'image/webp');
          res.status(200).json(out);
          resolve();
        } catch (e) {
          logger.error('uploadSeriesCover', e);
          if (!res.headersSent) res.status(500).json({ error: e.message || 'Upload failed' });
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
            if (!res.headersSent) res.status(400).json({ error: 'Invalid body' });
            resolve();
          }
        });
        req.on('error', () => {
          if (!res.headersSent) res.status(400).json({ error: 'Read failed' });
          resolve();
        });
      }
    });
  }
);

exports.deleteEditionAssets = onCall(
  { region: 'us-central1', secrets: [r2AccessKeyId, r2SecretAccessKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
    const editionId = typeof request.data?.editionId === 'string' ? request.data.editionId.trim() : '';
    if (!idLooksSafe(editionId)) throw new HttpsError('invalid-argument', 'editionId required');

    const ref = db.doc(`editions/${editionId}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Edition not found');
    const d = snap.data();
    const pubId = d.publisher_id;
    const uid = request.auth.uid;

    const isStaff = await db.doc(`platform_admins/${uid}`).get().then((s) => s.exists);
    if (!isStaff && !(await isPublisherMemberUid(uid, pubId))) {
      throw new HttpsError('permission-denied', 'Not allowed');
    }

    const ctx = getR2Context();
    await deleteEditionStorageFiles(d, ctx);
    await ref.delete();
    return { ok: true };
  }
);

/**
 * Delete series doc, its editions (Firestore + R2 objects), and series cover. Caller must authorize.
 * @param {FirebaseFirestore.QueryDocumentSnapshot} seriesSnap
 */
async function deleteSeriesCore(seriesSnap, ctx) {
  const seriesId = seriesSnap.id;
  const pubId = seriesSnap.data().publisher_id;
  const seriesCoverPath = `${publicationsPathPrefix(pubId, seriesId)}series-cover.webp`;
  await deleteObjectKey(ctx, seriesCoverPath).catch(() => {});

  const edSnap = await db.collection('editions').where('series_id', '==', seriesId).get();
  for (const doc of edSnap.docs) {
    await deleteEditionStorageFiles(doc.data(), ctx).catch((e) => logger.warn('deleteSeries edition R2', e));
    await doc.ref.delete();
  }

  await seriesSnap.ref.delete();
}

exports.deleteSeries = onCall(
  { region: 'us-central1', secrets: [r2AccessKeyId, r2SecretAccessKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
    const seriesId = typeof request.data?.seriesId === 'string' ? request.data.seriesId.trim() : '';
    if (!idLooksSafe(seriesId)) throw new HttpsError('invalid-argument', 'seriesId required');

    const sref = db.doc(`series/${seriesId}`);
    const sSnap = await sref.get();
    if (!sSnap.exists) throw new HttpsError('not-found', 'Series not found');
    const pubId = sSnap.data().publisher_id;
    const uid = request.auth.uid;
    const isStaff = await db.doc(`platform_admins/${uid}`).get().then((s) => s.exists);
    if (!isStaff && !(await isPublisherMemberUid(uid, pubId))) {
      throw new HttpsError('permission-denied', 'Not allowed');
    }

    const ctx = getR2Context();
    await deleteSeriesCore(sSnap, ctx);
    return { ok: true };
  }
);

/**
 * Full platform admin only: removes all series/editions (incl. R2 assets), roster, invites, memberships, publisher doc.
 */
exports.deletePublisher = onCall(
  { region: 'us-central1', secrets: [r2AccessKeyId, r2SecretAccessKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
    await assertFullPlatformAdmin(request.auth.uid);
    const publisherId =
      typeof request.data?.publisherId === 'string' ? request.data.publisherId.trim() : '';
    if (!idLooksSafe(publisherId)) throw new HttpsError('invalid-argument', 'publisherId required');

    const pref = db.doc(`publishers/${publisherId}`);
    const pSnap = await pref.get();
    if (!pSnap.exists) throw new HttpsError('not-found', 'Publisher not found');

    await deleteAllPublisherMembershipDocs(publisherId);

    const ctx = getR2Context();

    const seriesQ = await db.collection('series').where('publisher_id', '==', publisherId).get();
    for (const sdoc of seriesQ.docs) {
      await deleteSeriesCore(sdoc, ctx);
    }

    const rosterSnap = await db.collection('publishers').doc(publisherId).collection('roster').get();
    for (const doc of rosterSnap.docs) {
      await doc.ref.delete();
    }

    const invSnap = await db.collection('publishers').doc(publisherId).collection('invites').get();
    for (const doc of invSnap.docs) {
      await doc.ref.delete();
    }

    await pref.delete();
    return { ok: true };
  }
);

exports.publisherCreateInvite = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const publisherId = typeof request.data?.publisherId === 'string' ? request.data.publisherId.trim() : '';
  const inviteeName = typeof request.data?.invitee_name === 'string' ? request.data.invitee_name.trim() : '';
  const email = normalizeEmail(request.data?.email);
  let intendedRole = request.data?.intended_role === 'owner' ? 'owner' : 'editor';

  if (!idLooksSafe(publisherId) || !inviteeName || !email) {
    throw new HttpsError('invalid-argument', 'publisherId, invitee_name, email required');
  }

  const platformSnap = await db.doc(`platform_admins/${uid}`).get();
  const isPlatform = platformSnap.exists;
  if (!isPlatform) {
    if (!(await isPublisherOwnerUid(uid, publisherId))) {
      throw new HttpsError('permission-denied', 'Owner or platform admin only');
    }
    intendedRole = 'editor';
  } else {
    const tier = platformSnap.data()?.tier === 'manager' ? 'manager' : 'admin';
    if (tier === 'manager' && intendedRole === 'owner') {
      intendedRole = 'editor';
    }
    if (intendedRole !== 'owner' && intendedRole !== 'editor') intendedRole = 'editor';
  }

  const invitesCol = db.collection('publishers').doc(publisherId).collection('invites');
  const dup = await invitesCol
    .where('email_normalized', '==', email)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (!dup.empty) {
    throw new HttpsError('already-exists', 'Pending invite already exists for this email');
  }

  const ref = await invitesCol.add({
    invitee_name: inviteeName,
    email_normalized: email,
    status: 'pending',
    intended_role: intendedRole,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by_uid: uid
  });
  return { inviteId: ref.id };
});

exports.publisherRevokeInvite = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const publisherId = typeof request.data?.publisherId === 'string' ? request.data.publisherId.trim() : '';
  const inviteId = typeof request.data?.inviteId === 'string' ? request.data.inviteId.trim() : '';
  if (!idLooksSafe(publisherId) || !inviteId) {
    throw new HttpsError('invalid-argument', 'publisherId and inviteId required');
  }

  const isStaff = await db.doc(`platform_admins/${uid}`).get().then((s) => s.exists);
  if (!isStaff && !(await isPublisherOwnerUid(uid, publisherId))) {
    throw new HttpsError('permission-denied', 'Not allowed');
  }

  const iref = db.doc(`publishers/${publisherId}/invites/${inviteId}`);
  const snap = await iref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Invite not found');
  await iref.update({ status: 'revoked' });
  return { ok: true };
});

exports.listMyPendingInvites = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const email = normalizeEmail(request.auth.token.email);
  if (!email) throw new HttpsError('failed-precondition', 'Account has no email');

  let snap;
  try {
    snap = await db
      .collectionGroup('invites')
      .where('email_normalized', '==', email)
      .where('status', '==', 'pending')
      .get();
  } catch (err) {
    logger.error('listMyPendingInvites Firestore query failed', err);
    const msg = err?.message || String(err);
    const code = err?.code;
    if (
      code === 9 ||
      code === 'FAILED_PRECONDITION' ||
      /index/i.test(msg) ||
      /FAILED_PRECONDITION/i.test(msg)
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Firestore needs a composite index for publisher invites. Run: firebase deploy --only firestore:indexes — then wait until the index shows Enabled in the Firebase console (Build → Firestore → Indexes).'
      );
    }
    throw new HttpsError('internal', 'Could not list invitations');
  }

  const publisherIds = [];
  const rows = [];
  for (const doc of snap.docs) {
    const m = /^publishers\/([^/]+)\/invites\/[^/]+$/.exec(doc.ref.path);
    if (!m) {
      logger.warn('listMyPendingInvites skipping unexpected doc path', { path: doc.ref.path });
      continue;
    }
    publisherIds.push(m[1]);
    rows.push({ doc, publisherId: m[1] });
  }

  const uniquePubIds = [...new Set(publisherIds)];
  const pubSnaps = await Promise.all(uniquePubIds.map((id) => db.doc(`publishers/${id}`).get()));
  const pubById = {};
  uniquePubIds.forEach((id, i) => {
    pubById[id] = pubSnaps[i];
  });

  const out = [];
  for (const { doc, publisherId } of rows) {
    const pub = pubById[publisherId];
    out.push({
      inviteId: doc.id,
      publisherId,
      publisherName: pub?.exists ? pub.data().name || '' : '',
      invitee_name: doc.data().invitee_name || '',
      intended_role: doc.data().intended_role || 'editor'
    });
  }
  return { invites: out };
});

exports.acceptPublisherInvite = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const publisherId = typeof request.data?.publisherId === 'string' ? request.data.publisherId.trim() : '';
  const inviteId = typeof request.data?.inviteId === 'string' ? request.data.inviteId.trim() : '';
  if (!idLooksSafe(publisherId) || !inviteId) {
    throw new HttpsError('invalid-argument', 'publisherId and inviteId required');
  }

  const email = normalizeEmail(request.auth.token.email);
  const iref = db.doc(`publishers/${publisherId}/invites/${inviteId}`);
  const isnap = await iref.get();
  if (!isnap.exists) throw new HttpsError('not-found', 'Invite not found');
  const inv = isnap.data();
  if (inv.status !== 'pending') throw new HttpsError('failed-precondition', 'Invite is not pending');
  if (inv.email_normalized !== email) {
    throw new HttpsError('permission-denied', 'This invite is for a different email');
  }

  const already = await db.doc(`users/${uid}/publisherMemberships/${publisherId}`).get();
  if (already.exists) {
    throw new HttpsError('already-exists', 'Already a member of this publisher');
  }

  await assertAtMostOnePublisher(uid, publisherId);

  const role = inv.intended_role === 'owner' ? 'owner' : 'editor';

  const batch = db.batch();
  batch.set(db.doc(`users/${uid}/publisherMemberships/${publisherId}`), {
    role,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by_uid: inv.created_by_uid || uid
  });
  batch.set(db.doc(`publishers/${publisherId}/roster/${uid}`), {
    email,
    display_name: inv.invitee_name || '',
    role,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    added_by_uid: inv.created_by_uid || uid
  });
  batch.update(iref, {
    status: 'accepted',
    accepted_uid: uid,
    accepted_at: admin.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { ok: true };
});

exports.publisherRemoveMember = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const publisherId = typeof request.data?.publisherId === 'string' ? request.data.publisherId.trim() : '';
  const targetUid = typeof request.data?.targetUid === 'string' ? request.data.targetUid.trim() : '';
  if (!idLooksSafe(publisherId) || !targetUid) {
    throw new HttpsError('invalid-argument', 'publisherId and targetUid required');
  }

  const isStaff = await db.doc(`platform_admins/${uid}`).get().then((s) => s.exists);
  if (!isStaff && !(await isPublisherOwnerUid(uid, publisherId))) {
    throw new HttpsError('permission-denied', 'Not allowed');
  }

  const tmem = await db.doc(`users/${targetUid}/publisherMemberships/${publisherId}`).get();
  if (!tmem.exists) throw new HttpsError('not-found', 'Member not found');
  if (tmem.data().role === 'owner') {
    const owners = await db
      .collection('publishers')
      .doc(publisherId)
      .collection('roster')
      .where('role', '==', 'owner')
      .get();
    if (owners.size <= 1) {
      throw new HttpsError('failed-precondition', 'Cannot remove the last owner');
    }
  }

  const batch = db.batch();
  batch.delete(db.doc(`users/${targetUid}/publisherMemberships/${publisherId}`));
  batch.delete(db.doc(`publishers/${publisherId}/roster/${targetUid}`));
  await batch.commit();
  return { ok: true };
});

exports.platformCreateInvite = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  await assertFullPlatformAdmin(request.auth.uid);
  const inviteeName = typeof request.data?.invitee_name === 'string' ? request.data.invitee_name.trim() : '';
  const email = normalizeEmail(request.data?.email);
  const tier = request.data?.intended_tier === 'manager' ? 'manager' : 'admin';
  if (!inviteeName || !email) {
    throw new HttpsError('invalid-argument', 'invitee_name and email required');
  }

  const dup = await db
    .collection('platform_invites')
    .where('email_normalized', '==', email)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (!dup.empty) throw new HttpsError('already-exists', 'Pending platform invite exists');

  const ref = await db.collection('platform_invites').add({
    invitee_name: inviteeName,
    email_normalized: email,
    intended_tier: tier,
    status: 'pending',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    created_by_uid: request.auth.uid
  });
  return { inviteId: ref.id };
});

exports.platformRevokeInvite = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  await assertFullPlatformAdmin(request.auth.uid);
  const inviteId = typeof request.data?.inviteId === 'string' ? request.data.inviteId.trim() : '';
  if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId required');
  const iref = db.doc(`platform_invites/${inviteId}`);
  const snap = await iref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Not found');
  await iref.update({ status: 'revoked' });
  return { ok: true };
});

exports.listPendingPlatformInvites = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  await assertFullPlatformAdmin(request.auth.uid);
  const q = await db.collection('platform_invites').where('status', '==', 'pending').get();
  const invites = q.docs.map((d) => {
    const x = d.data() || {};
    return {
      inviteId: d.id,
      invitee_name: x.invitee_name || '',
      email_normalized: x.email_normalized || '',
      intended_tier: x.intended_tier === 'manager' ? 'manager' : 'admin'
    };
  });
  return { invites };
});

exports.listMyPendingPlatformInvites = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const email = normalizeEmail(request.auth.token.email);
  if (!email) throw new HttpsError('failed-precondition', 'Account has no email');

  const q = await db
    .collection('platform_invites')
    .where('email_normalized', '==', email)
    .where('status', '==', 'pending')
    .get();

  const invites = q.docs.map((d) => ({
    inviteId: d.id,
    invitee_name: d.data().invitee_name || '',
    intended_tier: d.data().intended_tier || 'admin'
  }));
  return { invites };
});

exports.acceptPlatformInvite = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const inviteId = typeof request.data?.inviteId === 'string' ? request.data.inviteId.trim() : '';
  if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId required');

  const email = normalizeEmail(request.auth.token.email);
  const iref = db.doc(`platform_invites/${inviteId}`);
  const snap = await iref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Invite not found');
  const inv = snap.data();
  if (inv.status !== 'pending') throw new HttpsError('failed-precondition', 'Not pending');
  if (inv.email_normalized !== email) {
    throw new HttpsError('permission-denied', 'Wrong account');
  }

  const existingPa = await db.doc(`platform_admins/${uid}`).get();
  if (existingPa.exists) {
    throw new HttpsError('already-exists', 'Already a platform operator');
  }

  const tier = inv.intended_tier === 'manager' ? 'manager' : 'admin';
  const batch = db.batch();
  batch.set(db.doc(`platform_admins/${uid}`), {
    tier,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    invited_by_uid: inv.created_by_uid || uid
  });
  batch.update(iref, {
    status: 'accepted',
    accepted_uid: uid,
    accepted_at: admin.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { ok: true };
});

exports.listPlatformStaff = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  await assertPlatformStaff(request.auth.uid);

  const snap = await db.collection('platform_admins').get();
  const out = [];
  for (const doc of snap.docs) {
    let email = '';
    let displayName = '';
    try {
      const u = await admin.auth().getUser(doc.id);
      email = u.email || '';
      displayName = u.displayName || '';
    } catch (_) {}
    out.push({
      uid: doc.id,
      email,
      displayName,
      tier: doc.data().tier === 'manager' ? 'manager' : 'admin'
    });
  }
  return { staff: out };
});

exports.removePlatformStaff = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  await assertFullPlatformAdmin(request.auth.uid);
  const targetUid = typeof request.data?.targetUid === 'string' ? request.data.targetUid.trim() : '';
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid required');
  if (targetUid === request.auth.uid) {
    throw new HttpsError('invalid-argument', 'Cannot remove yourself');
  }

  const snap = await db.collection('platform_admins').get();
  if (snap.size <= 1) {
    throw new HttpsError('failed-precondition', 'Cannot remove last platform admin');
  }

  await db.doc(`platform_admins/${targetUid}`).delete();
  return { ok: true };
});
