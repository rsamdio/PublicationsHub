/**
 * Platform admin (admin.html): publishers (create org + browse), catalog, platform team (incl. full-admin tools).
 */
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { onAuthStateChange, signInWithGoogle, signOut } from '../auth.js';
import { fbAuth, fbFunctions } from '../firebase-init.js';
import {
  getCurrentPlatformStaff,
  subscribePublisherOrgForAdmin,
  subscribePlatformPublishers,
  subscribePlatformEditionCount,
  subscribePlatformStaff,
  subscribePlatformStaffInvites
} from '../db-admin.js';
import { subscribePublishedCatalog } from '../db-public.js';
import { sortEditionsNewestFirstInPlace } from '../edition-sort.js';
import {
  listMyPendingPlatformInvitesCallable,
  acceptPlatformInviteCallable,
  deleteEditionAssetsCallable,
  deleteSeriesCallable,
  deletePublisherCallable,
  updatePublisherNameCallable,
  listMyPublisherMemberships,
  publisherCreateInvite,
  publisherRevokeInvite,
  publisherRemoveMemberCallable,
  subscribeMyPublisherMemberships
} from '../db-publisher.js';
import {
  buildSeriesPagePath,
  formatReadLocationHash,
  getSeriesCanonicalIdForPublication
} from '../url-routes.js';
import { showToast, studioConfirm } from '../dashboard/studio-feedback.js';

/** @param {HTMLButtonElement | null} btn */
function setAdminSubmitBusy(btn, busy, busyText) {
  if (!btn) return;
  if (busy) {
    if (btn.dataset.adminOrigContent == null) btn.dataset.adminOrigContent = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '';
    const wrap = document.createElement('span');
    wrap.className = 'inline-flex items-center justify-center gap-2';
    const spin = document.createElement('span');
    spin.className = 'admin-spinner';
    spin.setAttribute('aria-hidden', 'true');
    const lab = document.createElement('span');
    lab.className = 'admin-busy-label';
    lab.textContent = busyText;
    wrap.appendChild(spin);
    wrap.appendChild(lab);
    btn.appendChild(wrap);
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.adminOrigContent != null) {
      btn.innerHTML = btn.dataset.adminOrigContent;
      delete btn.dataset.adminOrigContent;
    }
  }
}

function setAdminSubmitBusyLabel(btn, text) {
  if (!btn) return;
  btn.querySelector('.admin-busy-label')?.replaceChildren(document.createTextNode(text));
}

/** @param {unknown} err */
function formatCreatePublisherError(err) {
  const e = err && typeof err === 'object' ? /** @type {{ message?: string, code?: string }} */ (err) : {};
  const raw = String(e.message || '').trim();
  const code = String(e.code || '');
  if (code.includes('already-exists') || /slug already/i.test(raw)) {
    return 'That name maps to a URL slug that is already in use. Try a slightly different publisher name.';
  }
  if (code.includes('permission-denied')) {
    return raw || 'You do not have permission to create publishers.';
  }
  if (code.includes('unauthenticated')) {
    return 'Sign in again, then retry.';
  }
  return raw || 'Could not create publisher.';
}

const viewGuest = document.getElementById('view-guest');
const viewDenied = document.getElementById('view-denied');
const viewAdmin = document.getElementById('view-admin');
const guestError = document.getElementById('guest-error');
const btnGoogleSignin = document.getElementById('btn-google-signin');
const btnSignout = document.getElementById('btn-signout');
const btnSignoutDenied = document.getElementById('btn-signout-denied');
const deniedPlatformInvites = document.getElementById('denied-platform-invites');

const statsLine = document.getElementById('stats-line');
const publishersTbody = document.getElementById('publishers-tbody');

const adminFlowPill1 = document.getElementById('admin-flow-pill-1');
const adminFlowPill2 = document.getElementById('admin-flow-pill-2');
const adminFlowPill3 = document.getElementById('admin-flow-pill-3');
const adminStepPublishers = document.getElementById('admin-step-publishers');
const adminStepOrg = document.getElementById('admin-step-org');
const adminStepEditions = document.getElementById('admin-step-editions');
const btnAdminBackPublishers = document.getElementById('btn-admin-back-publishers');
const btnAdminBackOrg = document.getElementById('btn-admin-back-org');
const btnAdminDelPublisherOrg = document.getElementById('btn-admin-del-publisher-org');
const adminOrgTitle = document.getElementById('admin-org-title');
const adminOrgMeta = document.getElementById('admin-org-meta');
const adminOrgPanelPublications = document.getElementById('admin-org-panel-publications');
const adminOrgPanelTeam = document.getElementById('admin-org-panel-team');
const adminOrgSeriesTbody = document.getElementById('admin-org-series-tbody');
const adminOrgRosterTbody = document.getElementById('admin-org-roster-tbody');
const adminOrgInvitesTbody = document.getElementById('admin-org-invites-tbody');
const adminSeriesEditionsTitle = document.getElementById('admin-series-editions-title');
const adminSeriesEditionsSub = document.getElementById('admin-series-editions-sub');
const adminSeriesEditionsTbody = document.getElementById('admin-series-editions-tbody');

const allEditionsTbody = document.getElementById('all-editions-tbody');
const featuredOnlyTbody = document.getElementById('featured-only-tbody');
const pubMsg = document.getElementById('pub-msg');

const newPublisherModal = document.getElementById('new-publisher-modal');
const newPublisherForm = document.getElementById('new-publisher-form');
const btnNewPublisherOpen = document.getElementById('btn-new-publisher-open');
const newPublisherClose = document.getElementById('new-publisher-close');
const newPublisherCancel = document.getElementById('new-publisher-cancel');
const cpName = document.getElementById('cp-name');
const cpInternalRef = document.getElementById('cp-internal-ref');
const cpOwnerName = document.getElementById('cp-owner-name');
const cpOwnerEmail = document.getElementById('cp-owner-email');
const cpMsg = document.getElementById('cp-msg');
const btnNewPublisherSubmit = document.getElementById('btn-new-publisher-submit');

const editPublisherModal = document.getElementById('edit-publisher-modal');
const editPublisherForm = document.getElementById('edit-publisher-form');
const editPublisherClose = document.getElementById('edit-publisher-close');
const editPublisherCancel = document.getElementById('edit-publisher-cancel');
const epId = document.getElementById('ep-id');
const epName = document.getElementById('ep-name');
const epInternalRef = document.getElementById('ep-internal-ref');
const epMsg = document.getElementById('ep-msg');
const btnEditPublisherSubmit = document.getElementById('btn-edit-publisher-submit');

const adminTeamInviteModal = document.getElementById('admin-team-invite-modal');
const adminTeamInviteForm = document.getElementById('admin-team-invite-form');
const btnAdminNewTeamMemberOpen = document.getElementById('btn-admin-new-team-member-open');
const adminTeamInviteClose = document.getElementById('admin-team-invite-close');
const adminTeamInviteCancel = document.getElementById('admin-team-invite-cancel');
const atiName = document.getElementById('ati-name');
const atiEmail = document.getElementById('ati-email');
const atiRole = document.getElementById('ati-role');
const atiRoleOwnerOption = document.getElementById('ati-role-owner-option');
const atiRoleHint = document.getElementById('ati-role-hint');
const atiMsg = document.getElementById('ati-msg');
const btnAdminTeamInviteSubmit = document.getElementById('btn-admin-team-invite-submit');

const bfMsg = document.getElementById('bf-msg');
const btnBackfill = document.getElementById('btn-backfill');
const thumbBfMsg = document.getElementById('thumb-bf-msg');
const btnBackfillCoverThumbs = document.getElementById('btn-backfill-cover-thumbs');
/** @type {string} */
let coverThumbEditionCursor = '';
/** @type {string} */
let coverThumbSeriesCursor = '';

const staffTbody = document.getElementById('staff-tbody');
const platformPendingInvitesTbody = document.getElementById('platform-pending-invites-tbody');
const piName = document.getElementById('pi-name');
const piEmail = document.getElementById('pi-email');
const piTier = document.getElementById('pi-tier');
const piMsg = document.getElementById('pi-msg');
const btnPi = document.getElementById('btn-platform-invite');

