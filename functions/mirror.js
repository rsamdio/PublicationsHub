/**
 * Firestore -> Realtime Database mirror (read-optimized projection).
 * Requires admin.initializeApp() before this module is loaded.
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

const callableOptions = { region: 'us-central1' };

/** Uses default app `databaseURL` from `admin.initializeApp` in `index.js` (not a URL argument — `admin.database(url)` is for named apps). */
function rtdb() {
  return admin.database();
}

function fs() {
  return admin.firestore();
}

function tsMs(v) {
  if (v == null) return Date.now();
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (v.seconds != null) return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  return Date.now();
}

async function assertPlatformAdmin(uid) {
  const snap = await fs().doc(`platform_admins/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'Platform admin only');
  }
  if (snap.data()?.tier === 'manager') {
    throw new HttpsError('permission-denied', 'Full platform admin only');
  }
}

async function adjustEditionCount(delta) {
  if (delta === 0) return;
  const ref = rtdb().ref('platform/stats/editionCount');
  await ref.transaction((current) => {
    const n = (typeof current === 'number' ? current : 0) + delta;
    return n < 0 ? 0 : n;
  });
}

function editionOrgPayload(d) {
  return {
    publisher_id: d.publisher_id,
    series_id: d.series_id,
    title: d.title,
    description: d.description ?? null,
    pdf_url: d.pdf_url,
    cover_url: d.cover_url ?? null,
    cover_thumb_url: d.cover_thumb_url ?? null,
    /** Object key of the PDF in R2 (studio cover upload + regenerate). */
    pdf_repo_path: d.pdf_repo_path ?? null,
    status: d.status,
    publisher_name: d.publisher_name ?? null,
    series_title: d.series_title ?? null,
    created_at: tsMs(d.created_at),
    issue_date: d.issue_date != null ? tsMs(d.issue_date) : null,
    created_by_uid: d.created_by_uid ?? null
  };
}

function editionPublicPayload(d) {
  return {
    title: d.title,
    description: d.description ?? null,
    pdf_url: d.pdf_url,
    cover_url: d.cover_url ?? null,
    cover_thumb_url: d.cover_thumb_url ?? null,
    publisher_name: d.publisher_name ?? null,
    series_title: d.series_title ?? null,
    publisher_id: d.publisher_id,
    series_id: d.series_id,
    created_at: tsMs(d.created_at),
    issue_date: d.issue_date != null ? tsMs(d.issue_date) : null,
    /** Platform-admin only in Firestore; mirrored for public Explore "Featured" row. */
    featured: d.featured === true
  };
}

async function applyEditionMirror(editionId, change) {
  const before = change.before?.exists ? change.before.data() : null;
  const after = change.after?.exists ? change.after.data() : null;

  if (!change.before?.exists && change.after?.exists) {
    await adjustEditionCount(1);
  } else if (change.before?.exists && !change.after?.exists) {
    await adjustEditionCount(-1);
  }

  if (!after) {
    const pubId = before?.publisher_id;
    if (pubId) {
      await rtdb().ref(`org/${pubId}/editions/${editionId}`).remove();
    }
    await rtdb().ref(`public/catalog/editions/${editionId}`).remove();
    return;
  }

  const pubId = after.publisher_id;
  if (!pubId) {
    logger.warn('Edition missing publisher_id', { editionId });
    return;
  }

  await rtdb().ref(`org/${pubId}/editions/${editionId}`).set(editionOrgPayload(after));

  if (after.status === 'published') {
    await rtdb().ref(`public/catalog/editions/${editionId}`).set(editionPublicPayload(after));
  } else {
    await rtdb().ref(`public/catalog/editions/${editionId}`).remove();
  }
}

exports.mirrorEdition = onDocumentWritten('editions/{editionId}', async (event) => {
  const editionId = event.params.editionId;
  try {
    await applyEditionMirror(editionId, event.data);
  } catch (e) {
    logger.error('mirrorEdition failed', { editionId, err: e });
    throw e;
  }
});

async function applySeriesMirror(seriesId, change) {
  const before = change.before?.exists ? change.before.data() : null;
  const after = change.after?.exists ? change.after.data() : null;

  if (!after) {
    const pubId = before?.publisher_id;
    if (pubId) {
      await rtdb().ref(`org/${pubId}/series/${seriesId}`).remove();
    }
    await rtdb().ref(`public/catalog/series/${seriesId}`).remove();
    return;
  }

  const pubId = after.publisher_id;
  if (!pubId) return;

  let publisherName = '';
  try {
    const pubSnap = await fs().doc(`publishers/${pubId}`).get();
    if (pubSnap.exists) publisherName = pubSnap.data().name || '';
  } catch (_) {}

  const orgRow = {
    publisher_id: after.publisher_id,
    title: after.title,
    slug: after.slug ?? '',
    description: after.description ?? '',
    frequency: after.frequency ?? '',
    cover_url: after.cover_url ?? null,
    cover_thumb_url: after.cover_thumb_url ?? null,
    cover_repo_path: after.cover_repo_path ?? null,
    created_at: tsMs(after.created_at),
    created_by_uid: after.created_by_uid ?? ''
  };
  await rtdb().ref(`org/${pubId}/series/${seriesId}`).set(orgRow);

  await rtdb().ref(`public/catalog/series/${seriesId}`).set({
    publisher_id: pubId,
    publisher_name: publisherName,
    title: after.title,
    slug: after.slug ?? '',
    description: after.description ?? '',
    frequency: after.frequency ?? '',
    cover_url: after.cover_url ?? null,
    cover_thumb_url: after.cover_thumb_url ?? null,
    cover_repo_path: after.cover_repo_path ?? null,
    created_at: tsMs(after.created_at)
  });
}

exports.mirrorSeries = onDocumentWritten('series/{seriesId}', async (event) => {
  try {
    await applySeriesMirror(event.params.seriesId, event.data);
  } catch (e) {
    logger.error('mirrorSeries failed', { err: e });
    throw e;
  }
});

async function applyPublisherMirror(publisherId, change) {
  const before = change.before?.exists ? change.before.data() : null;
  const after = change.after?.exists ? change.after.data() : null;

  if (!after) {
    await rtdb().ref(`org/${publisherId}`).remove();
    await rtdb().ref(`platform/publishers/${publisherId}`).remove();
    return;
  }

  const profile = {
    name: after.name,
    slug: after.slug,
    status: after.status,
    created_at: tsMs(after.created_at)
  };

  const internalRef =
    after.internal_reference != null && String(after.internal_reference).trim()
      ? String(after.internal_reference).trim()
      : '';

  await rtdb().ref(`org/${publisherId}/profile`).set(profile);
  await rtdb().ref(`platform/publishers/${publisherId}`).set({
    ...profile,
    id: publisherId,
    internal_reference: internalRef
  });
}

exports.mirrorPublisher = onDocumentWritten('publishers/{publisherId}', async (event) => {
  try {
    await applyPublisherMirror(event.params.publisherId, event.data);
  } catch (e) {
    logger.error('mirrorPublisher failed', { err: e });
    throw e;
  }
});

async function applyMembershipMirror(uid, publisherId, change) {
  const after = change.after?.exists ? change.after.data() : null;
  const path = `userMemberships/${uid}/${publisherId}`;
  if (!after) {
    await rtdb().ref(path).remove();
    return;
  }
  await rtdb().ref(path).set({
    role: after.role,
    created_at: tsMs(after.created_at)
  });
}

exports.mirrorPublisherMembership = onDocumentWritten(
  'users/{userId}/publisherMemberships/{publisherId}',
  async (event) => {
    try {
      await applyMembershipMirror(event.params.userId, event.params.publisherId, event.data);
    } catch (e) {
      logger.error('mirrorPublisherMembership failed', { err: e });
      throw e;
    }
  }
);

async function applyPublisherInviteMirror(publisherId, inviteId, change) {
  const after = change.after?.exists ? change.after.data() : null;
  const path = `org/${publisherId}/invites/${inviteId}`;
  if (!after || after.status !== 'pending') {
    await rtdb().ref(path).remove();
    return;
  }
  await rtdb().ref(path).set({
    email_normalized: after.email_normalized ?? '',
    invitee_name: after.invitee_name ?? '',
    status: 'pending',
    intended_role: after.intended_role ?? 'editor',
    created_at: tsMs(after.created_at),
    created_by_uid: after.created_by_uid ?? ''
  });
}

exports.mirrorPublisherInvite = onDocumentWritten(
  'publishers/{publisherId}/invites/{inviteId}',
  async (event) => {
    try {
      await applyPublisherInviteMirror(
        event.params.publisherId,
        event.params.inviteId,
        event.data
      );
    } catch (e) {
      logger.error('mirrorPublisherInvite failed', { err: e });
      throw e;
    }
  }
);

async function applyPublisherRosterMirror(publisherId, memberUid, change) {
  const after = change.after?.exists ? change.after.data() : null;
  const path = `org/${publisherId}/roster/${memberUid}`;
  if (!after) {
    await rtdb().ref(path).remove();
    return;
  }
  await rtdb().ref(path).set({
    email: after.email ?? '',
    display_name: after.display_name ?? '',
    role: after.role ?? 'editor',
    created_at: tsMs(after.created_at),
    added_by_uid: after.added_by_uid ?? ''
  });
}

exports.mirrorPublisherRoster = onDocumentWritten(
  'publishers/{publisherId}/roster/{memberUid}',
  async (event) => {
    try {
      await applyPublisherRosterMirror(
        event.params.publisherId,
        event.params.memberUid,
        event.data
      );
    } catch (e) {
      logger.error('mirrorPublisherRoster failed', { err: e });
      throw e;
    }
  }
);

async function applyPlatformAdminMirror(uid, change) {
  const flagPath = `platformAdmins/${uid}`;
  const staffPath = `platform/staff/${uid}`;
  if (!change.after?.exists) {
    await rtdb().ref(flagPath).remove();
    await rtdb().ref(staffPath).remove();
    return;
  }
  await rtdb().ref(flagPath).set(true);
  let email = '';
  let displayName = '';
  try {
    const u = await admin.auth().getUser(uid);
    email = String(u.email || '').toLowerCase();
    displayName = u.displayName || '';
  } catch (e) {
    logger.warn('getUser for platform staff mirror failed', { uid, err: e?.message });
  }
  const d = change.after.data();
  await rtdb().ref(staffPath).set({
    uid,
    tier: d?.tier === 'manager' ? 'manager' : 'admin',
    email,
    display_name: displayName,
    created_at: tsMs(d?.created_at)
  });
}

exports.mirrorPlatformAdmin = onDocumentWritten('platform_admins/{uid}', async (event) => {
  try {
    await applyPlatformAdminMirror(event.params.uid, event.data);
  } catch (e) {
    logger.error('mirrorPlatformAdmin failed', { err: e });
    throw e;
  }
});

async function applyPlatformStaffInviteMirror(inviteId, change) {
  const path = `platform/staffInvites/${inviteId}`;
  const after = change.after?.exists ? change.after.data() : null;
  if (!after || after.status !== 'pending') {
    await rtdb().ref(path).remove();
    return;
  }
  await rtdb().ref(path).set({
    inviteId,
    invitee_name: after.invitee_name || '',
    email_normalized: after.email_normalized || '',
    intended_tier: after.intended_tier === 'manager' ? 'manager' : 'admin',
    created_at: tsMs(after.created_at)
  });
}

exports.mirrorPlatformStaffInvite = onDocumentWritten('platform_invites/{inviteId}', async (event) => {
  try {
    await applyPlatformStaffInviteMirror(event.params.inviteId, event.data);
  } catch (e) {
    logger.error('mirrorPlatformStaffInvite failed', { err: e });
    throw e;
  }
});

function syntheticCreate(data) {
  return {
    before: { exists: false, data: () => null },
    after: { exists: true, data: () => data }
  };
}

/**
 * Full rebuild of RTDB mirror from Firestore (+ legacy publications into public catalog).
 */
async function runBackfill() {
  const db = fs();
  const r = rtdb();

  await r.ref('public/catalog/editions').remove();
  await r.ref('public/catalog/series').remove();
  await r.ref('org').remove();
  await r.ref('userMemberships').remove();
  await r.ref('platform/publishers').remove();
  await r.ref('platform/staff').remove();
  await r.ref('platform/staffInvites').remove();
  await r.ref('platformAdmins').remove();
  await r.ref('platform/stats/editionCount').set(0);

  const publishers = await db.collection('publishers').get();
  for (const doc of publishers.docs) {
    await applyPublisherMirror(doc.id, syntheticCreate(doc.data()));
  }

  const seriesSnap = await db.collection('series').get();
  for (const doc of seriesSnap.docs) {
    await applySeriesMirror(doc.id, syntheticCreate(doc.data()));
  }

  const editionsSnap = await db.collection('editions').get();
  for (const doc of editionsSnap.docs) {
    const d = doc.data();
    const editionId = doc.id;
    const pubId = d.publisher_id;
    if (!pubId) continue;
    await r.ref(`org/${pubId}/editions/${editionId}`).set(editionOrgPayload(d));
    if (d.status === 'published') {
      await r.ref(`public/catalog/editions/${editionId}`).set(editionPublicPayload(d));
    }
  }
  await r.ref('platform/stats/editionCount').set(editionsSnap.size);

  const memSnap = await db.collectionGroup('publisherMemberships').get();
  for (const doc of memSnap.docs) {
    const parts = doc.ref.path.split('/');
    const uid = parts[1];
    const publisherId = doc.id;
    await applyMembershipMirror(uid, publisherId, syntheticCreate(doc.data()));
  }

  const invitesSnap = await db.collectionGroup('invites').get();
  for (const doc of invitesSnap.docs) {
    const parts = doc.ref.path.split('/');
    const publisherId = parts[1];
    const inviteId = doc.id;
    await applyPublisherInviteMirror(publisherId, inviteId, syntheticCreate(doc.data()));
  }

  const rosterSnap = await db.collectionGroup('roster').get();
  for (const doc of rosterSnap.docs) {
    const parts = doc.ref.path.split('/');
    const publisherId = parts[1];
    const memberUid = doc.id;
    await applyPublisherRosterMirror(publisherId, memberUid, syntheticCreate(doc.data()));
  }

  const adminsSnap = await db.collection('platform_admins').get();
  for (const doc of adminsSnap.docs) {
    await applyPlatformAdminMirror(doc.id, syntheticCreate(doc.data()));
  }

  const platInvSnap = await db.collection('platform_invites').where('status', '==', 'pending').get();
  for (const doc of platInvSnap.docs) {
    await applyPlatformStaffInviteMirror(doc.id, syntheticCreate(doc.data()));
  }

  const legacySnap = await db.collection('publications').get();
  for (const doc of legacySnap.docs) {
    const d = doc.data();
    const id = `legacy_${doc.id}`;
    await r.ref(`public/catalog/editions/${id}`).set({
      title: d.title || 'Untitled',
      description: d.description ?? null,
      pdf_url: d.pdf_url,
      cover_url: d.cover_url ?? null,
      cover_thumb_url: d.cover_thumb_url ?? null,
      publisher_name: null,
      series_title: null,
      publisher_id: null,
      series_id: null,
      created_at: tsMs(d.created_at),
      featured: false
    });
  }
}

const backfillMirrorOptions = {
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 2
};

exports.backfillMirror = onCall(backfillMirrorOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  await assertPlatformAdmin(request.auth.uid);
  await runBackfill();
  logger.info('backfillMirror completed');
  return { ok: true };
});
