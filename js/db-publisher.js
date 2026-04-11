/**
 * Publisher/editor Firestore writes + RTDB reads (studio.html).
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref, get, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { fbAuth, fbDb, fbRtdb, fbFunctions } from './firebase-init.js';
import { sortEditionsNewestFirstInPlace } from './edition-sort.js';

function msToIso(ms) {
  if (ms == null || ms === '') return null;
  const n = typeof ms === 'number' ? ms : Number(ms);
  if (Number.isNaN(n)) return null;
  return new Date(n).toISOString();
}

export async function listMyPublisherMemberships() {
  try {
    const auth = fbAuth();
    await auth.authStateReady();
    const uid = auth.currentUser?.uid;
    if (!uid) return { data: [], error: { message: 'Not signed in' } };
    const snap = await get(ref(fbRtdb(), `userMemberships/${uid}`));
    const val = snap.val();
    if (!val || typeof val !== 'object') {
      return { data: [], error: null };
    }
    const data = Object.keys(val).map((publisherId) => ({
      publisherId,
      role: val[publisherId].role,
      created_at: msToIso(val[publisherId].created_at)
    }));
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message || 'Failed to load memberships' } };
  }
}

export async function fetchPublisher(publisherId) {
  try {
    const snap = await get(ref(fbRtdb(), `org/${publisherId}/profile`));
    const v = snap.val();
    if (!v) return { data: null, error: { message: 'Publisher not found' } };
    return {
      data: {
        id: publisherId,
        name: v.name,
        slug: v.slug,
        status: v.status,
        created_at: msToIso(v.created_at)
      },
      error: null
    };
  } catch (e) {
    return { data: null, error: { message: e?.message } };
  }
}

function normalizeSeriesRtdb(val) {
  if (!val || typeof val !== 'object') return [];
  const data = Object.keys(val).map((id) => ({
    id,
    ...val[id],
    created_at: msToIso(val[id].created_at)
  }));
  data.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return data;
}

function normalizeEditionsRtdb(val) {
  if (!val || typeof val !== 'object') return [];
  const data = Object.keys(val).map((id) => ({
    id,
    ...val[id],
    created_at: msToIso(val[id].created_at),
    issue_date: msToIso(val[id].issue_date)
  }));
  sortEditionsNewestFirstInPlace(data);
  return data;
}

function normalizeInvitesRtdb(val) {
  if (!val || typeof val !== 'object') return [];
  return Object.keys(val).map((id) => ({
    id,
    ...val[id],
    created_at: msToIso(val[id].created_at)
  }));
}

function normalizeRosterRtdb(val) {
  if (!val || typeof val !== 'object') return [];
  return Object.keys(val).map((uid) => ({
    uid,
    ...val[uid],
    created_at: msToIso(val[uid].created_at)
  }));
}

export async function fetchSeriesForPublisher(publisherId) {
  try {
    const snap = await get(ref(fbRtdb(), `org/${publisherId}/series`));
    return { data: normalizeSeriesRtdb(snap.val()), error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message } };
  }
}

export async function fetchEditionsForPublisher(publisherId) {
  try {
    const snap = await get(ref(fbRtdb(), `org/${publisherId}/editions`));
    return { data: normalizeEditionsRtdb(snap.val()), error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message } };
  }
}

/**
 * Live updates for publisher studio (dashboard): org/{publisherId}/…
 * @param {string} publisherId
 * @param {(payload: { series: object[], editions: object[], invites: object[], roster: object[], profile: { id: string, name: unknown, slug: unknown, status: unknown, created_at: string | null } | null }) => void} onData
 * @returns {() => void} unsubscribe
 */