function adminModalSubmitBusy() {
  return (
    btnNewPublisherSubmit?.getAttribute('aria-busy') === 'true' ||
    btnEditPublisherSubmit?.getAttribute('aria-busy') === 'true' ||
    btnAdminTeamInviteSubmit?.getAttribute('aria-busy') === 'true'
  );
}

const adminBlockingStatus = document.getElementById('admin-blocking-status');
const adminBlockingStatusText = document.getElementById('admin-blocking-status-text');

function showAdminBlockingStatus(message) {
  if (adminBlockingStatusText) adminBlockingStatusText.textContent = message;
  adminBlockingStatus?.classList.remove('hidden');
}

function hideAdminBlockingStatus() {
  adminBlockingStatus?.classList.add('hidden');
}

/**
 * @param {string} publisherId
 * @param {string} displayName
 * @param {HTMLButtonElement | null} busyBtn
 * @returns {Promise<boolean>} true if the organization was deleted
 */
async function confirmAndDeletePublisher(publisherId, displayName, busyBtn) {
  const label = String(displayName || '').trim() || publisherId;
  const ok = await studioConfirm({
    title: `Delete “${label}”?`,
    message: `Organization ID: ${publisherId}. This permanently deletes every publication, edition, stored PDF/cover, team member, and pending invite. This cannot be undone.`,
    confirmText: 'Delete organization',
    cancelText: 'Cancel',
    danger: true
  });
  if (!ok) return false;

  showAdminBlockingStatus('Deleting organization…');
  setAdminSubmitBusy(busyBtn, true, 'Deleting…');
  try {
    const { error: delErr } = await deletePublisherCallable(publisherId);
    if (delErr) {
      showToast(delErr.message || 'Delete failed', { type: 'error' });
      return false;
    }
    showToast(`“${label}” was deleted.`, { type: 'success' });
    return true;
  } finally {
    hideAdminBlockingStatus();
    setAdminSubmitBusy(busyBtn, false);
  }
}

const createPublisherFn = httpsCallable(fbFunctions(), 'createPublisher');
const backfillMirrorFn = httpsCallable(fbFunctions(), 'backfillMirror');
const backfillCoverThumbsFn = httpsCallable(fbFunctions(), 'backfillCoverThumbs');
const setEditionFeaturedFn = httpsCallable(fbFunctions(), 'setEditionFeatured');
const platformCreateInviteFn = httpsCallable(fbFunctions(), 'platformCreateInvite');
const platformRevokeInviteFn = httpsCallable(fbFunctions(), 'platformRevokeInvite');
const removePlatformStaffFn = httpsCallable(fbFunctions(), 'removePlatformStaff');

/** @type {'admin' | 'manager' | null} */
let adminTier = null;
let adminFull = true;
let activeAdminTab = 'publishers';
/** @type {'publishers' | 'org' | 'editions'} */
let adminBrowseStep = 'publishers';
/** @type {string | null} */
let browsePublisherId = null;
let browsePublisherName = '';
/** @type {string | null} */
let browseSeriesId = null;
let browseSeriesTitle = '';
/** @type {object | null} */
let cachedOrgSnapshot = null;
/** @type {(() => void) | null} */
let adminOrgUnsub = null;
/** @type {(() => void) | null} */
let publishersListUnsub = null;
/** @type {(() => void) | null} */
let catalogUnsub = null;
/** @type {(() => void) | null} */
let editionCountUnsub = null;
/** @type {(() => void) | null} */
let adminMembershipUnsub = null;
/** @type {(() => void) | null} */
let platformStaffUnsub = null;
/** @type {(() => void) | null} */
let platformStaffInvitesUnsub = null;
/** Debounced RTDB redraws — mirror updates can fire in bursts; avoid nuking the DOM every tick. */
let catalogRedrawTimer = null;
let publishersRedrawTimer = null;
let orgRedrawTimer = null;

const adminStatsState = {
  publisherCount: undefined,
  publisherError: null,
  editionCount: undefined,
  editionError: null,
  catalog: undefined,
  catalogError: null
};
/** @type {Array<{ publisherId: string, role: string, created_at: string | null }>} */
let adminMyMemberships = [];
/** @type {'publications' | 'team'} */
let activeOrgSubTab = 'publications';
/** @type {Array<object>} */
let cachedCatalog = [];

const FLOW_ACTIVE =
  'inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-3 py-1.5 border border-primary/25';
const FLOW_DONE =
  'inline-flex items-center gap-1.5 rounded-full bg-primary/5 text-primary/90 px-3 py-1.5 border border-primary/30';
const FLOW_UP =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border border-slate-700 text-slate-500';

function stopPlatformTeamRealtime() {
  platformStaffUnsub?.();
  platformStaffUnsub = null;
  platformStaffInvitesUnsub?.();
  platformStaffInvitesUnsub = null;
}

function startPlatformTeamRealtime() {
  stopPlatformTeamRealtime();
  platformStaffUnsub = subscribePlatformStaff((result) => {
    renderPlatformStaffTable(result);
  });
  if (adminFull) {
    platformStaffInvitesUnsub = subscribePlatformStaffInvites((result) => {
      renderPlatformStaffInvitesTable(result);
    });
  }
}

function stopAdminMembershipSubscription() {
  adminMembershipUnsub?.();
  adminMembershipUnsub = null;
}

function startAdminMembershipSubscription(uid) {
  stopAdminMembershipSubscription();
  if (!uid) return;
  adminMembershipUnsub = subscribeMyPublisherMemberships(uid, ({ data, error }) => {
    adminMyMemberships = !error && data ? data : [];
    if (browsePublisherId && cachedOrgSnapshot) {
      renderAdminOrgTeamTables();
    }
  });
}

function showGuest() {
  stopPublishersListSubscription();
  stopAdminCatalogRealtime();
  stopAdminMembershipSubscription();
  stopPlatformTeamRealtime();
  viewGuest?.classList.remove('hidden');
  viewDenied?.classList.add('hidden');
  viewAdmin?.classList.add('hidden');
  btnSignout?.classList.add('hidden');
  activeAdminTab = 'publishers';
  adminMyMemberships = [];
  resetAdminBrowse();
}

function showDenied() {
  stopPublishersListSubscription();
  stopAdminCatalogRealtime();
  stopAdminMembershipSubscription();
  stopPlatformTeamRealtime();
  viewGuest?.classList.add('hidden');
  viewDenied?.classList.remove('hidden');
  viewAdmin?.classList.add('hidden');
  btnSignout?.classList.remove('hidden');
}

