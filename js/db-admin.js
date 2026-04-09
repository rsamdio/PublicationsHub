/**
 * Platform admin: RTDB reads. Writes use Cloud Functions callables.
 */
import { ref, get, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
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

/**
 * @param {unknown} val RTDB `platform/publishers` object snapshot value
 * @returns {Array<{ id: string, name: unknown, slug: unknown, status: unknown, internal_reference: string, created_at: string | null }>}
 */
export function normalizePlatformPublishersVal(val) {
  if (!val || typeof val !== 'object') {
    return [];
  }
  const data = Object.keys(val).map((id) => {
    const p = val[id];
    return {
      id: p.id || id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      internal_reference: p.internal_reference != null ? String(p.internal_reference) : '',
      created_at: msToIso(p.created_at)
    };
  });
  data.sort((a, b) => {
    const an = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    if (an !== 0) return an;
    return String(a.id).localeCompare(String(b.id));
  });
  return data;
}

export async function listAllPublishers() {
  try {
    const snap = await get(ref(fbRtdb(), 'platform/publishers'));
    const data = normalizePlatformPublishersVal(snap.val());
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message } };
  }
}

/**
 * Live updates for `platform/publishers` (platform admin list only — same path as {@link listAllPublishers}).
 * @param {(result: { data: ReturnType<typeof normalizePlatformPublishersVal> | null, error: { message: string } | null }) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
export function subscribePlatformPublishers(onUpdate) {
  const r = ref(fbRtdb(), 'platform/publishers');
  return onValue(
    r,
    (snap) => {
      try {
        const data = normalizePlatformPublishersVal(snap.val());
        onUpdate({ data, error: null });
      } catch (e) {
        onUpdate({ data: null, error: { message: e?.message || 'Failed to parse publishers' } });
      }
    },
    (err) => {
      onUpdate({ data: null, error: { message: err?.message || 'Listen failed' } });
    }
  );
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

/**
 * Live mirror total edition count (admin stats line).
 * @param {(result: { count: number | null, error: { message: string } | null }) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
export function subscribePlatformEditionCount(onUpdate) {
  const r = ref(fbRtdb(), 'platform/stats/editionCount');
  return onValue(
    r,
    (snap) => {
      const v = snap.val();
      const count = typeof v === 'number' ? v : 0;
      onUpdate({ count, error: null });
    },
    (err) => {
      onUpdate({ count: null, error: { message: err?.message || 'Listen failed' } });
    }
  );
}

/**
 * @param {unknown} val RTDB `platform/staff`
 * @returns {Array<{ uid: string, email: string, displayName: string, tier: string }>}
 */
export function normalizePlatformStaffRtdb(val) {
  if (!val || typeof val !== 'object') return [];
  const rows = Object.keys(val).map((uid) => {
    const s = val[uid];
    return {
      uid: s?.uid || uid,
      email: s?.email != null ? String(s.email) : '',
      displayName: s?.display_name != null ? String(s.display_name) : '',
      tier: s?.tier === 'manager' ? 'manager' : 'admin'
    };
  });
  rows.sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''), undefined, { sensitivity: 'base' }));
  return rows;
}

/**
 * Live platform team list (mirrored from `platform_admins`).
 * @param {(result: { data: ReturnType<typeof normalizePlatformStaffRtdb>, error: { message: string } | null }) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
export function subscribePlatformStaff(onUpdate) {
  const r = ref(fbRtdb(), 'platform/staff');
  return onValue(
    r,
    (snap) => {
      try {
        const data = normalizePlatformStaffRtdb(snap.val());
        onUpdate({ data, error: null });
      } catch (e) {
        onUpdate({ data: [], error: { message: e?.message || 'Failed to parse staff' } });
      }
    },
    (err) => {
      onUpdate({ data: [], error: { message: err?.message || 'Listen failed' } });
    }
  );
}

/**
 * @param {unknown} val RTDB `platform/staffInvites`
 * @returns {Array<{ inviteId: string, invitee_name: string, email_normalized: string, intended_tier: string }>}
 */
export function normalizePlatformStaffInvitesRtdb(val) {
  if (!val || typeof val !== 'object') return [];
  const rows = Object.keys(val).map((id) => {
    const x = val[id];
    return {
      inviteId: x?.inviteId || id,
      invitee_name: x?.invitee_name != null ? String(x.invitee_name) : '',
      email_normalized: x?.email_normalized != null ? String(x.email_normalized) : '',
      intended_tier: x?.intended_tier === 'manager' ? 'manager' : 'admin'
    };
  });
  rows.sort((a, b) =>
    String(a.email_normalized || '').localeCompare(String(b.email_normalized || ''), undefined, {
      sensitivity: 'base'
    })
  );
  return rows;
}

/**
 * Pending platform staff invites (full admin only in UI; same read rule as other `platform/*`).
 * @param {(result: { data: ReturnType<typeof normalizePlatformStaffInvitesRtdb>, error: { message: string } | null }) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
export function subscribePlatformStaffInvites(onUpdate) {
  const r = ref(fbRtdb(), 'platform/staffInvites');
  return onValue(
    r,
    (snap) => {
      try {
        const data = normalizePlatformStaffInvitesRtdb(snap.val());
        onUpdate({ data, error: null });
      } catch (e) {
        onUpdate({ data: [], error: { message: e?.message || 'Failed to parse invites' } });
      }
    },
    (err) => {
      onUpdate({ data: [], error: { message: err?.message || 'Listen failed' } });
    }
  );
}