export function subscribePublisherStudio(publisherId, onData) {
  const db = fbRtdb();
  const profileRef = ref(db, `org/${publisherId}/profile`);
  const seriesRef = ref(db, `org/${publisherId}/series`);
  const editionsRef = ref(db, `org/${publisherId}/editions`);
  const invitesRef = ref(db, `org/${publisherId}/invites`);
  const rosterRef = ref(db, `org/${publisherId}/roster`);
  let series = [];
  let editions = [];
  let invites = [];
  let roster = [];
  /** @type {{ id: string, name: unknown, slug: unknown, status: unknown, created_at: string | null } | null} */
  let profile = null;
  const emit = () => onData({ series, editions, invites, roster, profile });

  const unsubProfile = onValue(profileRef, (snap) => {
    const v = snap.val();
    profile = v
      ? {
          id: publisherId,
          name: v.name,
          slug: v.slug,
          status: v.status,
          created_at: msToIso(v.created_at)
        }
      : null;
    emit();
  });
  const unsubSeries = onValue(seriesRef, (snap) => {
    series = normalizeSeriesRtdb(snap.val());
    emit();
  });
  const unsubEditions = onValue(editionsRef, (snap) => {
    editions = normalizeEditionsRtdb(snap.val());
    emit();
  });
  const unsubInvites = onValue(invitesRef, (snap) => {
    invites = normalizeInvitesRtdb(snap.val());
    emit();
  });
  const unsubRoster = onValue(rosterRef, (snap) => {
    roster = normalizeRosterRtdb(snap.val());
    emit();
  });

  return () => {
    unsubProfile();
    unsubSeries();
    unsubEditions();
    unsubInvites();
    unsubRoster();
  };
}

/**
 * Live updates for `userMemberships/{uid}` (studio: org picker + roles).
 * @param {string} uid
 * @param {(result: { data: Array<{ publisherId: string, role: string, created_at: string | null }> | null, error: { message: string } | null }) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
export function subscribeMyPublisherMemberships(uid, onUpdate) {
  if (!uid) {
    onUpdate({ data: [], error: null });
    return () => {};
  }
  const r = ref(fbRtdb(), `userMemberships/${uid}`);
  return onValue(
    r,
    (snap) => {
      try {
        const val = snap.val();
        if (!val || typeof val !== 'object') {
          onUpdate({ data: [], error: null });
          return;
        }
        const data = Object.keys(val).map((publisherId) => ({
          publisherId,
          role: val[publisherId].role,
          created_at: msToIso(val[publisherId].created_at)
        }));
        onUpdate({ data, error: null });
      } catch (e) {
        onUpdate({ data: null, error: { message: e?.message || 'Failed to parse memberships' } });
      }
    },
    (err) => {
      onUpdate({ data: null, error: { message: err?.message || 'Listen failed' } });
    }
  );
}

export async function updateSeries(seriesId, patch) {
  try {
    const auth = fbAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return { error: { message: 'Not signed in' } };
    const allowed = ['title', 'description', 'slug', 'cover_url', 'cover_thumb_url', 'cover_repo_path', 'frequency'];
    const data = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        data[k] = patch[k];
      }
    }
    if (Object.keys(data).length === 0) {
      return { error: { message: 'Nothing to update' } };
    }
    await updateDoc(doc(fbDb(), 'series', seriesId), data);
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || 'Update failed' } };
  }
}

export async function createSeries({ publisherId, title, description, frequency }) {
  try {
    const auth = fbAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return { data: null, error: { message: 'Not signed in' } };
    const slug = (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const payload = {
      publisher_id: publisherId,
      title,
      slug: slug || 'series',
      description: description || '',
      created_at: serverTimestamp(),
      created_by_uid: uid
    };
    if (frequency != null && String(frequency).trim()) {
      payload.frequency = String(frequency).trim();
    }
    const docRef = await addDoc(collection(fbDb(), 'series'), payload);
    return { data: { id: docRef.id }, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message } };
  }
}

/** Publisher writes never set `featured` — platform admin callable + Firestore rules only. */
export async function insertPublishedEdition(row) {
  try {
    const auth = fbAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return { data: null, error: { message: 'Not signed in' } };
    const editionPayload = {
      publisher_id: row.publisher_id,
      series_id: row.series_id,
      title: row.title,
      description: row.description ?? null,
      pdf_url: row.pdf_url,
      cover_url: row.cover_url ?? null,
      cover_thumb_url: row.cover_thumb_url ?? null,
      pdf_repo_path: row.pdf_repo_path ?? null,
      status: 'published',
      publisher_name: row.publisher_name ?? null,
      series_title: row.series_title ?? null,
      created_at: serverTimestamp(),
      created_by_uid: uid
    };
    if (row.issue_date instanceof Date) {
      editionPayload.issue_date = Timestamp.fromDate(row.issue_date);
    } else if (typeof row.issue_date === 'string' && row.issue_date) {
      editionPayload.issue_date = Timestamp.fromDate(new Date(`${row.issue_date}T12:00:00.000Z`));
    }
    const docRef = await addDoc(collection(fbDb(), 'editions'), editionPayload);
    return { data: { id: docRef.id }, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message } };
  }
}

/**
 * @param {string} editionId
 * @param {Record<string, unknown>} patch — whitelisted keys only (`featured` is never allowed here)
 */