function showAdmin() {
  viewGuest?.classList.add('hidden');
  viewDenied?.classList.add('hidden');
  viewAdmin?.classList.remove('hidden');
  btnSignout?.classList.remove('hidden');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function setMsg(el, text, isError) {
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
  el.classList.toggle('text-red-400', !!isError);
  el.classList.toggle('text-emerald-400', !!text && !isError);
}

function readerHrefForEdition(pub) {
  const eid = pub?.id != null ? String(pub.id).trim() : '';
  if (!eid) return 'publication';
  const sid = getSeriesCanonicalIdForPublication(pub) || eid;
  return `${buildSeriesPagePath(sid)}${formatReadLocationHash(eid)}`;
}

function resetAdminBrowse() {
  adminOrgUnsub?.();
  adminOrgUnsub = null;
  if (orgRedrawTimer) {
    clearTimeout(orgRedrawTimer);
    orgRedrawTimer = null;
  }
  adminBrowseStep = 'publishers';
  browsePublisherId = null;
  browsePublisherName = '';
  browseSeriesId = null;
  browseSeriesTitle = '';
  cachedOrgSnapshot = null;
  activeOrgSubTab = 'publications';
  setAdminOrgSubTab('publications');
  syncAdminBrowsePanels();
}

function syncAdminBrowsePanels() {
  const s = adminBrowseStep;
  adminStepPublishers?.classList.toggle('hidden', s !== 'publishers');
  adminStepOrg?.classList.toggle('hidden', s !== 'org');
  adminStepEditions?.classList.toggle('hidden', s !== 'editions');

  const p1 = adminFlowPill1;
  const p2 = adminFlowPill2;
  const p3 = adminFlowPill3;
  if (p1 && p2 && p3) {
    p1.className = s === 'publishers' ? FLOW_ACTIVE : FLOW_DONE;
    p2.className = s === 'org' ? FLOW_ACTIVE : s === 'editions' ? FLOW_DONE : FLOW_UP;
    p3.className = s === 'editions' ? FLOW_ACTIVE : FLOW_UP;
  }
}

function setAdminOrgSubTab(tab) {
  activeOrgSubTab = tab === 'team' ? 'team' : 'publications';
  adminOrgPanelPublications?.classList.toggle('hidden', activeOrgSubTab !== 'publications');
  adminOrgPanelTeam?.classList.toggle('hidden', activeOrgSubTab !== 'team');
  document.querySelectorAll('[data-admin-org-tab]').forEach((b) => {
    const on = b.getAttribute('data-admin-org-tab') === activeOrgSubTab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.classList.toggle('border-primary', on);
    b.classList.toggle('border-transparent', !on);
    b.classList.toggle('text-white', on);
    b.classList.toggle('text-slate-500', !on);
    b.classList.toggle('bg-surface-dark/40', on);
  });
}

function setAdminTab(tab) {
  activeAdminTab = tab;
  if (tab !== 'publishers') resetAdminBrowse();
  document.querySelectorAll('[data-admin-tab]').forEach((b) => {
    const on = b.getAttribute('data-admin-tab') === tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.classList.toggle('border-primary', on);
    b.classList.toggle('border-transparent', !on);
    b.classList.toggle('text-white', on);
    b.classList.toggle('text-slate-500', !on);
    b.classList.toggle('bg-surface-dark/60', on);
  });
  document.getElementById('admin-panel-publishers')?.classList.toggle('hidden', tab !== 'publishers');
  document.getElementById('admin-panel-publications')?.classList.toggle('hidden', tab !== 'publications');
  document.getElementById('admin-panel-team')?.classList.toggle('hidden', tab !== 'team');
}

function applyManagerRestrictions() {
  document.querySelectorAll('[data-full-admin-only]').forEach((el) => {
    el.classList.toggle('hidden', !adminFull);
  });
  if (!adminFull && btnBackfill) btnBackfill.disabled = true;
  if (adminFull && btnBackfill) btnBackfill.disabled = false;
  if (!adminFull && btnBackfillCoverThumbs) btnBackfillCoverThumbs.disabled = true;
  if (adminFull && btnBackfillCoverThumbs) btnBackfillCoverThumbs.disabled = false;
}

async function tryShowDeniedWithPlatformInvite() {
  showDenied();
  if (!deniedPlatformInvites) return;
  const { data, error } = await listMyPendingPlatformInvitesCallable();
  if (error || !data?.length) {
    deniedPlatformInvites.classList.add('hidden');
    deniedPlatformInvites.innerHTML = '';
    return;
  }
  deniedPlatformInvites.classList.remove('hidden');
  deniedPlatformInvites.innerHTML = `
    <p class="text-sm font-semibold text-primary mb-2">Pending platform access</p>
    <p class="text-xs text-text-secondary mb-3">Accept with the Google account that matches the invited email.</p>
    <ul class="space-y-2">${data
      .map(
        (inv) => `
      <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-dark border border-slate-700 px-3 py-2">
        <span class="text-sm text-white">${escapeHtml(inv.invitee_name || '')} — <span class="capitalize">${escapeHtml(inv.intended_tier || 'admin')}</span></span>
        <button type="button" class="accept-platform-invite px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold" data-invite-id="${escapeHtml(inv.inviteId)}">Accept</button>
      </li>`
      )
      .join('')}</ul>`;
}

deniedPlatformInvites?.addEventListener('click', (e) => {
  const b = /** @type {HTMLButtonElement | null} */ (e.target.closest('.accept-platform-invite'));
  if (!b) return;
  const inviteId = b.getAttribute('data-invite-id');
  if (!inviteId) return;
  void (async () => {
    showAdminBlockingStatus('Accepting invite…');
    setAdminSubmitBusy(b, true, 'Accepting…');
    try {
      const { error } = await acceptPlatformInviteCallable(inviteId);
      if (error) {
        showToast(error.message || 'Accept failed', { type: 'error' });
        return;
      }
      window.location.reload();
    } finally {
      hideAdminBlockingStatus();
      setAdminSubmitBusy(b, false);
    }
  })();
});

function renderAdminStatsLine() {
  if (!statsLine) return;
  if (adminStatsState.publisherError || adminStatsState.editionError || adminStatsState.catalogError) {
    statsLine.textContent = 'Could not load stats.';
    return;
  }
  if (
    adminStatsState.publisherCount === undefined ||
    adminStatsState.editionCount === undefined ||
    adminStatsState.catalog === undefined
  ) {
    return;
  }
  const pubLen = adminStatsState.publisherCount;
  const count = adminStatsState.editionCount;
  const cat = adminStatsState.catalog;
  const featuredN = cat.filter((p) => p.featured).length;
  statsLine.textContent = `${pubLen} publisher(s) · ~${count} editions in mirror · ${cat.length} catalog cards · ${featuredN} featured`;
}

function stopAdminCatalogRealtime() {
  if (catalogRedrawTimer) {
    clearTimeout(catalogRedrawTimer);
    catalogRedrawTimer = null;
  }
  catalogUnsub?.();
  catalogUnsub = null;
  editionCountUnsub?.();
  editionCountUnsub = null;
  adminStatsState.catalog = undefined;
  adminStatsState.catalogError = null;
  adminStatsState.editionCount = undefined;
  adminStatsState.editionError = null;
}

function startAdminCatalogRealtime() {
  stopAdminCatalogRealtime();
  catalogUnsub = subscribePublishedCatalog(({ data, error }) => {
    if (catalogRedrawTimer) clearTimeout(catalogRedrawTimer);
    catalogRedrawTimer = setTimeout(() => {
      catalogRedrawTimer = null;
      if (error) {
        adminStatsState.catalogError = error;
        adminStatsState.catalog = null;
      } else {
        adminStatsState.catalogError = null;
        adminStatsState.catalog = data || [];
      }
      renderCatalogTables(data, error);
      renderAdminStatsLine();
    }, 150);
  });
  editionCountUnsub = subscribePlatformEditionCount(({ count, error }) => {
    if (error) {
      adminStatsState.editionError = error;
      adminStatsState.editionCount = null;
    } else {
      adminStatsState.editionError = null;
      adminStatsState.editionCount = typeof count === 'number' ? count : 0;
    }
    renderAdminStatsLine();
  });
}

function stopPublishersListSubscription() {
  if (publishersRedrawTimer) {
    clearTimeout(publishersRedrawTimer);
    publishersRedrawTimer = null;
  }
  publishersListUnsub?.();
  publishersListUnsub = null;
  adminStatsState.publisherCount = undefined;
  adminStatsState.publisherError = null;
}

function startPublishersListSubscription() {
  stopPublishersListSubscription();
  publishersListUnsub = subscribePlatformPublishers(({ data, error }) => {
    if (publishersRedrawTimer) clearTimeout(publishersRedrawTimer);
    publishersRedrawTimer = setTimeout(() => {
      publishersRedrawTimer = null;
      renderPublishersTable(data, error);
      if (error) {
        adminStatsState.publisherError = error;
      } else {
        adminStatsState.publisherError = null;
        adminStatsState.publisherCount = data?.length ?? 0;
      }
      renderAdminStatsLine();
    }, 150);
  });
}

function renderPublishersTable(data, error) {
  if (!publishersTbody) return;
  publishersTbody.innerHTML = '';
  if (error) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="px-4 py-10 text-center text-slate-500 text-sm">${escapeHtml(error?.message || 'Could not load publishers.')}</td>`;
    publishersTbody.appendChild(tr);
    return;
  }
  const rows = data || [];
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="5" class="px-4 py-10 text-center text-slate-500 text-sm">No publishers yet.</td>';
    publishersTbody.appendChild(tr);
    return;
  }
  rows.forEach((p) => {
    const tr = document.createElement('tr');
    tr.className =
      'hover:bg-surface-dark-hover/40 transition-colors cursor-pointer admin-publisher-row';
    tr.dataset.publisherId = p.id;
    tr.dataset.publisherName = p.name || '';
    tr.dataset.internalReference = (p.internal_reference && String(p.internal_reference).trim()) || '';
    const delBtn = adminFull
      ? `<button type="button" class="admin-del-publisher-row text-xs text-red-400 hover:underline" data-publisher-id="${escapeHtml(p.id)}" data-publisher-name="${escapeHtml(p.name)}">Delete org</button>`
      : '';
    const actionsCell = `<td class="px-4 py-3.5 text-right">
      <span class="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <button type="button" class="admin-edit-publisher-row text-xs font-semibold text-primary hover:underline" data-publisher-id="${escapeHtml(p.id)}" data-publisher-name="${escapeHtml(p.name)}">Edit</button>
        ${delBtn}
      </span>
    </td>`;
    const refCell = tr.dataset.internalReference
      ? `<span class="text-slate-300">${escapeHtml(tr.dataset.internalReference)}</span>`
      : '—';
    tr.innerHTML = `
      <td class="px-4 py-3.5 text-white font-medium">${escapeHtml(p.name)}</td>
      <td class="px-4 py-3.5 text-sm max-w-[14rem]">${refCell}</td>
      <td class="px-4 py-3.5"><span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${p.status === 'active' ? 'bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-800/50' : 'bg-slate-800 text-slate-400 ring-1 ring-slate-700'}">${escapeHtml(p.status)}</span></td>
      <td class="px-4 py-3.5 text-slate-500 font-mono text-xs select-all">${escapeHtml(p.id)}</td>
      ${actionsCell}`;
    publishersTbody.appendChild(tr);
  });
}

/**
 * Live RTDB org mirror — same listeners as Publisher studio (`subscribePublisherStudio`).
 */
function loadAndRenderOrg(pid) {
  adminOrgUnsub?.();
  adminOrgUnsub = null;
  if (orgRedrawTimer) {
    clearTimeout(orgRedrawTimer);
    orgRedrawTimer = null;
  }
  cachedOrgSnapshot = { series: {}, editions: {}, invites: {}, roster: {} };
  renderAdminOrgSeriesTable();
  renderAdminOrgTeamTables();
  if (adminBrowseStep === 'editions' && browseSeriesId) {
    renderAdminSeriesEditionsTable();
  }
  adminOrgUnsub = subscribePublisherOrgForAdmin(pid, (data) => {
    if (browsePublisherId !== pid) return;
    cachedOrgSnapshot = data;
    if (orgRedrawTimer) clearTimeout(orgRedrawTimer);
    orgRedrawTimer = setTimeout(() => {
      orgRedrawTimer = null;
      if (browsePublisherId !== pid) return;
      renderAdminOrgSeriesTable();
      renderAdminOrgTeamTables();
      if (adminBrowseStep === 'editions' && browseSeriesId) {
        renderAdminSeriesEditionsTable();
      }
    }, 120);
  });
}

/** Match studio `getRosterRowsForDisplay`: include signed-in user when in RTDB memberships but roster row lags. */
function getAdminRosterRowsForDisplay() {
  let roster = Object.entries(cachedOrgSnapshot?.roster || {}).map(([uid, v]) => ({ uid, ...v }));
  const auth = fbAuth();
  const u = auth.currentUser;
  if (u && browsePublisherId) {
    if (!roster.some((r) => r.uid === u.uid)) {
      const m = adminMyMemberships.find((x) => x.publisherId === browsePublisherId);
      if (m) {
        roster.push({
          uid: u.uid,
          email: (u.email || '').toLowerCase(),
          display_name: u.displayName || u.email || 'You',
          role: m.role || 'editor'
        });
      }
    }
  }
  return roster;
}

function renderAdminOrgSeriesTable() {
  if (!adminOrgSeriesTbody || !cachedOrgSnapshot) return;
  const data = cachedOrgSnapshot;
  const seriesIds = Object.keys(data.series || {}).sort((a, b) => {
    const ta = data.series[a]?.title || a;
    const tb = data.series[b]?.title || b;
    return String(ta).localeCompare(String(tb));
  });
  const editions = Object.entries(data.editions || {}).map(([id, v]) => ({ id, ...v }));
  adminOrgSeriesTbody.innerHTML = '';
  if (!seriesIds.length) {
    adminOrgSeriesTbody.innerHTML =
      '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500 text-sm">No publications in mirror.</td></tr>';
    return;
  }
  seriesIds.forEach((sid) => {
    const s = data.series[sid];
    const count = editions.filter((e) => e.series_id === sid).length;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-surface-dark-hover/40';
    const title = s?.title || sid;
    tr.innerHTML = `
      <td class="px-4 py-3 text-white font-medium">${escapeHtml(title)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${escapeHtml(sid)}</td>
      <td class="px-4 py-3 text-right text-slate-400 tabular-nums">${count}</td>
      <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
        <button type="button" class="admin-open-series-editions text-xs font-semibold text-primary hover:underline" data-series-id="${escapeHtml(sid)}">View editions</button>
        <button type="button" class="admin-del-series-in-org text-xs text-red-400 hover:underline" data-series-id="${escapeHtml(sid)}">Delete</button>
      </td>`;
    const openBtn = tr.querySelector('.admin-open-series-editions');
    if (openBtn) openBtn.dataset.seriesTitle = title;
    adminOrgSeriesTbody.appendChild(tr);
  });
}

function renderAdminOrgTeamTables() {
  if (!cachedOrgSnapshot) return;
  const roster = getAdminRosterRowsForDisplay();
  const invites = Object.entries(cachedOrgSnapshot.invites || {})
    .map(([id, v]) => ({ id, ...v }))
    .filter((i) => i.status === 'pending' || i.status == null || i.status === '');
  const ownerCount = roster.filter((r) => r.role === 'owner').length;

  if (adminOrgRosterTbody) {
    adminOrgRosterTbody.innerHTML = '';
    if (!roster.length) {
      adminOrgRosterTbody.innerHTML =
        '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500 text-sm">No active members.</td></tr>';
    } else {
      roster.sort((a, b) =>
        String(a.display_name || a.email || '').localeCompare(String(b.display_name || b.email || ''))
      );
      roster.forEach((r) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-surface-dark-hover/40';
        const isTargetOwner = r.role === 'owner';
        const canRemove = Boolean(r.uid) && (!isTargetOwner || ownerCount > 1);
        const removeCell = canRemove
          ? `<button type="button" class="admin-remove-publisher-member text-xs text-red-400 hover:underline" data-target-uid="${escapeHtml(r.uid)}">Remove</button>`
          : '<span class="text-xs text-slate-600">—</span>';
        tr.innerHTML = `
          <td class="px-4 py-3 text-white">${escapeHtml(r.display_name || r.uid || '—')}</td>
          <td class="px-4 py-3 text-slate-400 text-xs">${escapeHtml(r.email || '')}</td>
          <td class="px-4 py-3 text-slate-400 capitalize">${escapeHtml(r.role || '')}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap">${removeCell}</td>`;
        adminOrgRosterTbody.appendChild(tr);
      });
    }
  }

  if (adminOrgInvitesTbody) {
    adminOrgInvitesTbody.innerHTML = '';
    if (!invites.length) {
      adminOrgInvitesTbody.innerHTML =
        '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500 text-sm">No pending invites.</td></tr>';
    } else {
      invites.forEach((i) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-surface-dark-hover/40';
        tr.innerHTML = `
          <td class="px-4 py-3 text-white">${escapeHtml(i.invitee_name || '—')}</td>
          <td class="px-4 py-3 text-slate-400 text-xs font-mono">${escapeHtml(i.email_normalized || '')}</td>
          <td class="px-4 py-3 text-slate-400 capitalize">${escapeHtml(i.intended_role || 'editor')}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap"><button type="button" class="admin-revoke-publisher-invite text-xs text-red-400 hover:underline" data-invite-id="${escapeHtml(i.id)}">Revoke</button></td>`;
        adminOrgInvitesTbody.appendChild(tr);
      });
    }
  }
}

