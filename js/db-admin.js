/**
 * Platform admin: RTDB reads. Writes use Cloud Functions callables.
 */
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { fbAuth, fbRtdb, fbDb } from './firebase-init.js';
import { subscribePublisherStudio } from './db-publisher.js';

function msToIso(ms) {
  if (ms == null || ms === '') return null;
  const n = typeof ms === 'number' ? ms : Number(ms);
  if (Number.isNaN(n)) return null;
  return new Date(n).toISOString();
}

/**
 * Platform staff: Firestore `platform_admins/{uid}` is the source of truth for the admin gate.
 * RTDB `platformAdmins/{uid}` is still required by rules for `platform/*` and org drill-down reads;
 * deploy database rules + mirror/backfill so those paths work after sign-in.
 */
export async function getCurrentPlatformStaff() {
  try {
    const auth = fbAuth();
    await auth.authStateReady();
    const uid = auth.currentUser?.uid;
    if (!uid) return { isStaff: false, tier: null, error: null };
    const d = await getDoc(doc(fbDb(), 'platform_admins', uid));
    if (!d.exists()) return { isStaff: false, tier: null, error: null };
    const raw = d.data()?.tier;
    const tier = raw === 'manager' ? 'manager' : 'admin';
    return { isStaff: true, tier, error: null };
  } catch (e) {
    return { isStaff: false, tier: null, error: { message: e?.message } };
  }
}

export async function isCurrentUserPlatformAdmin() {
  const { isStaff, error } = await getCurrentPlatformStaff();
  return { admin: isStaff, error };
}

/**
 * Drill-down for platform staff: org mirror under `org/{publisherId}/…`.
 */
export async function fetchPublisherOrgSnapshot(publisherId) {
  if (!publisherId) return { data: null, error: { message: 'Missing publisher id' } };
  try {
    const db = fbRtdb();
    const [seriesS, edS, rosterS, invS] = await Promise.all([
      get(ref(db, `org/${publisherId}/series`)),
      get(ref(db, `org/${publisherId}/editions`)),
      get(ref(db, `org/${publisherId}/roster`)),
      get(ref(db, `org/${publisherId}/invites`))
    ]);
    return {
      data: {
        series: seriesS.val() || {},
        editions: edS.val() || {},
        roster: rosterS.val() || {},
        invites: invS.val() || {}
      },
      error: null
    };
  } catch (e) {
    return { data: null, error: { message: e?.message } };
  }
}

/**
 * Same RTDB paths and normalizers as Publisher studio (`subscribePublisherStudio`), shaped for admin tables.
 * @param {string} publisherId
 * @param {(data: { series: object, editions: object, roster: object, invites: object }) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
export function subscribePublisherOrgForAdmin(publisherId, onUpdate) {
  return subscribePublisherStudio(publisherId, ({ series, editions, invites, roster }) => {
    const seriesMap = {};
    for (const s of series || []) {
      if (s && s.id != null) seriesMap[s.id] = s;
    }
    const editionsMap = {};
    for (const e of editions || []) {
      if (e && e.id != null) editionsMap[e.id] = e;
    }
    const invitesMap = {};
    for (const i of invites || []) {
      if (i && i.id != null) invitesMap[i.id] = i;
    }
    const rosterMap = {};
    for (const r of roster || []) {
      if (r && r.uid != null) rosterMap[r.uid] = r;
    }
    onUpdate({
      series: seriesMap,
      editions: editionsMap,
      invites: invitesMap,
      roster: rosterMap
    });
  });
}

export async function listAllPublishers() {
  try {
    const snap = await get(ref(fbRtdb(), 'platform/publishers'));
    const val = snap.val();
    if (!val || typeof val !== 'object') {
      return { data: [], error: null };
    }
    const data = Object.keys(val).map((id) => {
      const p = val[id];
      return {
        id: p.id || id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        created_at: msToIso(p.created_at)
      };
    });
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message } };
  }
}

export async function countEditionsApprox() {
  try {
    const snap = await get(ref(fbRtdb(), 'platform/stats/editionCount'));
    const v = snap.val();
    const count = typeof v === 'number' ? v : 0;
    return { count, error: null };
  } catch (e) {
    return { count: 0, error: { message: e?.message } };
  }
}