export async function updateEdition(editionId, patch) {
  try {
    const auth = fbAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return { error: { message: 'Not signed in' } };
    const allowed = [
      'title',
      'description',
      'cover_url',
      'cover_thumb_url',
      'series_id',
      'series_title',
      'pdf_repo_path',
      'pdf_url',
      'issue_date'
    ];
    const data = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        if (k === 'issue_date') {
          const v = patch[k];
          if (v == null) {
            data[k] = null;
          } else if (v instanceof Date) {
            data[k] = Timestamp.fromDate(v);
          } else if (typeof v === 'string' && v) {
            data[k] = Timestamp.fromDate(new Date(`${v}T12:00:00.000Z`));
          }
        } else {
          data[k] = patch[k];
        }
      }
    }
    if (Object.keys(data).length === 0) {
      return { error: { message: 'Nothing to update' } };
    }
    await updateDoc(doc(fbDb(), 'editions', editionId), data);
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || 'Update failed' } };
  }
}

export async function publisherCreateInvite({ publisherId, invitee_name, email, intended_role }) {
  try {
    const fn = httpsCallable(fbFunctions(), 'publisherCreateInvite');
    const res = await fn({ publisherId, invitee_name, email, intended_role });
    return { data: res.data, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message || e?.details || 'Invite failed' } };
  }
}

export async function publisherRevokeInvite({ publisherId, inviteId }) {
  try {
    const fn = httpsCallable(fbFunctions(), 'publisherRevokeInvite');
    await fn({ publisherId, inviteId });
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || e?.details || 'Revoke failed' } };
  }
}

export async function listMyPendingInvitesCallable() {
  try {
    const fn = httpsCallable(fbFunctions(), 'listMyPendingInvites');
    const res = await fn();
    return { data: res.data?.invites || [], error: null };
  } catch (e) {
    const message =
      (typeof e?.details === 'string' && e.details) ||
      e?.message ||
      'Failed to list invites';
    return { data: [], error: { message } };
  }
}

export async function acceptPublisherInviteCallable({ publisherId, inviteId }) {
  try {
    const fn = httpsCallable(fbFunctions(), 'acceptPublisherInvite');
    await fn({ publisherId, inviteId });
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || e?.details || 'Accept failed' } };
  }
}

export async function publisherRemoveMemberCallable({ publisherId, targetUid }) {
  try {
    const fn = httpsCallable(fbFunctions(), 'publisherRemoveMember');
    await fn({ publisherId, targetUid });
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || e?.details || 'Remove failed' } };
  }
}

export async function deleteEditionAssetsCallable(editionId) {
  try {
    const fn = httpsCallable(fbFunctions(), 'deleteEditionAssets');
    await fn({ editionId });
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || e?.details || 'Delete failed' } };
  }
}

export async function deleteSeriesCallable(seriesId) {
  try {
    const fn = httpsCallable(fbFunctions(), 'deleteSeries');
    await fn({ seriesId });
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || e?.details || 'Delete failed' } };
  }
}

export async function deletePublisherCallable(publisherId) {
  try {
    const fn = httpsCallable(fbFunctions(), 'deletePublisher');
    await fn({ publisherId });
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || e?.details || 'Delete failed' } };
  }
}

export async function updatePublisherNameCallable(publisherId, name, internalReference) {
  try {
    const fn = httpsCallable(fbFunctions(), 'updatePublisherName');
    const payload = { publisherId, name };
    if (internalReference !== undefined) {
      payload.internal_reference = internalReference;
    }
    await fn(payload);
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || e?.details || 'Update failed' } };
  }
}

export async function listMyPendingPlatformInvitesCallable() {
  try {
    const fn = httpsCallable(fbFunctions(), 'listMyPendingPlatformInvites');
    const res = await fn();
    return { data: res.data?.invites || [], error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message || e?.details || 'Failed' } };
  }
}

export async function acceptPlatformInviteCallable(inviteId) {
  try {
    const fn = httpsCallable(fbFunctions(), 'acceptPlatformInvite');
    await fn({ inviteId });
    return { error: null };
  } catch (e) {
    return { error: { message: e?.message || e?.details || 'Accept failed' } };
  }
}

export async function listPendingPlatformInvitesCallable() {
  try {
    const fn = httpsCallable(fbFunctions(), 'listPendingPlatformInvites');
    const res = await fn();
    return { data: res.data?.invites || [], error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message || e?.details || 'Failed to list invites' } };
  }
}