function renderAdminSeriesEditionsTable() {
  if (!adminSeriesEditionsTbody || !cachedOrgSnapshot || !browseSeriesId) return;
  const editions = Object.entries(cachedOrgSnapshot.editions || {})
    .map(([id, v]) => ({ id, ...v }))
    .filter((e) => e.series_id === browseSeriesId);
  sortEditionsNewestFirstInPlace(editions);
  adminSeriesEditionsTbody.innerHTML = '';
  if (!editions.length) {
    adminSeriesEditionsTbody.innerHTML =
      '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500 text-sm">No editions for this series in mirror.</td></tr>';
    return;
  }
  editions.forEach((ed) => {
    const reader = readerHrefForEdition(ed);
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-surface-dark-hover/40';
    tr.innerHTML = `
      <td class="px-4 py-3 text-white font-medium">${escapeHtml(ed.title || ed.id)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${escapeHtml(ed.id)}</td>
      <td class="px-4 py-3"><a href="${escapeHtml(reader)}" class="text-primary text-xs font-medium hover:underline" target="_blank" rel="noopener noreferrer">Open</a></td>
      <td class="px-4 py-3 text-right"><button type="button" class="admin-del-edition-row text-xs text-red-400 hover:underline" data-edition-id="${escapeHtml(ed.id)}">Delete</button></td>`;
    adminSeriesEditionsTbody.appendChild(tr);
  });
}

