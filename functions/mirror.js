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

/** Firestore batch writes in chunks (limit 500). */
async function batchUpdateDocs(updates) {
  const CHUNK = 400;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = fs().batch();
    for (const u of updates.slice(i, i + CHUNK)) {
      batch.update(u.ref, u.data);
    }
    await batch.commit();
  }
}

/**
 * Editions store denormalized `series_title` / `publisher_name` at upload time for catalog cards.
 * Keep those fields in sync when the live series/publisher docs change.
 */
async function cascadeSeriesTitleToEditions(seriesId, title) {
  const snap = await fs().collection('editions').where('series_id', '==', seriesId).get();
  const updates = [];
  for (const docSnap of snap.docs) {
    const cur = docSnap.data().series_title ?? null;
    if (cur === title) continue;
    updates.push({ ref: docSnap.ref, data: { series_title: title } });
  }
  if (updates.length) {
    await batchUpdateDocs(updates);
    logger.info('cascaded series_title to editions', { seriesId, count: updates.length });
  }
}

async function cascadePublisherNameToEditions(publisherId, name) {
  const snap = await fs().collection('editions').where('publisher_id', '==', publisherId).get();
  const updates = [];
  for (const docSnap of snap.docs) {
    const cur = docSnap.data().publisher_name ?? null;
    if (cur === name) continue;
    updates.push({ ref: docSnap.ref, data: { publisher_name: name } });
  }
  if (updates.length) {
    await batchUpdateDocs(updates);
    logger.info('cascaded publisher_name to editions', { publisherId, count: updates.length });
  }
}

/** Catalog series rows also denormalize publisher_name — refresh without rewriting every series doc. */
async function cascadePublisherNameToCatalogSeries(publisherId, name) {
  const seriesSnap = await fs().collection('series').where('publisher_id', '==', publisherId).get();
  if (seriesSnap.empty) return;
  const patch = {};
  for (const docSnap of seriesSnap.docs) {
    patch[`public/catalog/series/${docSnap.id}/publisher_name`] = name;
  }
  await rtdb().ref().update(patch);
}