async function goToAdminOrg(pid, name) {
  browsePublisherId = pid;
  browsePublisherName = name || pid;
  browseSeriesId = null;
  browseSeriesTitle = '';
  adminBrowseStep = 'org';
  activeOrgSubTab = 'publications';
  if (adminOrgTitle) adminOrgTitle.textContent = browsePublisherName;
  if (adminOrgMeta) adminOrgMeta.textContent = pid;
  setAdminOrgSubTab('publications');
  syncAdminBrowsePanels();
  loadAndRenderOrg(pid);
}

function goToAdminSeriesEditions(seriesId, seriesTitle) {
  browseSeriesId = seriesId;
  browseSeriesTitle = seriesTitle || seriesId;
  adminBrowseStep = 'editions';
  if (adminSeriesEditionsTitle) adminSeriesEditionsTitle.textContent = browseSeriesTitle;
  if (adminSeriesEditionsSub) adminSeriesEditionsSub.textContent = seriesId;
  renderAdminSeriesEditionsTable();
  syncAdminBrowsePanels();
}

function refreshOpenOrgFromMirror() {
  if (!browsePublisherId) return;
  loadAndRenderOrg(browsePublisherId);
  if (adminBrowseStep === 'editions' && browseSeriesId) {
    renderAdminSeriesEditionsTable();
  }
}

document.getElementById('admin-panel-publishers')?.addEventListener('click', async (e) => {
  const revokePubInv = e.target.closest('.admin-revoke-publisher-invite');
  if (revokePubInv) {
    e.stopPropagation();
    const inviteId = revokePubInv.getAttribute('data-invite-id');
    const publisherId = browsePublisherId;
    if (!inviteId || !publisherId) return;
    const ok = await studioConfirm({
      title: 'Revoke invite?',
      message: 'They will no longer be able to accept this invitation.',
      confirmText: 'Revoke',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    showAdminBlockingStatus('Revoking invite…');
    try {
      const { error } = await publisherRevokeInvite({ publisherId, inviteId });
      if (error) {
        showToast(error.message || 'Revoke failed', { type: 'error' });
        return;
      }
      showToast('Invite revoked.', { type: 'success' });
    } finally {
      hideAdminBlockingStatus();
    }
    return;
  }

  const remPubMem = e.target.closest('.admin-remove-publisher-member');
  if (remPubMem) {
    e.stopPropagation();
    const targetUid = remPubMem.getAttribute('data-target-uid');
    const publisherId = browsePublisherId;
    if (!targetUid || !publisherId) return;
    const ok = await studioConfirm({
      title: 'Remove member?',
      message: 'They will lose access to this publisher until invited again.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    showAdminBlockingStatus('Removing member…');
    try {
      const { error } = await publisherRemoveMemberCallable({ publisherId, targetUid });
      if (error) {
        showToast(error.message || 'Remove failed', { type: 'error' });
        return;
      }
      showToast('Member removed.', { type: 'success' });
      await refreshAdminMemberships();
      loadAndRenderOrg(publisherId);
    } finally {
      hideAdminBlockingStatus();
    }
    return;
  }

  const openSeries = e.target.closest('.admin-open-series-editions');
  if (openSeries) {
    const sid = openSeries.getAttribute('data-series-id');
    const st = openSeries.dataset.seriesTitle || sid;
    if (sid) goToAdminSeriesEditions(sid, st);
    return;
  }

  const delSeries = e.target.closest('.admin-del-series-in-org');
  if (delSeries) {
    const seriesId = delSeries.getAttribute('data-series-id');
    if (!seriesId) return;
    const ok = await studioConfirm({
      title: 'Delete publication (series)?',
      message: `Delete series ${seriesId} and all editions under it (including R2 PDF/cover objects)? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    showAdminBlockingStatus('Deleting publication…');
    try {
      const { error: delErr } = await deleteSeriesCallable(seriesId);
      if (delErr) {
        showToast(delErr.message || 'Delete failed', { type: 'error' });
        return;
      }
      showToast('Series deleted.', { type: 'success' });
      if (browseSeriesId === seriesId) {
        adminBrowseStep = 'org';
        browseSeriesId = null;
        browseSeriesTitle = '';
        syncAdminBrowsePanels();
      }
      await refreshOpenOrgFromMirror();
    } finally {
      hideAdminBlockingStatus();
    }
    return;
  }

  const delEd = e.target.closest('.admin-del-edition-row');
  if (delEd) {
    const editionId = delEd.getAttribute('data-edition-id');
    if (!editionId) return;
    const ok = await studioConfirm({
      title: 'Delete edition?',
      message: `Delete edition ${editionId} (Firestore + R2 PDF/cover)? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    showAdminBlockingStatus('Deleting edition…');
    try {
      const { error: delErr } = await deleteEditionAssetsCallable(editionId);
      if (delErr) {
        showToast(delErr.message || 'Delete failed', { type: 'error' });
        return;
      }
      showToast('Edition removed.', { type: 'success' });
      await refreshOpenOrgFromMirror();
    } finally {
      hideAdminBlockingStatus();
    }
    return;
  }

  if (e.target.closest('#btn-admin-del-publisher-org')) {
    const publisherId = browsePublisherId;
    if (!publisherId || !adminFull) return;
    const deleted = await confirmAndDeletePublisher(
      publisherId,
      browsePublisherName || '',
      btnAdminDelPublisherOrg
    );
    if (!deleted) return;
    resetAdminBrowse();
    syncAdminBrowsePanels();
  }
});

btnAdminBackPublishers?.addEventListener('click', () => {
  resetAdminBrowse();
  syncAdminBrowsePanels();
});

btnAdminBackOrg?.addEventListener('click', () => {
  adminBrowseStep = 'org';
  browseSeriesId = null;
  browseSeriesTitle = '';
  syncAdminBrowsePanels();
});

document.querySelectorAll('[data-admin-org-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = btn.getAttribute('data-admin-org-tab');
    if (t === 'publications' || t === 'team') setAdminOrgSubTab(t);
  });
});

publishersTbody?.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('.admin-edit-publisher-row');
  if (editBtn) {
    e.stopPropagation();
    const publisherId = editBtn.getAttribute('data-publisher-id');
    const pubName = editBtn.getAttribute('data-publisher-name') || '';
    const row = editBtn.closest('tr.admin-publisher-row');
    const internalRef = row?.dataset?.internalReference || '';
    if (!publisherId) return;
    openEditPublisherModal(publisherId, pubName, internalRef);
    return;
  }
  const delBtn = /** @type {HTMLButtonElement | null} */ (e.target.closest('.admin-del-publisher-row'));
  if (delBtn) {
    e.stopPropagation();
    const publisherId = delBtn.getAttribute('data-publisher-id');
    const pubName = delBtn.getAttribute('data-publisher-name') || publisherId;
    if (!publisherId || !adminFull) return;
    const deleted = await confirmAndDeletePublisher(publisherId, pubName || '', delBtn);
    if (!deleted) return;
    if (browsePublisherId === publisherId) {
      resetAdminBrowse();
      syncAdminBrowsePanels();
    }
    return;
  }
  const row = e.target.closest('tr.admin-publisher-row');
  const pid = row?.dataset?.publisherId;
  if (!pid) return;
  const pname = row?.dataset?.publisherName || '';
  await goToAdminOrg(pid, pname);
});

/** Switch UI; `.fe-toggle` checkbox + styles in admin.html (`.admin-featured-switch`). */
function adminFeaturedToggleCellHtml(idAttr, featured, ariaLabel) {
  const checked = featured ? ' checked' : '';
  return `<label class="admin-featured-switch">
        <input type="checkbox" class="fe-toggle" data-edition-id="${idAttr}"${checked} aria-label="${escapeHtml(ariaLabel)}" />
        <span class="admin-featured-switch-track" aria-hidden="true"></span>
        <span class="admin-featured-switch-thumb" aria-hidden="true"></span>
      </label>`;
}

function bindFeaturedToggle(tbody) {
  if (!tbody) return;
  tbody.addEventListener('change', async (e) => {
    const t = e.target;
    if (!t.classList?.contains('fe-toggle')) return;
    const editionId = t.getAttribute('data-edition-id');
    if (!editionId) return;
    t.disabled = true;
    showAdminBlockingStatus('Updating featured…');
    try {
      await setEditionFeaturedFn({ editionId, featured: t.checked });
      setMsg(pubMsg, 'Featured flag saved.', false);
      setTimeout(() => setMsg(pubMsg, '', false), 4000);
    } catch (err) {
      t.checked = !t.checked;
      setMsg(pubMsg, err?.message || err?.details || 'Update failed', true);
    } finally {
      hideAdminBlockingStatus();
      t.disabled = false;
    }
  });
}

bindFeaturedToggle(allEditionsTbody);
bindFeaturedToggle(featuredOnlyTbody);

function renderCatalogTables(data, error) {
  setMsg(pubMsg, '', false);
  if (allEditionsTbody) allEditionsTbody.innerHTML = '';
  if (featuredOnlyTbody) featuredOnlyTbody.innerHTML = '';
  if (error) {
    const empty = `<tr><td colspan="6" class="px-4 py-10 text-center text-slate-500 text-sm">${escapeHtml(error?.message || 'Could not load catalog.')}</td></tr>`;
    if (allEditionsTbody) allEditionsTbody.innerHTML = empty;
    if (featuredOnlyTbody) featuredOnlyTbody.innerHTML = empty;
    cachedCatalog = [];
    return;
  }
  if (!data?.length) {
    const empty =
      '<tr><td colspan="6" class="px-4 py-10 text-center text-slate-500 text-sm">No catalog editions.</td></tr>';
    if (allEditionsTbody) allEditionsTbody.innerHTML = empty;
    if (featuredOnlyTbody) featuredOnlyTbody.innerHTML = empty;
    cachedCatalog = [];
    return;
  }
  cachedCatalog = data;
  const sorted = sortEditionsNewestFirstInPlace([...data]);
  sorted.forEach((pub) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-surface-dark-hover/40 transition-colors';
    const id = pub.id;
    const idAttr = escapeHtml(id);
    const reader = readerHrefForEdition(pub);
    tr.innerHTML = `
      <td class="px-4 py-3">
        ${adminFeaturedToggleCellHtml(idAttr, !!pub.featured, 'Feature on Explore home')}
      </td>
      <td class="px-4 py-3 text-white font-medium">${escapeHtml(pub.title || 'Untitled')}</td>
      <td class="px-4 py-3 text-slate-400">${escapeHtml(pub.publisher_name || '—')}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${idAttr}</td>
      <td class="px-4 py-3"><a href="${escapeHtml(reader)}" class="text-primary text-xs font-medium hover:underline" target="_blank" rel="noopener noreferrer">Open</a></td>
      <td class="px-4 py-3 text-right"><button type="button" class="admin-del-edition-catalog text-xs text-red-400 hover:underline" data-edition-id="${idAttr}">Delete</button></td>`;
    allEditionsTbody?.appendChild(tr);
  });

  const featured = sorted.filter((p) => p.featured);
  if (!featured.length) {
    featuredOnlyTbody?.insertAdjacentHTML(
      'beforeend',
      '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500 text-sm">No featured editions. Toggle rows in “All editions”.</td></tr>'
    );
  } else {
    featured.forEach((pub) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-surface-dark-hover/40 transition-colors';
      const id = pub.id;
      const idAttr = escapeHtml(id);
      tr.innerHTML = `
      <td class="px-4 py-3">
        ${adminFeaturedToggleCellHtml(idAttr, true, 'Featured on Explore')}
      </td>
      <td class="px-4 py-3 text-white font-medium">${escapeHtml(pub.title || 'Untitled')}</td>
      <td class="px-4 py-3 text-slate-400">${escapeHtml(pub.publisher_name || '—')}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${idAttr}</td>
      <td class="px-4 py-3"><a href="${escapeHtml(readerHrefForEdition(pub))}" class="text-primary text-xs font-medium hover:underline" target="_blank" rel="noopener noreferrer">Open</a></td>
      <td class="px-4 py-3 text-right"><button type="button" class="admin-del-edition-catalog text-xs text-red-400 hover:underline" data-edition-id="${idAttr}">Delete</button></td>`;
      featuredOnlyTbody?.appendChild(tr);
    });
  }
}