function editionOrgPayload(d) {
  return {
    publisher_id: d.publisher_id,
    series_id: d.series_id,
    slug: d.slug ?? null,
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
    slug: d.slug ?? null,
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

  const beforeTitle = before?.title != null ? String(before.title) : null;
  const afterTitle = after.title != null ? String(after.title) : null;
  if (afterTitle != null && beforeTitle !== afterTitle) {
    await cascadeSeriesTitleToEditions(seriesId, afterTitle);
  }
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
    slug: after.slug ?? '',
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

  const beforeName = before?.name != null ? String(before.name) : null;
  const afterName = after.name != null ? String(after.name) : null;
  if (afterName != null && beforeName !== afterName) {
    await cascadePublisherNameToEditions(publisherId, afterName);
    await cascadePublisherNameToCatalogSeries(publisherId, afterName);
  }
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

/** Remove children under `ref` whose keys are not in `keepKeys` (stale mirror rows). */
async function pruneStaleChildren(ref, keepKeys) {
  const snap = await ref.once('value');
  const removals = {};
  snap.forEach((child) => {
    if (!keepKeys.has(child.key)) removals[child.key] = null;
  });
  if (Object.keys(removals).length) {
    await ref.update(removals);
  }
}

/**
 * Full rebuild of RTDB mirror from Firestore (+ legacy publications into public catalog).
 *
 * Rebuilds every node in place (each write is a `set()` that overwrites), then prunes
 * only stale keys. It never wipes `platformAdmins` or the public catalog up front, so a
 * timeout or crash mid-run can never leave an empty catalog or lock staff out of `/admin`.
 */
async function runBackfill() {
  const db = fs();
  const r = rtdb();

  const publishers = await db.collection('publishers').get();
  const publisherIds = new Set();
  for (const doc of publishers.docs) {
    publisherIds.add(doc.id);
    await applyPublisherMirror(doc.id, syntheticCreate(doc.data()));
  }

  const orgSeriesIdsByPub = new Map();
  const seriesSnap = await db.collection('series').get();
  const seriesIds = new Set();
  for (const doc of seriesSnap.docs) {
    seriesIds.add(doc.id);
    const pubId = doc.data().publisher_id;
    if (pubId) {
      if (!orgSeriesIdsByPub.has(pubId)) orgSeriesIdsByPub.set(pubId, new Set());
      orgSeriesIdsByPub.get(pubId).add(doc.id);
    }
    await applySeriesMirror(doc.id, syntheticCreate(doc.data()));
  }

  /** Live maps so backfill repairs stale denormalized labels on edition docs. */
  const publisherNameById = new Map();
  for (const doc of publishers.docs) {
    publisherNameById.set(doc.id, doc.data().name != null ? String(doc.data().name) : null);
  }
  const seriesTitleById = new Map();
  for (const doc of seriesSnap.docs) {
    seriesTitleById.set(doc.id, doc.data().title != null ? String(doc.data().title) : null);
  }

  const editionsSnap = await db.collection('editions').get();
  const publicEditionIds = new Set();
  const orgEditionIdsByPub = new Map();
  for (const doc of editionsSnap.docs) {
    let d = doc.data();
    const editionId = doc.id;
    const pubId = d.publisher_id;
    if (!pubId) continue;

    const wantSeriesTitle =
      d.series_id && seriesTitleById.has(d.series_id)
        ? seriesTitleById.get(d.series_id)
        : (d.series_title ?? null);
    const wantPublisherName = publisherNameById.has(pubId)
      ? publisherNameById.get(pubId)
      : (d.publisher_name ?? null);
    const patch = {};
    if ((d.series_title ?? null) !== wantSeriesTitle) patch.series_title = wantSeriesTitle;
    if ((d.publisher_name ?? null) !== wantPublisherName) patch.publisher_name = wantPublisherName;
    if (Object.keys(patch).length) {
      await doc.ref.update(patch);
      d = { ...d, ...patch };
    }

    await r.ref(`org/${pubId}/editions/${editionId}`).set(editionOrgPayload(d));
    if (!orgEditionIdsByPub.has(pubId)) orgEditionIdsByPub.set(pubId, new Set());
    orgEditionIdsByPub.get(pubId).add(editionId);
    if (d.status === 'published') {
      await r.ref(`public/catalog/editions/${editionId}`).set(editionPublicPayload(d));
      publicEditionIds.add(editionId);
    }
  }
  await r.ref('platform/stats/editionCount').set(editionsSnap.size);

  const membershipPubsByUid = new Map();
  const memSnap = await db.collectionGroup('publisherMemberships').get();
  for (const doc of memSnap.docs) {
    const parts = doc.ref.path.split('/');
    const uid = parts[1];
    const publisherId = doc.id;
    if (!membershipPubsByUid.has(uid)) membershipPubsByUid.set(uid, new Set());
    membershipPubsByUid.get(uid).add(publisherId);
    await applyMembershipMirror(uid, publisherId, syntheticCreate(doc.data()));
  }

  const orgInviteIdsByPub = new Map();
  const invitesSnap = await db.collectionGroup('invites').get();
  for (const doc of invitesSnap.docs) {
    const parts = doc.ref.path.split('/');
    const publisherId = parts[1];
    const inviteId = doc.id;
    if (doc.data().status === 'pending') {
      if (!orgInviteIdsByPub.has(publisherId)) orgInviteIdsByPub.set(publisherId, new Set());
      orgInviteIdsByPub.get(publisherId).add(inviteId);
    }
    await applyPublisherInviteMirror(publisherId, inviteId, syntheticCreate(doc.data()));
  }

  const orgRosterIdsByPub = new Map();
  const rosterSnap = await db.collectionGroup('roster').get();
  for (const doc of rosterSnap.docs) {
    const parts = doc.ref.path.split('/');
    const publisherId = parts[1];
    const memberUid = doc.id;
    if (!orgRosterIdsByPub.has(publisherId)) orgRosterIdsByPub.set(publisherId, new Set());
    orgRosterIdsByPub.get(publisherId).add(memberUid);
    await applyPublisherRosterMirror(publisherId, memberUid, syntheticCreate(doc.data()));
  }

  const adminsSnap = await db.collection('platform_admins').get();
  const adminUids = new Set();
  for (const doc of adminsSnap.docs) {
    adminUids.add(doc.id);
    await applyPlatformAdminMirror(doc.id, syntheticCreate(doc.data()));
  }

  const platInvSnap = await db.collection('platform_invites').where('status', '==', 'pending').get();
  const platInviteIds = new Set();
  for (const doc of platInvSnap.docs) {
    platInviteIds.add(doc.id);
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
    publicEditionIds.add(id);
  }

  // Prune stale rows only after every current row is written (no empty window).
  await pruneStaleChildren(r.ref('platformAdmins'), adminUids);
  await pruneStaleChildren(r.ref('platform/staff'), adminUids);
  await pruneStaleChildren(r.ref('platform/staffInvites'), platInviteIds);
  await pruneStaleChildren(r.ref('platform/publishers'), publisherIds);
  await pruneStaleChildren(r.ref('public/catalog/series'), seriesIds);
  await pruneStaleChildren(r.ref('public/catalog/editions'), publicEditionIds);
  await pruneStaleChildren(r.ref('org'), publisherIds);
  await pruneStaleChildren(r.ref('userMemberships'), new Set(membershipPubsByUid.keys()));

  for (const uid of membershipPubsByUid.keys()) {
    await pruneStaleChildren(r.ref(`userMemberships/${uid}`), membershipPubsByUid.get(uid));
  }
  const empty = new Set();
  for (const pubId of publisherIds) {
    await pruneStaleChildren(r.ref(`org/${pubId}/editions`), orgEditionIdsByPub.get(pubId) || empty);
    await pruneStaleChildren(r.ref(`org/${pubId}/series`), orgSeriesIdsByPub.get(pubId) || empty);
    await pruneStaleChildren(r.ref(`org/${pubId}/invites`), orgInviteIdsByPub.get(pubId) || empty);
    await pruneStaleChildren(r.ref(`org/${pubId}/roster`), orgRosterIdsByPub.get(pubId) || empty);
  }
}

const backfillMirrorOptions = {
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1
};

/** Lock is considered stale after this window so a crashed run cannot block forever. */
const BACKFILL_LOCK_STALE_MS = 15 * 60 * 1000;

exports.backfillMirror = onCall(backfillMirrorOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  await assertPlatformAdmin(request.auth.uid);

  const lockRef = rtdb().ref('platform/backfillLock');
  const now = Date.now();
  const res = await lockRef.transaction((cur) => {
    if (cur && cur.running && typeof cur.startedAt === 'number' && now - cur.startedAt < BACKFILL_LOCK_STALE_MS) {
      return; // abort: another backfill is in progress
    }
    return { running: true, startedAt: now, uid: request.auth.uid };
  });
  if (!res.committed) {
    throw new HttpsError('failed-precondition', 'A mirror backfill is already running');
  }

  try {
    await runBackfill();
    logger.info('backfillMirror completed');
    return { ok: true };
  } finally {
    await lockRef.remove().catch((err) => logger.warn('backfillMirror lock release failed', err));
  }
});