function bindCatalogEditionDelete(tbody) {
  tbody?.addEventListener('click', async (e) => {
    const b = /** @type {HTMLButtonElement | null} */ (e.target.closest('.admin-del-edition-catalog'));
    if (!b) return;
    const editionId = b.getAttribute('data-edition-id');
    if (!editionId) return;
    const ok = await studioConfirm({
      title: 'Delete edition?',
      message: `Delete edition ${editionId} (Firestore + R2 PDF/cover)? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    showAdminBlockingStatus('Deleting edition…');
    setAdminSubmitBusy(b, true, 'Deleting…');
    try {
      const { error: delErr } = await deleteEditionAssetsCallable(editionId);
      if (delErr) {
        setMsg(pubMsg, delErr.message || 'Delete failed', true);
        return;
      }
      setMsg(pubMsg, 'Edition removed.', false);
      setTimeout(() => setMsg(pubMsg, '', false), 4000);
      if (browsePublisherId) await refreshOpenOrgFromMirror();
    } finally {
      hideAdminBlockingStatus();
      setAdminSubmitBusy(b, false);
    }
  });
}

bindCatalogEditionDelete(allEditionsTbody);
bindCatalogEditionDelete(featuredOnlyTbody);

function renderPlatformStaffInvitesTable(result) {
  if (!platformPendingInvitesTbody || !adminFull) return;
  const { data, error } = result || {};
  platformPendingInvitesTbody.innerHTML = '';
  if (error) {
    platformPendingInvitesTbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-400 text-sm">${escapeHtml(error.message || 'Failed to load invites')}</td></tr>`;
    return;
  }
  const rows = data || [];
  if (!rows.length) {
    platformPendingInvitesTbody.innerHTML =
      '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500 text-sm">No pending platform invites.</td></tr>';
    return;
  }
  rows.forEach((inv) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-surface-dark-hover/40';
    const iid = escapeHtml(inv.inviteId);
    tr.innerHTML = `
      <td class="px-4 py-3 text-white">${escapeHtml(inv.invitee_name || '—')}</td>
      <td class="px-4 py-3 text-slate-400 text-xs font-mono">${escapeHtml(inv.email_normalized || '')}</td>
      <td class="px-4 py-3 text-slate-400 capitalize">${escapeHtml(inv.intended_tier || 'admin')}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap"><button type="button" class="revoke-platform-pending-invite text-xs text-red-400 hover:underline" data-invite-id="${iid}">Revoke</button></td>`;
    platformPendingInvitesTbody.appendChild(tr);
  });
}

function renderPlatformStaffTable(result) {
  if (!staffTbody) return;
  const { data, error } = result || {};
  staffTbody.innerHTML = '';
  if (error) {
    staffTbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-400 text-sm">${escapeHtml(error.message || 'Failed to load staff')}</td></tr>`;
    return;
  }
  const staff = data || [];
  if (!staff.length) {
    staffTbody.innerHTML =
      '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 text-sm">No platform staff.</td></tr>';
    return;
  }
  staff.forEach((s) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-surface-dark-hover/40';
    const uid = escapeHtml(s.uid);
    tr.innerHTML = `
        <td class="px-4 py-3 text-slate-400 font-mono text-xs">${uid}</td>
        <td class="px-4 py-3 text-white">${escapeHtml(s.email || '—')}</td>
        <td class="px-4 py-3 text-slate-300">${escapeHtml(s.displayName || '—')}</td>
        <td class="px-4 py-3 text-slate-400 capitalize">${escapeHtml(s.tier || 'admin')}</td>
        <td class="px-4 py-3 text-right">${adminFull ? `<button type="button" class="remove-staff-btn text-xs text-red-400 hover:underline" data-uid="${uid}">Remove</button>` : '<span class="text-slate-600 text-xs">—</span>'}</td>`;
    staffTbody.appendChild(tr);
  });
}

staffTbody?.addEventListener('click', async (e) => {
  const b = /** @type {HTMLButtonElement | null} */ (e.target.closest('.remove-staff-btn'));
  if (!b || !adminFull) return;
  const targetUid = b.getAttribute('data-uid');
  if (!targetUid) return;
  const ok = await studioConfirm({
    title: 'Remove platform staff?',
    message: 'They will lose access to this admin console until added again.',
    confirmText: 'Remove',
    cancelText: 'Cancel',
    danger: true
  });
  if (!ok) return;
  showAdminBlockingStatus('Removing staff…');
  setAdminSubmitBusy(b, true, 'Removing…');
  try {
    await removePlatformStaffFn({ targetUid });
    showToast('Staff member removed.', { type: 'success' });
  } catch (err) {
    showToast(err?.message || err?.details || 'Remove failed', { type: 'error' });
  } finally {
    hideAdminBlockingStatus();
    setAdminSubmitBusy(b, false);
  }
});

document.getElementById('admin-panel-team')?.addEventListener('click', async (e) => {
  const b = /** @type {HTMLButtonElement | null} */ (e.target.closest('.revoke-platform-pending-invite'));
  if (!b || !adminFull) return;
  const inviteId = b.getAttribute('data-invite-id');
  if (!inviteId) return;
  const ok = await studioConfirm({
    title: 'Revoke platform invite?',
    message: 'They will no longer be able to accept platform access with this invite.',
    confirmText: 'Revoke',
    cancelText: 'Cancel',
    danger: true
  });
  if (!ok) return;
  showAdminBlockingStatus('Revoking invite…');
  setAdminSubmitBusy(b, true, 'Revoking…');
  try {
    await platformRevokeInviteFn({ inviteId });
    showToast('Platform invite revoked.', { type: 'success' });
  } catch (err) {
    showToast(err?.message || err?.details || 'Revoke failed', { type: 'error' });
  } finally {
    hideAdminBlockingStatus();
    setAdminSubmitBusy(b, false);
  }
});

async function refreshForUser(user) {
  if (!user) {
    showGuest();
    return;
  }
  const { isStaff, tier, error } = await getCurrentPlatformStaff();
  if (error) {
    guestError.textContent = error.message || 'Could not verify access';
    guestError.classList.remove('hidden');
    showGuest();
    return;
  }
  if (!isStaff) {
    await tryShowDeniedWithPlatformInvite();
    return;
  }
  adminTier = tier;
  adminFull = tier !== 'manager';
  showAdmin();
  applyManagerRestrictions();
  setAdminTab(activeAdminTab);
  syncAdminBrowsePanels();
  startPublishersListSubscription();
  startAdminCatalogRealtime();
  startAdminMembershipSubscription(user.uid);
  startPlatformTeamRealtime();
  await refreshAdminMemberships();
}

async function refreshAdminMemberships() {
  const { data, error } = await listMyPublisherMemberships();
  adminMyMemberships = !error && data ? data : [];
  if (browsePublisherId && cachedOrgSnapshot) {
    renderAdminOrgTeamTables();
  }
}

document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-admin-tab');
    if (tab) setAdminTab(tab);
  });
});

onAuthStateChange((state, user) => {
  if (state === 'SIGNED_IN' && user) {
    guestError?.classList.add('hidden');
    void refreshForUser(user);
  } else {
    showGuest();
  }
});

btnGoogleSignin?.addEventListener('click', async () => {
  guestError?.classList.add('hidden');
  setAdminSubmitBusy(btnGoogleSignin, true, 'Signing in…');
  try {
    const { error } = await signInWithGoogle();
    if (error) {
      guestError.textContent = error.message || 'Sign-in failed';
      guestError.classList.remove('hidden');
    }
  } finally {
    setAdminSubmitBusy(btnGoogleSignin, false);
  }
});

btnSignout?.addEventListener('click', () => signOut());
btnSignoutDenied?.addEventListener('click', () => signOut());

function openNewPublisherModal() {
  setMsg(cpMsg, '', false);
  newPublisherForm?.reset();
  newPublisherModal?.classList.remove('hidden');
  newPublisherModal?.classList.add('flex');
  queueMicrotask(() => cpName?.focus());
}

/** @param {boolean} [force] When true, close even if a submit is in progress (after success path). */
function closeNewPublisherModal(force) {
  if (!force && adminModalSubmitBusy()) return;
  newPublisherModal?.classList.add('hidden');
  newPublisherModal?.classList.remove('flex');
  setMsg(cpMsg, '', false);
}

function openEditPublisherModal(publisherId, currentName, internalRef) {
  setMsg(epMsg, '', false);
  if (epId) epId.value = publisherId;
  if (epName) epName.value = currentName || '';
  if (epInternalRef) epInternalRef.value = (internalRef && String(internalRef)) || '';
  editPublisherModal?.classList.remove('hidden');
  editPublisherModal?.classList.add('flex');
  queueMicrotask(() => epName?.focus());
}

/** @param {boolean} [force] When true, close even if a submit is in progress (after success path). */
function closeEditPublisherModal(force) {
  if (!force && adminModalSubmitBusy()) return;
  editPublisherModal?.classList.add('hidden');
  editPublisherModal?.classList.remove('flex');
  setMsg(epMsg, '', false);
}

btnNewPublisherOpen?.addEventListener('click', () => openNewPublisherModal());
newPublisherClose?.addEventListener('click', closeNewPublisherModal);
newPublisherCancel?.addEventListener('click', closeNewPublisherModal);
newPublisherModal?.addEventListener('click', (e) => {
  if (e.target === newPublisherModal) closeNewPublisherModal();
});

editPublisherClose?.addEventListener('click', closeEditPublisherModal);
editPublisherCancel?.addEventListener('click', closeEditPublisherModal);
editPublisherModal?.addEventListener('click', (e) => {
  if (e.target === editPublisherModal) closeEditPublisherModal();
});

function syncAdminTeamInviteRoleUi() {
  if (atiRoleOwnerOption) {
    atiRoleOwnerOption.disabled = !adminFull;
  }
  if (atiRoleHint) {
    atiRoleHint.classList.toggle('hidden', adminFull);
  }
  if (!adminFull && atiRole?.value === 'owner') {
    atiRole.value = 'editor';
  }
}

function openAdminTeamInviteModal() {
  if (!browsePublisherId) {
    showToast('Open a publisher first.', { type: 'error' });
    return;
  }
  setMsg(atiMsg, '', false);
  adminTeamInviteForm?.reset();
  syncAdminTeamInviteRoleUi();
  adminTeamInviteModal?.classList.remove('hidden');
  adminTeamInviteModal?.classList.add('flex');
  queueMicrotask(() => atiName?.focus());
}

/** @param {boolean} [force] When true, close even if a submit is in progress (after success path). */
function closeAdminTeamInviteModal(force) {
  if (!force && adminModalSubmitBusy()) return;
  adminTeamInviteModal?.classList.add('hidden');
  adminTeamInviteModal?.classList.remove('flex');
  setMsg(atiMsg, '', false);
}

btnAdminNewTeamMemberOpen?.addEventListener('click', () => openAdminTeamInviteModal());
adminTeamInviteClose?.addEventListener('click', closeAdminTeamInviteModal);
adminTeamInviteCancel?.addEventListener('click', closeAdminTeamInviteModal);
adminTeamInviteModal?.addEventListener('click', (e) => {
  if (e.target === adminTeamInviteModal) closeAdminTeamInviteModal();
});

adminTeamInviteForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const publisherId = browsePublisherId;
  if (!publisherId) {
    setMsg(atiMsg, 'No publisher selected.', true);
    return;
  }
  setMsg(atiMsg, '', false);
  const invitee_name = (atiName?.value || '').trim();
  const email = (atiEmail?.value || '').trim();
  let intended_role = atiRole?.value === 'owner' ? 'owner' : 'editor';
  if (!adminFull) intended_role = 'editor';
  if (!invitee_name || !email) {
    setMsg(atiMsg, 'Name and email are required.', true);
    return;
  }
  setAdminSubmitBusy(btnAdminTeamInviteSubmit, true, 'Sending…');
  try {
    const { error } = await publisherCreateInvite({
      publisherId,
      invitee_name,
      email,
      intended_role
    });
    if (error) {
      setMsg(atiMsg, error.message || 'Invite failed', true);
      return;
    }
    showToast('Invite sent.', { type: 'success' });
    closeAdminTeamInviteModal(true);
    loadAndRenderOrg(publisherId);
  } finally {
    setAdminSubmitBusy(btnAdminTeamInviteSubmit, false);
  }
});

editPublisherForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(epMsg, '', false);
  const publisherId = (epId?.value || '').trim();
  const name = (epName?.value || '').trim();
  const internal_reference = (epInternalRef?.value || '').trim().slice(0, 200);
  if (!publisherId) {
    setMsg(epMsg, 'Missing publisher.', true);
    return;
  }
  if (!name) {
    setMsg(epMsg, 'Publisher name is required.', true);
    return;
  }
  setAdminSubmitBusy(btnEditPublisherSubmit, true, 'Saving…');
  try {
    const { error } = await updatePublisherNameCallable(publisherId, name, internal_reference);
    if (error) {
      setMsg(epMsg, error.message || 'Update failed', true);
      return;
    }
    showToast('Publisher updated.', { type: 'success' });
    if (browsePublisherId === publisherId) {
      browsePublisherName = name;
      if (adminOrgTitle) adminOrgTitle.textContent = name;
    }
    closeEditPublisherModal(true);
  } finally {
    setAdminSubmitBusy(btnEditPublisherSubmit, false);
  }
});

newPublisherForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(cpMsg, '', false);
  const name = (cpName?.value || '').trim();
  const owner_name = (cpOwnerName?.value || '').trim();
  const owner_email = (cpOwnerEmail?.value || '').trim();
  if (!name) {
    setMsg(cpMsg, 'Publisher name is required.', true);
    return;
  }
  if (!owner_name || !owner_email) {
    setMsg(cpMsg, 'Owner name and email are required (invite before first sign-in).', true);
    return;
  }
  showAdminBlockingStatus('Creating organization…');
  setAdminSubmitBusy(btnNewPublisherSubmit, true, 'Creating…');
  try {
    const internal_reference = (cpInternalRef?.value || '').trim().slice(0, 200);
    setAdminSubmitBusyLabel(btnNewPublisherSubmit, 'Sending owner invite…');
    showAdminBlockingStatus('Saving publisher and sending owner invite…');
    const res = await createPublisherFn({
      name,
      owner_name,
      owner_email,
      internal_reference
    });
    const pid = res.data?.publisherId || '';
    closeNewPublisherModal(true);
    showToast(
      pid
        ? `“${name}” is ready. Owner invite sent to ${owner_email}.\nOrganization ID: ${pid}`
        : `Owner invite sent to ${owner_email}.`,
      { type: 'success', duration: 8000 }
    );
    if (pid) {
      setAdminTab('publishers');
      await goToAdminOrg(pid, name);
    }
  } catch (err) {
    setMsg(cpMsg, formatCreatePublisherError(err), true);
  } finally {
    hideAdminBlockingStatus();
    setAdminSubmitBusy(btnNewPublisherSubmit, false);
  }
});

btnBackfill?.addEventListener('click', async () => {
  if (!adminFull) return;
  setMsg(bfMsg, '', false);
  const ok = await studioConfirm({
    title: 'Rebuild RTDB mirror?',
    message: 'Rebuild the entire Realtime Database mirror from Firestore? This clears mirror paths first.',
    confirmText: 'Rebuild mirror',
    cancelText: 'Cancel',
    danger: true
  });
  if (!ok) return;
  showAdminBlockingStatus('Rebuilding mirror…');
  setAdminSubmitBusy(btnBackfill, true, 'Rebuilding…');
  try {
    await backfillMirrorFn();
    setMsg(bfMsg, 'Mirror rebuild completed.', false);
  } catch (e) {
    setMsg(bfMsg, e?.message || e?.details || 'backfillMirror failed', true);
  } finally {
    hideAdminBlockingStatus();
    setAdminSubmitBusy(btnBackfill, false);
  }
});

btnBackfillCoverThumbs?.addEventListener('click', async () => {
  if (!adminFull) return;
  setMsg(thumbBfMsg, '', false);
  showAdminBlockingStatus('Backfilling cover thumbnails…');
  setAdminSubmitBusy(btnBackfillCoverThumbs, true, 'Running…');
  try {
    const res = await backfillCoverThumbsFn({
      editionCursor: coverThumbEditionCursor || undefined,
      seriesCursor: coverThumbSeriesCursor || undefined,
      maxUpdates: 30
    });
    const data = res.data || {};
    coverThumbEditionCursor = data.editionsDone ? '' : data.nextEditionCursor || '';
    coverThumbSeriesCursor = data.seriesDone ? '' : data.nextSeriesCursor || '';
    const errNote =
      Array.isArray(data.errors) && data.errors.length
        ? ` (${data.errors.length} row error(s); see Functions logs.)`
        : '';
    const msg = `Editions +${data.editionsUpdated ?? 0} (scanned ${data.editionsScanned ?? 0}), series +${data.seriesUpdated ?? 0} (scanned ${data.seriesScanned ?? 0}).${
      data.editionsDone && data.seriesDone
        ? ' Catalog pass complete.'
        : ' Click again to continue pagination.'
    }${errNote}`;
    setMsg(thumbBfMsg, msg, false);
  } catch (e) {
    setMsg(thumbBfMsg, e?.message || e?.details || 'backfillCoverThumbs failed', true);
  } finally {
    hideAdminBlockingStatus();
    setAdminSubmitBusy(btnBackfillCoverThumbs, false);
  }
});

btnPi?.addEventListener('click', async () => {
  if (!adminFull || !piMsg) return;
  piMsg.textContent = '';
  piMsg.classList.remove('text-red-400', 'text-emerald-400');
  const invitee_name = (piName?.value || '').trim();
  const email = (piEmail?.value || '').trim();
  const intended_tier = piTier?.value === 'manager' ? 'manager' : 'admin';
  if (!invitee_name || !email) {
    piMsg.textContent = 'Name and email required.';
    piMsg.classList.add('text-red-400');
    return;
  }
  setAdminSubmitBusy(btnPi, true, 'Sending…');
  try {
    await platformCreateInviteFn({ invitee_name, email, intended_tier });
    piMsg.textContent = 'Invite created. They can accept after signing in with that Google account.';
    piMsg.classList.add('text-emerald-400');
    piName.value = '';
    piEmail.value = '';
  } catch (e) {
    piMsg.textContent = e?.message || e?.details || 'Invite failed';
    piMsg.classList.add('text-red-400');
  } finally {
    setAdminSubmitBusy(btnPi, false);
  }
});
