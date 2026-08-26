/**
 * Platform admin: publishers, publications (series), all editions, platform team.
 */
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChange, signInWithGoogle, signOut } from '@/lib/firebase/auth.js';
import { fbAuth, fbFunctions } from '@/lib/firebase/init';
import {
  getCurrentPlatformStaff,
  fetchPublisherOrgSnapshot,
  listAllPublishers,
  subscribePublisherOrgForAdmin,
  subscribePlatformPublishers,
  subscribePlatformEditionCount,
  subscribePlatformStaff,
  subscribePlatformStaffInvites
} from '@/lib/firebase/db-admin.js';
import { fetchPublishedSeriesMap, subscribePublishedCatalog } from '@/lib/firebase/db-public.js';
import { editionPrimaryDateKey, sortEditionsNewestFirstInPlace } from '@/lib/catalog/edition-sort.js';
import { seriesFrequencyLabel } from '@/lib/catalog/frequency-label.js';
import {
  listMyPendingPlatformInvitesCallable,
  acceptPlatformInviteCallable,
  deleteEditionAssetsCallable,
  deleteSeriesCallable,
  deletePublisherCallable,
  updatePublisherNameCallable,
  updateSeries,
  updateEdition,
  listMyPublisherMemberships,
  publisherCreateInvite,
  publisherRevokeInvite,
  publisherRemoveMemberCallable,
  subscribeMyPublisherMemberships
} from '@/lib/firebase/db-publisher.js';
import {
  absoluteUrl,
  buildEditionDeepLink,
  editionPath,
  getSeriesCanonicalIdForPublication,
  publicationPath,
  sanitizeSlug
} from '@/lib/urls';
import { showToast, studioConfirm } from '@/lib/client/dashboard/studio-feedback.js';

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
    return 'A publisher with this identifier already exists.';
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
const publishersMsg = document.getElementById('publishers-msg');
const publishersSearchInput = document.getElementById('publishers-search-input');
const btnExportPublishersCsv = document.getElementById('btn-export-publishers-csv');
const btnBulkPublisherOpen = document.getElementById('btn-bulk-publisher-open');
const bulkPublisherModal = document.getElementById('bulk-publisher-modal');
const bulkPublisherClose = document.getElementById('bulk-publisher-close');
const bulkPublisherCancel = document.getElementById('bulk-publisher-cancel');
const bulkPublisherFile = document.getElementById('bulk-publisher-file');
const bulkPublisherPreviewWrap = document.getElementById('bulk-publisher-preview-wrap');
const bulkPublisherPreviewTbody = document.getElementById('bulk-publisher-preview-tbody');
const bulkPublisherResultsWrap = document.getElementById('bulk-publisher-results-wrap');
const bulkPublisherResults = document.getElementById('bulk-publisher-results');
const bulkPublisherMsg = document.getElementById('bulk-publisher-msg');
const btnBulkPublisherSubmit = document.getElementById('btn-bulk-publisher-submit');
const btnDownloadPublisherTemplate = document.getElementById('btn-download-publisher-template');
const bulkPublisherSetup = document.getElementById('bulk-publisher-setup');
const bulkPublisherDone = document.getElementById('bulk-publisher-done');
const bulkPublisherDoneHeading = document.getElementById('bulk-publisher-done-heading');
const bulkPublisherDoneSummary = document.getElementById('bulk-publisher-done-summary');
const bulkPublisherTitle = document.getElementById('bulk-publisher-title');
const bulkPublisherSubtitle = document.getElementById('bulk-publisher-subtitle');
const bulkPublisherFooterSetup = document.getElementById('bulk-publisher-footer-setup');
const bulkPublisherFooterDone = document.getElementById('bulk-publisher-footer-done');
const btnBulkPublisherAgain = document.getElementById('btn-bulk-publisher-again');
const btnBulkPublisherOk = document.getElementById('btn-bulk-publisher-ok');

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
const btnExportCatalogCsv = document.getElementById('btn-export-catalog-csv');
const catalogSearchInput = document.getElementById('catalog-search-input');
const pubMsg = document.getElementById('pub-msg');

const allPublicationsTbody = document.getElementById('all-publications-tbody');
const publicationsSearchInput = document.getElementById('publications-search-input');
const publicationsMsg = document.getElementById('publications-msg');
const publicationsEditionsMsg = document.getElementById('publications-editions-msg');
const adminPubsStepList = document.getElementById('admin-pubs-step-list');
const adminPubsStepEditions = document.getElementById('admin-pubs-step-editions');
const btnAdminPubsBack = document.getElementById('btn-admin-pubs-back');
const btnExportPublicationsCsv = document.getElementById('btn-export-publications-csv');
const adminPubsEditionsTitle = document.getElementById('admin-pubs-editions-title');
const adminPubsEditionsSub = document.getElementById('admin-pubs-editions-sub');
const pubsSeriesEditionsTbody = document.getElementById('pubs-series-editions-tbody');
const adminPubsFlowPill1 = document.getElementById('admin-pubs-flow-pill-1');
const adminPubsFlowPill2 = document.getElementById('admin-pubs-flow-pill-2');

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

const editSeriesModal = document.getElementById('edit-series-modal');
const editSeriesForm = document.getElementById('edit-series-form');
const editSeriesClose = document.getElementById('edit-series-close');
const editSeriesCancel = document.getElementById('edit-series-cancel');
const esId = document.getElementById('es-id');
const esTitle = document.getElementById('es-title');
const esSlug = document.getElementById('es-slug');
const esSlugGen = document.getElementById('es-slug-gen');
const esSlugDisplay = document.getElementById('es-slug-display');
const esSlugDisplayVal = document.getElementById('es-slug-display-val');
const esSlugCopyBtn = document.getElementById('es-slug-copy-btn');
const esSlugEditBtn = document.getElementById('es-slug-edit-btn');
const esSlugHint = document.getElementById('es-slug-hint');
const esSlugRow = document.getElementById('es-slug-row');
const esSlugUpdateBtn = document.getElementById('es-slug-update-btn');
const esSlugCancelBtn = document.getElementById('es-slug-cancel-btn');
const esFrequency = document.getElementById('es-frequency');
const esDescription = document.getElementById('es-description');
const esMsg = document.getElementById('es-msg');
const btnEditSeriesSubmit = document.getElementById('btn-edit-series-submit');

const editEditionModal = document.getElementById('edit-edition-modal');
const editEditionForm = document.getElementById('edit-edition-form');
const editEditionClose = document.getElementById('edit-edition-close');
const editEditionCancel = document.getElementById('edit-edition-cancel');
const eeId = document.getElementById('ee-id');
const eeTitle = document.getElementById('ee-title');
const eeSlug = document.getElementById('ee-slug');
const eeSlugGen = document.getElementById('ee-slug-gen');
const eeSlugDisplay = document.getElementById('ee-slug-display');
const eeSlugDisplayVal = document.getElementById('ee-slug-display-val');
const eeSlugCopyBtn = document.getElementById('ee-slug-copy-btn');
const eeSlugEditBtn = document.getElementById('ee-slug-edit-btn');
const eeSlugHint = document.getElementById('ee-slug-hint');
const eeSlugRow = document.getElementById('ee-slug-row');
const eeSlugUpdateBtn = document.getElementById('ee-slug-update-btn');
const eeSlugCancelBtn = document.getElementById('ee-slug-cancel-btn');
const eeIssueDate = document.getElementById('ee-issue-date');
const eeIssueDatePreview = document.getElementById('ee-issue-date-preview');
const eeDescription = document.getElementById('ee-description');
const eeMsg = document.getElementById('ee-msg');
const btnEditEditionSubmit = document.getElementById('btn-edit-edition-submit');

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
    btnEditSeriesSubmit?.getAttribute('aria-busy') === 'true' ||
    btnEditEditionSubmit?.getAttribute('aria-busy') === 'true' ||
    btnBulkPublisherSubmit?.getAttribute('aria-busy') === 'true' ||
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
/** Publications tab: list vs editions drill-down */
let pubsBrowseSeriesId = null;
let pubsBrowseSeriesTitle = '';
let publicationsSearchQuery = '';
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
/** Live `public/catalog/series` - preferred over denormalized edition.series_title / publisher_name. */
/** @type {Record<string, { title?: string, publisher_name?: string }>} */
let catalogSeriesMap = {};
/** @type {(() => void) | null} */
let editionCountUnsub = null;
/** @type {(() => void) | null} */
let adminMembershipUnsub = null;
/** @type {(() => void) | null} */
let platformStaffUnsub = null;
/** @type {(() => void) | null} */
let platformStaffInvitesUnsub = null;
/** Debounced RTDB redraws - mirror updates can fire in bursts; avoid nuking the DOM every tick. */
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
/** @type {Array<object>} */
let cachedPublishers = [];
/** @type {Array<{ publisher_name: string, internal_reference: string, owner_name: string, owner_email: string }>} */
let bulkPublisherRows = [];
/** Prevents double-submit while create loop runs or after completion until reset. */
let bulkPublisherRunning = false;
let bulkPublisherCompleted = false;
let catalogSearchQuery = '';
let publishersSearchQuery = '';

const FLOW_ACTIVE =
  'inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-3 py-1.5 border border-primary/25';
const FLOW_DONE =
  'inline-flex items-center gap-1.5 rounded-full bg-primary/5 text-primary/90 px-3 py-1.5 border border-primary/30';
const FLOW_UP =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border border-slate-300 text-slate-500';

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
  resetPubsBrowse();
}

function showDenied() {
  stopPublishersListSubscription();
  stopAdminCatalogRealtime();
  stopAdminMembershipSubscription();
  stopPlatformTeamRealtime();
  activeAdminTab = 'publishers';
  resetAdminBrowse();
  resetPubsBrowse();
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
  el.classList.toggle('text-red-600', !!isError);
  el.classList.toggle('text-emerald-600', !!text && !isError);
}

function readerHrefForEdition(pub) {
  const eid = (pub?.slug && String(pub.slug).trim()) || (pub?.id != null ? String(pub.id).trim() : '');
  if (!eid) return '/';
  const sid =
    (catalogSeriesMap && pub?.series_id && catalogSeriesMap[pub.series_id]?.slug) ||
    (pub?.series_slug && String(pub.series_slug).trim()) ||
    getSeriesCanonicalIdForPublication(pub) ||
    eid;
  return buildEditionDeepLink(eid, sid);
}

function formatIsoForUi(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function toDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function coverHrefForEdition(pub) {
  const raw = pub?.cover_thumb_url || pub?.cover_url || '';
  return safeHttpOrHttpsUrl(raw);
}

/**
 * Only allow http(s) absolute URLs for staff-facing cover links (blocks javascript: etc.).
 * @param {unknown} value
 * @returns {string}
 */
function safeHttpOrHttpsUrl(value) {
  const s = value != null ? String(value).trim() : '';
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

function coverLinkCellHtml(pub) {
  const href = coverHrefForEdition(pub);
  if (!href) return '<span class="text-slate-600 text-xs">-</span>';
  return `<a href="${escapeHtml(href)}" class="text-primary text-xs font-medium hover:underline" target="_blank" rel="noopener noreferrer">Open</a>`;
}

function toCsvCell(v) {
  const s = String(v ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsvFile(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatRosterRoleList(roster, role) {
  const rows = Object.values(roster || {}).filter((r) => r?.role === role);
  if (!rows.length) return '';
  return rows
    .map((r) => {
      const name = String(r.display_name || r.email || r.uid || '').trim();
      const email = String(r.email || '').trim();
      return email ? `${name} (${email})` : name;
    })
    .join(', ');
}

function formatPendingInviteList(invites) {
  const rows = Object.values(invites || {}).filter(
    (i) => i?.status === 'pending' || i?.status == null || i?.status === ''
  );
  if (!rows.length) return '';
  return rows
    .map((i) => {
      const name = String(i.invitee_name || '').trim();
      const email = String(i.email_normalized || '').trim();
      return email ? `${name} (${email})` : name;
    })
    .join(', ');
}

async function exportPublishersCsv() {
  if (!cachedPublishers?.length) {
    setMsg(publishersMsg, 'No publishers to export yet.', true);
    return;
  }
  showAdminBlockingStatus('Preparing publisher export…');
  if (btnExportPublishersCsv) btnExportPublishersCsv.disabled = true;
  try {
    const exportRows = [];
    for (const p of cachedPublishers) {
      const { data, error } = await fetchPublisherOrgSnapshot(p.id);
      if (error || !data) {
        exportRows.push([
          p.id,
          p.name || '',
          p.slug || '',
          p.status || '',
          p.internal_reference || '',
          p.created_at || '',
          '',
          '',
          '',
          '',
          error?.message || 'Could not load org mirror'
        ]);
        continue;
      }
      const publicationCount = Object.keys(data.series || {}).length;
      const editionCount = Object.keys(data.editions || {}).length;
      exportRows.push([
        p.id,
        p.name || '',
        p.slug || '',
        p.status || '',
        p.internal_reference || '',
        p.created_at || '',
        publicationCount,
        editionCount,
        formatRosterRoleList(data.roster, 'owner'),
        formatRosterRoleList(data.roster, 'editor'),
        formatPendingInviteList(data.invites)
      ]);
    }
    const header = [
      'publisher_id',
      'publisher_name',
      'slug',
      'status',
      'internal_reference',
      'created_at',
      'publication_count',
      'edition_count',
      'owners',
      'editors',
      'pending_invites'
    ];
    const csv = `${[header, ...exportRows].map((row) => row.map(toCsvCell).join(',')).join('\n')}\n`;
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`publishers-export-${dateTag}.csv`, csv);
    setMsg(publishersMsg, `Exported ${cachedPublishers.length} publisher(s) to CSV.`, false);
  } finally {
    hideAdminBlockingStatus();
    if (btnExportPublishersCsv) btnExportPublishersCsv.disabled = false;
  }
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(cell);
      cell = '';
      if (row.some((x) => String(x).trim() !== '')) rows.push(row);
      row = [];
      if (c === '\r') i++;
      continue;
    }
    if (c === '\r') {
      row.push(cell);
      cell = '';
      if (row.some((x) => String(x).trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += c;
  }
  row.push(cell);
  if (row.some((x) => String(x).trim() !== '')) rows.push(row);
  return rows;
}

const BULK_PUBLISHER_HEADER_ALIASES = {
  publisher_name: 'publisher_name',
  name: 'publisher_name',
  publisher: 'publisher_name',
  internal_reference: 'internal_reference',
  internal_ref: 'internal_reference',
  owner_name: 'owner_name',
  owner_email: 'owner_email'
};

function normalizeBulkPublisherHeader(header) {
  const key = String(header || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return BULK_PUBLISHER_HEADER_ALIASES[key] || '';
}

function parseBulkPublisherCsv(text) {
  const table = parseCsvText(text);
  if (!table.length) return { rows: [], error: 'CSV file is empty.' };
  const headers = table[0].map(normalizeBulkPublisherHeader);
  if (!headers.includes('publisher_name') || !headers.includes('owner_name') || !headers.includes('owner_email')) {
    return {
      rows: [],
      error: 'CSV must include publisher_name, owner_name, and owner_email columns.'
    };
  }
  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const obj = {
      publisher_name: '',
      internal_reference: '',
      owner_name: '',
      owner_email: ''
    };
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = String(raw[idx] ?? '').trim();
    });
    if (!obj.publisher_name && !obj.owner_name && !obj.owner_email) continue;
    rows.push(obj);
  }
  if (!rows.length) return { rows: [], error: 'No data rows found in CSV.' };
  return { rows, error: null };
}

function renderBulkPublisherPreview() {
  if (!bulkPublisherPreviewTbody || !bulkPublisherPreviewWrap) return;
  bulkPublisherPreviewTbody.innerHTML = '';
  if (!bulkPublisherRows.length) {
    bulkPublisherPreviewWrap.classList.add('hidden');
    if (btnBulkPublisherSubmit) btnBulkPublisherSubmit.disabled = true;
    return;
  }
  bulkPublisherPreviewWrap.classList.remove('hidden');
  bulkPublisherRows.slice(0, 8).forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';
    tr.innerHTML = `
      <td class="px-3 py-2 text-slate-500">${idx + 1}</td>
      <td class="px-3 py-2 text-slate-900">${escapeHtml(row.publisher_name)}</td>
      <td class="px-3 py-2 text-slate-300">${escapeHtml(row.owner_name)}</td>
      <td class="px-3 py-2 text-slate-400 font-mono">${escapeHtml(row.owner_email)}</td>
      <td class="px-3 py-2 text-slate-400">${escapeHtml(row.internal_reference || '-')}</td>`;
    bulkPublisherPreviewTbody.appendChild(tr);
  });
  if (bulkPublisherRows.length > 8) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="px-3 py-2 text-slate-500 italic">…and ${bulkPublisherRows.length - 8} more row(s)</td>`;
    bulkPublisherPreviewTbody.appendChild(tr);
  }
  if (btnBulkPublisherSubmit) btnBulkPublisherSubmit.disabled = false;
}

function clearBulkPublisherResults() {
  bulkPublisherResultsWrap?.classList.add('hidden');
  if (bulkPublisherResults) bulkPublisherResults.innerHTML = '';
}

function showBulkPublisherSetupStep() {
  bulkPublisherCompleted = false;
  bulkPublisherRunning = false;
  bulkPublisherSetup?.classList.remove('hidden');
  bulkPublisherDone?.classList.add('hidden');
  bulkPublisherFooterSetup?.classList.remove('hidden');
  bulkPublisherFooterDone?.classList.add('hidden');
  if (bulkPublisherTitle) bulkPublisherTitle.textContent = 'Bulk create publishers';
  if (bulkPublisherSubtitle) {
    bulkPublisherSubtitle.textContent = 'Upload a CSV with publisher and owner details';
  }
  if (bulkPublisherDoneSummary) bulkPublisherDoneSummary.textContent = '';
}

function showBulkPublisherDoneStep(okCount, failCount) {
  bulkPublisherCompleted = true;
  bulkPublisherSetup?.classList.add('hidden');
  bulkPublisherDone?.classList.remove('hidden');
  bulkPublisherFooterSetup?.classList.add('hidden');
  bulkPublisherFooterDone?.classList.remove('hidden');
  if (bulkPublisherTitle) bulkPublisherTitle.textContent = 'Import finished';
  if (bulkPublisherSubtitle) {
    bulkPublisherSubtitle.textContent = 'Review the results below, then close or import another CSV';
  }
  const allOk = failCount === 0 && okCount > 0;
  const allFail = okCount === 0 && failCount > 0;
  if (bulkPublisherDoneHeading) {
    bulkPublisherDoneHeading.textContent = allFail
      ? 'Import finished with errors'
      : allOk
        ? 'Import complete'
        : 'Import finished';
  }
  if (bulkPublisherDoneSummary) {
    bulkPublisherDoneSummary.textContent = `${okCount} created, ${failCount} failed.`;
  }
  const doneBox = bulkPublisherDone?.querySelector('.rounded-xl');
  if (doneBox) {
    doneBox.className = allFail
      ? 'rounded-xl border border-red-200 bg-red-50 p-5 text-center'
      : allOk
        ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center'
        : 'rounded-xl border border-amber-200 bg-amber-50 p-5 text-center';
    const icon = doneBox.querySelector('.material-icons');
    if (icon) {
      icon.className = allFail
        ? 'material-icons text-red-600 text-4xl'
        : allOk
          ? 'material-icons text-emerald-600 text-4xl'
          : 'material-icons text-amber-600 text-4xl';
      icon.textContent = allFail ? 'error' : allOk ? 'check_circle' : 'warning';
    }
  }
  if (btnBulkPublisherSubmit) {
    btnBulkPublisherSubmit.disabled = true;
  }
}

function resetBulkPublisherModalForm() {
  setMsg(bulkPublisherMsg, '', false);
  clearBulkPublisherResults();
  bulkPublisherRows = [];
  if (bulkPublisherFile) bulkPublisherFile.value = '';
  renderBulkPublisherPreview();
  showBulkPublisherSetupStep();
}

function openBulkPublisherModal() {
  resetBulkPublisherModalForm();
  bulkPublisherModal?.classList.remove('hidden');
  bulkPublisherModal?.classList.add('flex');
}

function closeBulkPublisherModal(force) {
  if (!force && (adminModalSubmitBusy() || bulkPublisherRunning)) return;
  bulkPublisherModal?.classList.add('hidden');
  bulkPublisherModal?.classList.remove('flex');
  setMsg(bulkPublisherMsg, '', false);
  // Next open should start clean (avoids re-showing completed state briefly).
  if (bulkPublisherCompleted) resetBulkPublisherModalForm();
}

function downloadPublisherBulkTemplate() {
  const header = ['publisher_name', 'internal_reference', 'owner_name', 'owner_email'];
  const sample = ['District 3191', '2025 team', 'Jamie Lee', 'jamie@example.com'];
  const csv = `${[header, sample].map((row) => row.map(toCsvCell).join(',')).join('\n')}\n`;
  downloadCsvFile('publisher-bulk-template.csv', csv);
}

async function runBulkPublisherCreate() {
  if (bulkPublisherRunning || bulkPublisherCompleted) return;
  if (!bulkPublisherRows.length) {
    setMsg(bulkPublisherMsg, 'Choose a CSV file first.', true);
    return;
  }
  bulkPublisherRunning = true;
  setMsg(bulkPublisherMsg, '', false);
  clearBulkPublisherResults();
  bulkPublisherResultsWrap?.classList.remove('hidden');
  setAdminSubmitBusy(btnBulkPublisherSubmit, true, 'Creating…');
  let okCount = 0;
  let failCount = 0;
  try {
    for (let i = 0; i < bulkPublisherRows.length; i++) {
      const row = bulkPublisherRows[i];
      const label = row.publisher_name || `Row ${i + 1}`;
      setAdminSubmitBusyLabel(btnBulkPublisherSubmit, `Creating ${i + 1}/${bulkPublisherRows.length}…`);
      showAdminBlockingStatus(`Creating publisher ${i + 1} of ${bulkPublisherRows.length}…`);
      if (!row.publisher_name || !row.owner_name || !row.owner_email) {
        failCount++;
        bulkPublisherResults?.insertAdjacentHTML(
          'beforeend',
          `<li class="text-red-600">Row ${i + 1} (${escapeHtml(label)}): missing required fields.</li>`
        );
        continue;
      }
      try {
        const payload = {
          name: row.publisher_name,
          owner_name: row.owner_name,
          owner_email: row.owner_email,
          internal_reference: row.internal_reference || ''
        };
        const res = await createPublisherFn(payload);
        const pid = res.data?.publisherId || '';
        okCount++;
        bulkPublisherResults?.insertAdjacentHTML(
          'beforeend',
          `<li class="text-emerald-600">Row ${i + 1}: “${escapeHtml(label)}” created${pid ? ` (ID: ${escapeHtml(pid)})` : ''}.</li>`
        );
      } catch (err) {
        failCount++;
        bulkPublisherResults?.insertAdjacentHTML(
          'beforeend',
          `<li class="text-red-600">Row ${i + 1} (${escapeHtml(label)}): ${escapeHtml(formatCreatePublisherError(err))}</li>`
        );
      }
    }
  } finally {
    hideAdminBlockingStatus();
    // Leave Create disabled; completion step replaces the footer.
    setAdminSubmitBusy(btnBulkPublisherSubmit, false);
    if (btnBulkPublisherSubmit) btnBulkPublisherSubmit.disabled = true;
    bulkPublisherRunning = false;
  }
  const summary = `${okCount} created, ${failCount} failed.`;
  setMsg(bulkPublisherMsg, summary, failCount > 0 && okCount === 0);
  showBulkPublisherDoneStep(okCount, failCount);
  if (okCount > 0) {
    showToast(summary, { type: failCount ? 'info' : 'success', duration: 6000 });
  }
}

function exportCatalogCsv() {
  if (!cachedCatalog?.length) {
    setMsg(pubMsg, 'No catalog rows to export yet.', true);
    return;
  }
  const rows = [
    [
      'title',
      'publisher_name',
      'series_title',
      'edition_id',
      'series_id',
      'publisher_id',
      'reader_url',
      'cover_thumb_url',
      'cover_url',
      'pdf_url',
      'featured',
      'issue_date',
      'uploaded_at'
    ],
    ...cachedCatalog.map((pub) => {
      const labels = catalogDisplayLabels(pub);
      return [
      pub.title || '',
      labels.publisherName === '-' ? '' : labels.publisherName,
      labels.seriesTitle === '-' ? '' : labels.seriesTitle,
      pub.id || '',
      pub.series_id || '',
      pub.publisher_id || '',
      readerHrefForEdition(pub),
      pub.cover_thumb_url || '',
      pub.cover_url || '',
      pub.pdf_url || '',
      pub.featured ? 'true' : 'false',
      pub.issue_date || '',
      pub.created_at || ''
    ];
    })
  ];
  const csv = `${rows.map((row) => row.map(toCsvCell).join(',')).join('\n')}\n`;
  const dateTag = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`publications-catalog-${dateTag}.csv`, csv);
  setMsg(pubMsg, `Exported ${cachedCatalog.length} rows to CSV.`, false);
}

function filteredCatalogRows(data) {
  const q = String(catalogSearchQuery || '').trim().toLowerCase();
  if (!q) return data;
  return data.filter((pub) => {
    const labels = catalogDisplayLabels(pub);
    const hay = [
      pub.title,
      labels.publisherName,
      labels.seriesTitle,
      pub.publisher_name,
      pub.series_title,
      pub.id,
      pub.series_id,
      pub.publisher_id
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
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
    b.classList.toggle('text-slate-900', on);
    b.classList.toggle('text-slate-500', !on);
    b.classList.toggle('bg-slate-50/80', on);
  });
}

function setAdminTab(tab) {
  activeAdminTab = tab;
  if (tab !== 'publishers') resetAdminBrowse();
  if (tab !== 'publications') resetPubsBrowse();
  document.querySelectorAll('[data-admin-tab]').forEach((b) => {
    const on = b.getAttribute('data-admin-tab') === tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.classList.toggle('border-primary', on);
    b.classList.toggle('border-transparent', !on);
    b.classList.toggle('text-slate-900', on);
    b.classList.toggle('text-slate-500', !on);
    b.classList.toggle('bg-slate-50/80', on);
  });
  document.getElementById('admin-panel-publishers')?.classList.toggle('hidden', tab !== 'publishers');
  document.getElementById('admin-panel-publications')?.classList.toggle('hidden', tab !== 'publications');
  document.getElementById('admin-panel-editions')?.classList.toggle('hidden', tab !== 'editions');
  document.getElementById('admin-panel-team')?.classList.toggle('hidden', tab !== 'team');
  if (tab === 'publications') {
    renderAllPublicationsTable();
  }
}

function resetPubsBrowse() {
  pubsBrowseSeriesId = null;
  pubsBrowseSeriesTitle = '';
  adminPubsStepList?.classList.remove('hidden');
  adminPubsStepEditions?.classList.add('hidden');
  syncPubsBrowsePanels();
}

function syncPubsBrowsePanels() {
  const onEditions = Boolean(pubsBrowseSeriesId);
  adminPubsStepList?.classList.toggle('hidden', onEditions);
  adminPubsStepEditions?.classList.toggle('hidden', !onEditions);
  if (adminPubsFlowPill1 && adminPubsFlowPill2) {
    adminPubsFlowPill1.className = onEditions ? FLOW_DONE : FLOW_ACTIVE;
    adminPubsFlowPill2.className = onEditions ? FLOW_ACTIVE : FLOW_UP;
  }
}

function publisherLookupById() {
  /** @type {Map<string, { name: string, internal_reference: string }>} */
  const map = new Map();
  for (const p of cachedPublishers || []) {
    if (!p?.id) continue;
    map.set(String(p.id), {
      name: (p.name && String(p.name).trim()) || '',
      internal_reference: (p.internal_reference && String(p.internal_reference).trim()) || ''
    });
  }
  return map;
}

/**
 * @returns {Array<{
 *   id: string,
 *   title: string,
 *   publisherId: string | null,
 *   publisherName: string,
 *   internalReference: string,
 *   frequency: string,
 *   description: string,
 *   editionCount: number,
 *   createdAt: string,
 *   lastUpdatedAt: string,
 *   publicationUrl: string
 * }>}
 */
function buildGlobalPublicationsRows() {
  const publishers = publisherLookupById();
  /** @type {Map<string, ReturnType<typeof Object.assign>>} */
  const map = new Map();

  for (const [sid, s] of Object.entries(catalogSeriesMap || {})) {
    if (!sid) continue;
    const publisherId = s?.publisher_id != null ? String(s.publisher_id) : null;
    const pubMeta = publisherId ? publishers.get(publisherId) : null;
    const createdAt =
      s?.created_at != null
        ? typeof s.created_at === 'number'
          ? new Date(s.created_at).toISOString()
          : String(s.created_at)
        : '';
    map.set(sid, {
      id: sid,
      title: (s?.title && String(s.title).trim()) || sid,
      publisherId,
      publisherName:
        (pubMeta?.name || (s?.publisher_name && String(s.publisher_name).trim()) || '').trim(),
      internalReference: pubMeta?.internal_reference || '',
      frequency: s?.frequency != null ? String(s.frequency).trim() : '',
      description: s?.description != null ? String(s.description).trim() : '',
      editionCount: 0,
      createdAt,
      lastUpdatedAt: createdAt,
      publicationUrl: absoluteUrl(publicationPath(s?.slug || sid))
    });
  }

  for (const ed of cachedCatalog || []) {
    const sid = ed?.series_id != null ? String(ed.series_id).trim() : '';
    if (!sid) continue;
    if (!map.has(sid)) {
      const publisherId = ed.publisher_id != null ? String(ed.publisher_id) : null;
      const pubMeta = publisherId ? publishers.get(publisherId) : null;
      map.set(sid, {
        id: sid,
        title: (ed.series_title && String(ed.series_title).trim()) || sid,
        publisherId,
        publisherName:
          (pubMeta?.name || (ed.publisher_name && String(ed.publisher_name).trim()) || '').trim(),
        internalReference: pubMeta?.internal_reference || '',
        frequency: '',
        description: '',
        editionCount: 0,
        createdAt: '',
        lastUpdatedAt: '',
        publicationUrl: absoluteUrl(publicationPath((catalogSeriesMap && catalogSeriesMap[sid]?.slug) || sid))
      });
    }
    const row = map.get(sid);
    row.editionCount += 1;
    if (!row.publisherName && ed.publisher_name) row.publisherName = String(ed.publisher_name).trim();
    if (!row.publisherId && ed.publisher_id) {
      row.publisherId = String(ed.publisher_id);
      const pubMeta = publishers.get(row.publisherId);
      if (pubMeta) {
        if (!row.publisherName) row.publisherName = pubMeta.name;
        if (!row.internalReference) row.internalReference = pubMeta.internal_reference;
      }
    }
    const activity = editionPrimaryDateKey(ed) || ed.created_at || ed.issue_date || '';
    if (activity && String(activity).localeCompare(String(row.lastUpdatedAt || '')) > 0) {
      row.lastUpdatedAt = String(activity);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' })
  );
}

async function exportPublicationsCsv() {
  if (!(cachedPublishers || []).length) {
    const { data, error } = await listAllPublishers();
    if (!error && data?.length) cachedPublishers = data;
  }
  const rows = buildGlobalPublicationsRows();
  if (!rows.length) {
    setMsg(publicationsMsg, 'No publications to export yet.', true);
    return;
  }
  const header = [
    'publication_id',
    'publication_title',
    'publisher_id',
    'publisher_name',
    'internal_reference',
    'frequency',
    'edition_count',
    'created_at',
    'last_updated_at',
    'publication_url',
    'description'
  ];
  const exportRows = rows.map((r) => [
    r.id,
    r.title || '',
    r.publisherId || '',
    r.publisherName || '',
    r.internalReference || '',
    seriesFrequencyLabel(r.frequency) || r.frequency || '',
    r.editionCount,
    r.createdAt || '',
    r.lastUpdatedAt || '',
    r.publicationUrl || '',
    r.description || ''
  ]);
  const csv = `${[header, ...exportRows].map((row) => row.map(toCsvCell).join(',')).join('\n')}\n`;
  const dateTag = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`publications-export-${dateTag}.csv`, csv);
  setMsg(publicationsMsg, `Exported ${rows.length} publication(s) to CSV.`, false);
  setTimeout(() => setMsg(publicationsMsg, '', false), 4000);
}

function filteredPublicationsRows(rows) {
  const q = String(publicationsSearchQuery || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const freq = seriesFrequencyLabel(r.frequency) || r.frequency || '';
    const hay = [
      r.title,
      r.publisherName,
      r.internalReference,
      r.id,
      r.publisherId,
      freq,
      r.description
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function renderAllPublicationsTable() {
  if (!allPublicationsTbody) return;
  setMsg(publicationsMsg, '', false);
  const rows = filteredPublicationsRows(buildGlobalPublicationsRows());
  allPublicationsTbody.innerHTML = '';
  if (!rows.length) {
    const empty =
      Object.keys(catalogSeriesMap || {}).length === 0 && !(cachedCatalog || []).length
        ? 'No publications in the catalog yet.'
        : 'No publications match your search.';
    allPublicationsTbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-slate-500 text-sm">${escapeHtml(empty)}</td></tr>`;
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors cursor-pointer admin-series-row-global';
    tr.dataset.seriesId = r.id;
    tr.dataset.seriesTitle = r.title;
    const freqLabel = seriesFrequencyLabel(r.frequency) || (r.frequency ? r.frequency : '-');
    tr.innerHTML = `
      <td class="px-4 py-3 text-slate-900 font-medium">${escapeHtml(r.title)}</td>
      <td class="px-4 py-3 text-slate-500">${escapeHtml(r.publisherName || '-')}</td>
      <td class="px-4 py-3 text-slate-500 text-xs">${escapeHtml(freqLabel)}</td>
      <td class="px-4 py-3 text-right text-slate-400 tabular-nums">${r.editionCount}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${escapeHtml(r.id)}</td>
      <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
        <button type="button" class="admin-edit-series-global text-xs font-semibold text-primary hover:underline" data-series-id="${escapeHtml(r.id)}">Edit</button>
        <button type="button" class="admin-open-series-global text-xs font-semibold text-primary hover:underline" data-series-id="${escapeHtml(r.id)}">View editions</button>
        <button type="button" class="admin-del-series-global text-xs text-red-600 hover:underline" data-series-id="${escapeHtml(r.id)}">Delete</button>
      </td>`;
    allPublicationsTbody.appendChild(tr);
  });
}

function renderPubsSeriesEditionsTable() {
  if (!pubsSeriesEditionsTbody || !pubsBrowseSeriesId) return;
  setMsg(publicationsEditionsMsg, '', false);
  const editions = (cachedCatalog || []).filter(
    (e) => e.series_id != null && String(e.series_id) === String(pubsBrowseSeriesId)
  );
  sortEditionsNewestFirstInPlace(editions);
  pubsSeriesEditionsTbody.innerHTML = '';
  if (!editions.length) {
    pubsSeriesEditionsTbody.innerHTML =
      '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500 text-sm">No published editions for this publication.</td></tr>';
    return;
  }
  editions.forEach((ed) => {
    const reader = readerHrefForEdition(ed);
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';
    tr.innerHTML = `
      <td class="px-4 py-3 text-slate-900 font-medium">${escapeHtml(ed.title || ed.id)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${escapeHtml(ed.id)}</td>
      <td class="px-4 py-3">${coverLinkCellHtml(ed)}</td>
      <td class="px-4 py-3"><a href="${escapeHtml(reader)}" class="text-primary text-xs font-medium hover:underline" target="_blank" rel="noopener noreferrer">Open</a></td>
      <td class="px-4 py-3 text-slate-400 text-xs">${escapeHtml(formatIsoForUi(ed.created_at))}</td>
      <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap"><button type="button" class="admin-edit-edition-pubs text-xs font-semibold text-primary hover:underline" data-edition-id="${escapeHtml(ed.id)}">Edit</button><button type="button" class="admin-del-edition-pubs text-xs text-red-600 hover:underline" data-edition-id="${escapeHtml(ed.id)}">Delete</button></td>`;
    pubsSeriesEditionsTbody.appendChild(tr);
  });
}

function goToPubsSeriesEditions(seriesId, seriesTitle) {
  pubsBrowseSeriesId = seriesId;
  pubsBrowseSeriesTitle = seriesTitle || seriesId;
  if (adminPubsEditionsTitle) adminPubsEditionsTitle.textContent = pubsBrowseSeriesTitle;
  if (adminPubsEditionsSub) adminPubsEditionsSub.textContent = seriesId;
  renderPubsSeriesEditionsTable();
  syncPubsBrowsePanels();
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
      <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-slate-300 px-3 py-2">
        <span class="text-sm text-slate-900">${escapeHtml(inv.invitee_name || '')} - <span class="capitalize">${escapeHtml(inv.intended_tier || 'admin')}</span></span>
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
  void refreshCatalogSeriesMap();
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
      if (activeAdminTab === 'publications') {
        renderAllPublicationsTable();
        if (pubsBrowseSeriesId) renderPubsSeriesEditionsTable();
      }
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

async function refreshCatalogSeriesMap() {
  const { data, error } = await fetchPublishedSeriesMap();
  if (!error && data) catalogSeriesMap = data;
  if (adminStatsState.catalog) {
    renderCatalogTables(adminStatsState.catalog, adminStatsState.catalogError);
  }
  if (activeAdminTab === 'publications') {
    renderAllPublicationsTable();
    if (pubsBrowseSeriesId) renderPubsSeriesEditionsTable();
  }
}

/** Prefer live series catalog labels over snapshotted fields on each edition. */
function catalogDisplayLabels(pub) {
  const sid = pub?.series_id != null ? String(pub.series_id).trim() : '';
  const live = sid && catalogSeriesMap[sid] ? catalogSeriesMap[sid] : null;
  return {
    publisherName: (live?.publisher_name || pub?.publisher_name || '').trim() || '-',
    seriesTitle: (live?.title || pub?.series_title || '').trim() || '-'
  };
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

function filteredPublishersRows(data) {
  const q = String(publishersSearchQuery || '').trim().toLowerCase();
  if (!q) return data;
  return data.filter((p) => {
    const hay = [p.name, p.internal_reference, p.id, p.status, p.slug]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function renderPublishersTable(data, error) {
  if (!publishersTbody) return;
  publishersTbody.innerHTML = '';
  if (!error && data) {
    cachedPublishers = data;
  }
  if (error) {
    setMsg(publishersMsg, '', false);
    cachedPublishers = [];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="px-4 py-10 text-center text-slate-500 text-sm">${escapeHtml(error?.message || 'Could not load publishers.')}</td>`;
    publishersTbody.appendChild(tr);
    return;
  }
  const allRows = cachedPublishers;
  if (!allRows.length) {
    setMsg(publishersMsg, '', false);
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="5" class="px-4 py-10 text-center text-slate-500 text-sm">No publishers yet.</td>';
    publishersTbody.appendChild(tr);
    return;
  }
  const rows = filteredPublishersRows(allRows);
  if (!rows.length) {
    setMsg(publishersMsg, '', false);
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="5" class="px-4 py-10 text-center text-slate-500 text-sm">No publishers match your search.</td>';
    publishersTbody.appendChild(tr);
    return;
  }
  setMsg(publishersMsg, '', false);
  rows.forEach((p) => {
    const tr = document.createElement('tr');
    tr.className =
      'hover:bg-slate-50 transition-colors cursor-pointer admin-publisher-row';
    tr.dataset.publisherId = p.id;
    tr.dataset.publisherName = p.name || '';
    tr.dataset.internalReference = (p.internal_reference && String(p.internal_reference).trim()) || '';
    const delBtn = adminFull
      ? `<button type="button" class="admin-del-publisher-row text-xs text-red-600 hover:underline" data-publisher-id="${escapeHtml(p.id)}" data-publisher-name="${escapeHtml(p.name)}">Delete org</button>`
      : '';
    const actionsCell = `<td class="px-4 py-3.5 text-right">
      <span class="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <button type="button" class="admin-edit-publisher-row text-xs font-semibold text-primary hover:underline" data-publisher-id="${escapeHtml(p.id)}" data-publisher-name="${escapeHtml(p.name)}">Edit</button>
        ${delBtn}
      </span>
    </td>`;
    const refCell = tr.dataset.internalReference
      ? `<span class="text-slate-300">${escapeHtml(tr.dataset.internalReference)}</span>`
      : '-';
    tr.innerHTML = `
      <td class="px-4 py-3.5 text-slate-900 font-medium">${escapeHtml(p.name)}</td>
      <td class="px-4 py-3.5 text-sm max-w-[14rem]">${refCell}</td>
      <td class="px-4 py-3.5"><span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}">${escapeHtml(p.status)}</span></td>
      <td class="px-4 py-3.5 text-slate-500 font-mono text-xs select-all">${escapeHtml(p.id)}</td>
      ${actionsCell}`;
    publishersTbody.appendChild(tr);
  });
}

/**
 * Live RTDB org mirror - same listeners as Publisher studio (`subscribePublisherStudio`).
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
    tr.className = 'hover:bg-slate-50 transition-colors cursor-pointer admin-org-series-row';
    const title = s?.title || sid;
    tr.dataset.seriesId = sid;
    tr.dataset.seriesTitle = title;
    tr.innerHTML = `
      <td class="px-4 py-3 text-slate-900 font-medium">${escapeHtml(title)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${escapeHtml(sid)}</td>
      <td class="px-4 py-3 text-right text-slate-400 tabular-nums">${count}</td>
      <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
        <button type="button" class="admin-edit-series-in-org text-xs font-semibold text-primary hover:underline" data-series-id="${escapeHtml(sid)}">Edit</button>
        <button type="button" class="admin-open-series-editions text-xs font-semibold text-primary hover:underline" data-series-id="${escapeHtml(sid)}">View editions</button>
        <button type="button" class="admin-del-series-in-org text-xs text-red-600 hover:underline" data-series-id="${escapeHtml(sid)}">Delete</button>
      </td>`;
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
        tr.className = 'hover:bg-slate-50';
        const isTargetOwner = r.role === 'owner';
        const canRemove = Boolean(r.uid) && (!isTargetOwner || ownerCount > 1);
        const removeCell = canRemove
          ? `<button type="button" class="admin-remove-publisher-member text-xs text-red-600 hover:underline" data-target-uid="${escapeHtml(r.uid)}">Remove</button>`
          : '<span class="text-xs text-slate-600">-</span>';
        tr.innerHTML = `
          <td class="px-4 py-3 text-slate-900">${escapeHtml(r.display_name || r.uid || '-')}</td>
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
        tr.className = 'hover:bg-slate-50';
        tr.innerHTML = `
          <td class="px-4 py-3 text-slate-900">${escapeHtml(i.invitee_name || '-')}</td>
          <td class="px-4 py-3 text-slate-400 text-xs font-mono">${escapeHtml(i.email_normalized || '')}</td>
          <td class="px-4 py-3 text-slate-400 capitalize">${escapeHtml(i.intended_role || 'editor')}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap"><button type="button" class="admin-revoke-publisher-invite text-xs text-red-600 hover:underline" data-invite-id="${escapeHtml(i.id)}">Revoke</button></td>`;
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
      '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500 text-sm">No editions for this series in mirror.</td></tr>';
    return;
  }
  editions.forEach((ed) => {
    const reader = readerHrefForEdition(ed);
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50';
    tr.innerHTML = `
      <td class="px-4 py-3 text-slate-900 font-medium">${escapeHtml(ed.title || ed.id)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${escapeHtml(ed.id)}</td>
      <td class="px-4 py-3">${coverLinkCellHtml(ed)}</td>
      <td class="px-4 py-3"><a href="${escapeHtml(reader)}" class="text-primary text-xs font-medium hover:underline" target="_blank" rel="noopener noreferrer">Open</a></td>
      <td class="px-4 py-3 text-slate-400 text-xs">${escapeHtml(formatIsoForUi(ed.created_at))}</td>
      <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap"><button type="button" class="admin-edit-edition-row text-xs font-semibold text-primary hover:underline" data-edition-id="${escapeHtml(ed.id)}">Edit</button><button type="button" class="admin-del-edition-row text-xs text-red-600 hover:underline" data-edition-id="${escapeHtml(ed.id)}">Delete</button></td>`;
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
    const st =
      openSeries.dataset.seriesTitle ||
      openSeries.closest('tr.admin-org-series-row')?.dataset?.seriesTitle ||
      sid;
    if (sid) goToAdminSeriesEditions(sid, st);
    return;
  }

  const editSeries = e.target.closest('.admin-edit-series-in-org');
  if (editSeries) {
    const sid = editSeries.getAttribute('data-series-id');
    if (!sid || !cachedOrgSnapshot?.series?.[sid]) return;
    openEditSeriesModal(sid, cachedOrgSnapshot.series[sid]);
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
  const editEd = e.target.closest('.admin-edit-edition-row');
  if (editEd) {
    const editionId = editEd.getAttribute('data-edition-id');
    if (!editionId || !cachedOrgSnapshot?.editions?.[editionId]) return;
    openEditEditionModal(editionId, cachedOrgSnapshot.editions[editionId]);
    return;
  }
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
    return;
  }

  const orgSeriesRow = e.target.closest('tr.admin-org-series-row');
  if (orgSeriesRow && !e.target.closest('button, a')) {
    const sid = orgSeriesRow.dataset.seriesId;
    const st = orgSeriesRow.dataset.seriesTitle || sid;
    if (sid) goToAdminSeriesEditions(sid, st);
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

/** Featured switch; styles live in `app/globals.css` (`.admin-featured-switch`). */
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
    const empty = `<tr><td colspan="9" class="px-4 py-10 text-center text-slate-500 text-sm">${escapeHtml(error?.message || 'Could not load catalog.')}</td></tr>`;
    if (allEditionsTbody) allEditionsTbody.innerHTML = empty;
    if (featuredOnlyTbody) featuredOnlyTbody.innerHTML = empty;
    cachedCatalog = [];
    return;
  }
  if (!data?.length) {
    const empty =
      '<tr><td colspan="9" class="px-4 py-10 text-center text-slate-500 text-sm">No catalog editions.</td></tr>';
    if (allEditionsTbody) allEditionsTbody.innerHTML = empty;
    if (featuredOnlyTbody) featuredOnlyTbody.innerHTML = empty;
    cachedCatalog = [];
    return;
  }
  cachedCatalog = data;
  const filtered = filteredCatalogRows(data);
  const sorted = sortEditionsNewestFirstInPlace([...filtered]);
  if (!sorted.length) {
    const empty =
      '<tr><td colspan="9" class="px-4 py-10 text-center text-slate-500 text-sm">No rows match your search.</td></tr>';
    if (allEditionsTbody) allEditionsTbody.innerHTML = empty;
    if (featuredOnlyTbody) featuredOnlyTbody.innerHTML = empty;
    return;
  }
  sorted.forEach((pub) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition-colors';
    const id = pub.id;
    const idAttr = escapeHtml(id);
    const reader = readerHrefForEdition(pub);
    const labels = catalogDisplayLabels(pub);
    tr.innerHTML = `
      <td class="px-4 py-3">
        ${adminFeaturedToggleCellHtml(idAttr, !!pub.featured, 'Feature on Explore home')}
      </td>
      <td class="px-4 py-3 text-slate-900 font-medium">${escapeHtml(pub.title || 'Untitled')}</td>
      <td class="px-4 py-3 text-slate-400">${escapeHtml(labels.publisherName)}</td>
      <td class="px-4 py-3 text-slate-300">${escapeHtml(labels.seriesTitle)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${idAttr}</td>
      <td class="px-4 py-3">${coverLinkCellHtml(pub)}</td>
      <td class="px-4 py-3"><a href="${escapeHtml(reader)}" class="text-primary text-xs font-medium hover:underline" target="_blank" rel="noopener noreferrer">Open</a></td>
      <td class="px-4 py-3 text-slate-400 text-xs">${escapeHtml(formatIsoForUi(pub.created_at))}</td>
      <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap"><button type="button" class="admin-edit-edition-catalog text-xs font-semibold text-primary hover:underline" data-edition-id="${idAttr}">Edit</button><button type="button" class="admin-del-edition-catalog text-xs text-red-600 hover:underline" data-edition-id="${idAttr}">Delete</button></td>`;
    allEditionsTbody?.appendChild(tr);
  });

  const featured = sorted.filter((p) => p.featured);
  if (!featured.length) {
    featuredOnlyTbody?.insertAdjacentHTML(
      'beforeend',
      '<tr><td colspan="9" class="px-4 py-8 text-center text-slate-500 text-sm">No featured editions. Toggle rows in “All editions”.</td></tr>'
    );
  } else {
    featured.forEach((pub) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition-colors';
      const id = pub.id;
      const idAttr = escapeHtml(id);
      const labels = catalogDisplayLabels(pub);
      tr.innerHTML = `
      <td class="px-4 py-3">
        ${adminFeaturedToggleCellHtml(idAttr, true, 'Featured on Explore')}
      </td>
      <td class="px-4 py-3 text-slate-900 font-medium">${escapeHtml(pub.title || 'Untitled')}</td>
      <td class="px-4 py-3 text-slate-400">${escapeHtml(labels.publisherName)}</td>
      <td class="px-4 py-3 text-slate-300">${escapeHtml(labels.seriesTitle)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono text-xs select-all">${idAttr}</td>
      <td class="px-4 py-3">${coverLinkCellHtml(pub)}</td>
      <td class="px-4 py-3"><a href="${escapeHtml(readerHrefForEdition(pub))}" class="text-primary text-xs font-medium hover:underline" target="_blank" rel="noopener noreferrer">Open</a></td>
      <td class="px-4 py-3 text-slate-400 text-xs">${escapeHtml(formatIsoForUi(pub.created_at))}</td>
      <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap"><button type="button" class="admin-edit-edition-catalog text-xs font-semibold text-primary hover:underline" data-edition-id="${idAttr}">Edit</button><button type="button" class="admin-del-edition-catalog text-xs text-red-600 hover:underline" data-edition-id="${idAttr}">Delete</button></td>`;
      featuredOnlyTbody?.appendChild(tr);
    });
  }
}

function bindCatalogEditionActions(tbody) {
  tbody?.addEventListener('click', async (e) => {
    const edit = /** @type {HTMLButtonElement | null} */ (e.target.closest('.admin-edit-edition-catalog'));
    if (edit) {
      const editionId = edit.getAttribute('data-edition-id');
      if (!editionId) return;
      const row = cachedCatalog.find((pub) => String(pub.id) === String(editionId));
      if (!row) {
        setMsg(pubMsg, 'Edition data not available for edit.', true);
        return;
      }
      openEditEditionModal(editionId, row);
      return;
    }
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

bindCatalogEditionActions(allEditionsTbody);
bindCatalogEditionActions(featuredOnlyTbody);

document.getElementById('admin-panel-publications')?.addEventListener('click', async (e) => {
  const openSeries = e.target.closest('.admin-open-series-global');
  if (openSeries) {
    const sid = openSeries.getAttribute('data-series-id');
    const st =
      openSeries.dataset.seriesTitle ||
      openSeries.closest('tr.admin-series-row-global')?.dataset?.seriesTitle ||
      sid;
    if (sid) goToPubsSeriesEditions(sid, st);
    return;
  }

  const editSeries = e.target.closest('.admin-edit-series-global');
  if (editSeries) {
    const sid = editSeries.getAttribute('data-series-id');
    if (!sid) return;
    const row = catalogSeriesMap[sid] || { title: editSeries.closest('tr')?.querySelector('td')?.textContent || sid };
    openEditSeriesModal(sid, row);
    return;
  }

  const delSeries = e.target.closest('.admin-del-series-global');
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
    setAdminSubmitBusy(delSeries, true, 'Deleting…');
    try {
      const { error: delErr } = await deleteSeriesCallable(seriesId);
      if (delErr) {
        setMsg(publicationsMsg, delErr.message || 'Delete failed', true);
        return;
      }
      showToast('Publication deleted.', { type: 'success' });
      if (pubsBrowseSeriesId === seriesId) resetPubsBrowse();
      await refreshCatalogSeriesMap();
      renderAllPublicationsTable();
    } finally {
      hideAdminBlockingStatus();
      setAdminSubmitBusy(delSeries, false);
    }
    return;
  }

  const editEd = e.target.closest('.admin-edit-edition-pubs');
  if (editEd) {
    const editionId = editEd.getAttribute('data-edition-id');
    if (!editionId) return;
    const row = cachedCatalog.find((pub) => String(pub.id) === String(editionId));
    if (!row) {
      setMsg(publicationsEditionsMsg, 'Edition data not available for edit.', true);
      return;
    }
    openEditEditionModal(editionId, row);
    return;
  }

  const delEd = e.target.closest('.admin-del-edition-pubs');
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
    setAdminSubmitBusy(delEd, true, 'Deleting…');
    try {
      const { error: delErr } = await deleteEditionAssetsCallable(editionId);
      if (delErr) {
        setMsg(publicationsEditionsMsg, delErr.message || 'Delete failed', true);
        return;
      }
      showToast('Edition removed.', { type: 'success' });
      renderPubsSeriesEditionsTable();
      renderAllPublicationsTable();
    } finally {
      hideAdminBlockingStatus();
      setAdminSubmitBusy(delEd, false);
    }
    return;
  }

  const seriesRow = e.target.closest('tr.admin-series-row-global');
  if (seriesRow && !e.target.closest('button, a')) {
    const sid = seriesRow.dataset.seriesId;
    const st = seriesRow.dataset.seriesTitle || sid;
    if (sid) goToPubsSeriesEditions(sid, st);
  }
});

btnAdminPubsBack?.addEventListener('click', () => {
  resetPubsBrowse();
  renderAllPublicationsTable();
});

btnExportPublicationsCsv?.addEventListener('click', () => {
  void exportPublicationsCsv();
});

publicationsSearchInput?.addEventListener('input', () => {
  publicationsSearchQuery = publicationsSearchInput.value || '';
  renderAllPublicationsTable();
});

function renderPlatformStaffInvitesTable(result) {
  if (!platformPendingInvitesTbody || !adminFull) return;
  const { data, error } = result || {};
  platformPendingInvitesTbody.innerHTML = '';
  if (error) {
    platformPendingInvitesTbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-600 text-sm">${escapeHtml(error.message || 'Failed to load invites')}</td></tr>`;
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
    tr.className = 'hover:bg-slate-50';
    const iid = escapeHtml(inv.inviteId);
    tr.innerHTML = `
      <td class="px-4 py-3 text-slate-900">${escapeHtml(inv.invitee_name || '-')}</td>
      <td class="px-4 py-3 text-slate-400 text-xs font-mono">${escapeHtml(inv.email_normalized || '')}</td>
      <td class="px-4 py-3 text-slate-400 capitalize">${escapeHtml(inv.intended_tier || 'admin')}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap"><button type="button" class="revoke-platform-pending-invite text-xs text-red-600 hover:underline" data-invite-id="${iid}">Revoke</button></td>`;
    platformPendingInvitesTbody.appendChild(tr);
  });
}

function renderPlatformStaffTable(result) {
  if (!staffTbody) return;
  const { data, error } = result || {};
  staffTbody.innerHTML = '';
  if (error) {
    staffTbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-600 text-sm">${escapeHtml(error.message || 'Failed to load staff')}</td></tr>`;
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
    tr.className = 'hover:bg-slate-50';
    const uid = escapeHtml(s.uid);
    tr.innerHTML = `
        <td class="px-4 py-3 text-slate-400 font-mono text-xs">${uid}</td>
        <td class="px-4 py-3 text-slate-900">${escapeHtml(s.email || '-')}</td>
        <td class="px-4 py-3 text-slate-300">${escapeHtml(s.displayName || '-')}</td>
        <td class="px-4 py-3 text-slate-400 capitalize">${escapeHtml(s.tier || 'admin')}</td>
        <td class="px-4 py-3 text-right">${adminFull ? `<button type="button" class="remove-staff-btn text-xs text-red-600 hover:underline" data-uid="${uid}">Remove</button>` : '<span class="text-slate-600 text-xs">-</span>'}</td>`;
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

function openEditSeriesModal(seriesId, seriesRow) {
  setMsg(esMsg, '', false);
  if (esId) esId.value = seriesId;
  if (esTitle) esTitle.value = seriesRow?.title || '';
  const currentSlug = seriesRow?.slug || '';
  if (esSlug) esSlug.value = currentSlug;
  if (esSlugDisplayVal) esSlugDisplayVal.textContent = currentSlug ? '/' + currentSlug : (seriesId ? '/' + seriesId : '/');
  if (esSlugRow) esSlugRow.classList.add('hidden');
  if (esSlugDisplay) esSlugDisplay.classList.remove('hidden');
  if (esSlugHint) esSlugHint.classList.remove('hidden');
  if (esFrequency) esFrequency.value = seriesRow?.frequency || '';
  if (esDescription) {
    esDescription.value = seriesRow?.description || '';
    esDescription.style.height = 'auto';
    esDescription.style.height = esDescription.scrollHeight + 'px';
  }
  editSeriesModal?.classList.remove('hidden');
  editSeriesModal?.classList.add('flex');
  queueMicrotask(() => esTitle?.focus());
}

/** @param {boolean} [force] */
function closeEditSeriesModal(force) {
  if (!force && adminModalSubmitBusy()) return;
  editSeriesModal?.classList.add('hidden');
  editSeriesModal?.classList.remove('flex');
  setMsg(esMsg, '', false);
}

function openEditEditionModal(editionId, editionRow) {
  setMsg(eeMsg, '', false);
  if (eeId) eeId.value = editionId;
  if (eeTitle) eeTitle.value = editionRow?.title || '';
  const currentSlug = editionRow?.slug || '';
  if (eeSlug) eeSlug.value = currentSlug;
  if (eeSlugDisplayVal) eeSlugDisplayVal.textContent = currentSlug ? '/' + currentSlug : (editionId ? '/' + editionId : '/');
  if (eeSlugRow) eeSlugRow.classList.add('hidden');
  if (eeSlugDisplay) eeSlugDisplay.classList.remove('hidden');
  if (eeSlugHint) eeSlugHint.classList.remove('hidden');
  if (eeIssueDate) {
    eeIssueDate.value = toDateInputValue(editionRow?.issue_date || '');
    updateEeDatePreview();
  }
  if (eeDescription) {
    eeDescription.value = editionRow?.description || '';
    eeDescription.style.height = 'auto';
    eeDescription.style.height = eeDescription.scrollHeight + 'px';
  }
  editEditionModal?.classList.remove('hidden');
  editEditionModal?.classList.add('flex');
  queueMicrotask(() => eeTitle?.focus());
}

/** @param {boolean} [force] */
function closeEditEditionModal(force) {
  if (!force && adminModalSubmitBusy()) return;
  editEditionModal?.classList.add('hidden');
  editEditionModal?.classList.remove('flex');
  setMsg(eeMsg, '', false);
}

btnNewPublisherOpen?.addEventListener('click', () => openNewPublisherModal());
btnExportPublishersCsv?.addEventListener('click', () => {
  void exportPublishersCsv();
});
publishersSearchInput?.addEventListener('input', () => {
  publishersSearchQuery = publishersSearchInput.value || '';
  renderPublishersTable(null, null);
});
btnBulkPublisherOpen?.addEventListener('click', () => openBulkPublisherModal());
bulkPublisherClose?.addEventListener('click', () => closeBulkPublisherModal(true));
bulkPublisherCancel?.addEventListener('click', closeBulkPublisherModal);
bulkPublisherModal?.addEventListener('click', (e) => {
  if (e.target === bulkPublisherModal) closeBulkPublisherModal();
});
btnBulkPublisherOk?.addEventListener('click', () => closeBulkPublisherModal(true));
btnBulkPublisherAgain?.addEventListener('click', () => {
  resetBulkPublisherModalForm();
});
btnDownloadPublisherTemplate?.addEventListener('click', downloadPublisherBulkTemplate);
bulkPublisherFile?.addEventListener('change', async () => {
  if (bulkPublisherRunning || bulkPublisherCompleted) return;
  setMsg(bulkPublisherMsg, '', false);
  clearBulkPublisherResults();
  bulkPublisherRows = [];
  const file = bulkPublisherFile?.files?.[0];
  if (!file) {
    renderBulkPublisherPreview();
    return;
  }
  try {
    const text = await file.text();
    const { rows, error } = parseBulkPublisherCsv(text);
    if (error) {
      setMsg(bulkPublisherMsg, error, true);
      renderBulkPublisherPreview();
      return;
    }
    bulkPublisherRows = rows;
    renderBulkPublisherPreview();
    setMsg(bulkPublisherMsg, `${rows.length} row(s) ready to import.`, false);
  } catch (err) {
    setMsg(bulkPublisherMsg, err?.message || 'Could not read CSV file.', true);
    renderBulkPublisherPreview();
  }
});
btnBulkPublisherSubmit?.addEventListener('click', () => {
  void runBulkPublisherCreate();
});
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

editSeriesClose?.addEventListener('click', closeEditSeriesModal);
editSeriesCancel?.addEventListener('click', closeEditSeriesModal);
editSeriesModal?.addEventListener('click', (e) => {
  if (e.target === editSeriesModal) closeEditSeriesModal();
});

editEditionClose?.addEventListener('click', closeEditEditionModal);
editEditionCancel?.addEventListener('click', closeEditEditionModal);
editEditionModal?.addEventListener('click', (e) => {
  if (e.target === editEditionModal) closeEditEditionModal();
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

editSeriesForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(esMsg, '', false);
  const seriesId = (esId?.value || '').trim();
  const title = (esTitle?.value || '').trim();
  const slug = (esSlug?.value || '').trim();
  const description = (esDescription?.value || '').trim();
  const frequency = (esFrequency?.value || '').trim();
  if (!seriesId) {
    setMsg(esMsg, 'Missing publication.', true);
    return;
  }
  if (!title) {
    setMsg(esMsg, 'Title is required.', true);
    return;
  }
  setAdminSubmitBusy(btnEditSeriesSubmit, true, 'Saving…');
  try {
    const { error } = await updateSeries(seriesId, {
      title,
      description,
      slug: slug || null,
      frequency
    });
    if (error) {
      setMsg(esMsg, error.message || 'Update failed', true);
      return;
    }
    showToast('Publication updated.', { type: 'success' });
    closeEditSeriesModal(true);
    await refreshOpenOrgFromMirror();
    await refreshCatalogSeriesMap();
    if (pubsBrowseSeriesId === seriesId) {
      pubsBrowseSeriesTitle = title;
      if (adminPubsEditionsTitle) adminPubsEditionsTitle.textContent = title;
    }
  } finally {
    setAdminSubmitBusy(btnEditSeriesSubmit, false);
  }
});

editEditionForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMsg(eeMsg, '', false);
  const editionId = (eeId?.value || '').trim();
  const title = (eeTitle?.value || '').trim();
  const slug = (eeSlug?.value || '').trim();
  const description = (eeDescription?.value || '').trim();
  const issueDate = (eeIssueDate?.value || '').trim();
  if (!editionId) {
    setMsg(eeMsg, 'Missing edition.', true);
    return;
  }
  if (!title) {
    setMsg(eeMsg, 'Edition title is required.', true);
    return;
  }
  setAdminSubmitBusy(btnEditEditionSubmit, true, 'Saving…');
  try {
    const { error } = await updateEdition(editionId, {
      title,
      description,
      slug: slug || null,
      issue_date: issueDate || null
    });
    if (error) {
      setMsg(eeMsg, error.message || 'Update failed', true);
      return;
    }
    showToast('Edition updated.', { type: 'success' });
    closeEditEditionModal(true);
    await refreshOpenOrgFromMirror();
    if (pubsBrowseSeriesId) renderPubsSeriesEditionsTable();
    if (activeAdminTab === 'publications') renderAllPublicationsTable();
    if (activeAdminTab === 'editions') renderAllEditionsTable();
  } finally {
    setAdminSubmitBusy(btnEditEditionSubmit, false);
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
        ? `“${name}” is ready.\nOrganization ID: ${pid}`
        : `Publisher created successfully.`,
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

btnExportCatalogCsv?.addEventListener('click', () => {
  exportCatalogCsv();
});

catalogSearchInput?.addEventListener('input', () => {
  catalogSearchQuery = catalogSearchInput.value || '';
  renderCatalogTables(cachedCatalog, null);
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
  piMsg.classList.remove('text-red-600', 'text-emerald-600');
  const invitee_name = (piName?.value || '').trim();
  const email = (piEmail?.value || '').trim();
  const intended_tier = piTier?.value === 'manager' ? 'manager' : 'admin';
  if (!invitee_name || !email) {
    piMsg.textContent = 'Name and email required.';
    piMsg.classList.add('text-red-600');
    return;
  }
  setAdminSubmitBusy(btnPi, true, 'Sending…');
  try {
    await platformCreateInviteFn({ invitee_name, email, intended_tier });
    piMsg.textContent = 'Invite created. They can accept after signing in with that Google account.';
    piMsg.classList.add('text-emerald-600');
    piName.value = '';
    piEmail.value = '';
  } catch (e) {
    piMsg.textContent = e?.message || e?.details || 'Invite failed';
    piMsg.classList.add('text-red-600');
  } finally {
    setAdminSubmitBusy(btnPi, false);
  }
});

function setupInlineSlugEditor({
  editBtn,
  copyBtn,
  displayEl,
  displayValEl,
  hintEl,
  rowEl,
  inputEl,
  genBtn,
  updateBtn,
  cancelBtn,
  titleEl,
  getFullUrl
}) {
  if (!displayEl || !rowEl || !inputEl) return;

  const showEdit = () => {
    displayEl.classList.add('hidden');
    if (hintEl) hintEl.classList.add('hidden');
    rowEl.classList.remove('hidden');
    inputEl.focus();
  };

  const hideEdit = () => {
    rowEl.classList.add('hidden');
    displayEl.classList.remove('hidden');
    if (hintEl) hintEl.classList.remove('hidden');
  };

  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showEdit();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const val = (displayValEl?.textContent || '').trim();
      const cleanSlug = val.replace(/^\//, '').trim();
      const fullUrl = getFullUrl ? getFullUrl(cleanSlug) : `${location.origin}/${cleanSlug}`;
      try {
        await navigator.clipboard.writeText(fullUrl);
        showToast('Public link copied.', { type: 'success' });
      } catch (_) {
        showToast('Could not copy link.', { type: 'error' });
      }
    });
  }

  if (genBtn && titleEl) {
    genBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const titleVal = titleEl.value.trim();
      if (titleVal) {
        inputEl.value = sanitizeSlug(titleVal);
      }
    });
  }

  if (updateBtn) {
    updateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const cleanVal = sanitizeSlug(inputEl.value.trim());
      inputEl.value = cleanVal;
      if (displayValEl) {
        displayValEl.textContent = cleanVal ? '/' + cleanVal : '/';
      }
      hideEdit();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const currentVal = (displayValEl?.textContent || '').replace(/^\//, '').trim();
      inputEl.value = currentVal;
      hideEdit();
    });
  }
}

function attachAutoTextarea(selector) {
  document.querySelectorAll(selector).forEach((el) => {
    const resize = () => {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    };
    el.addEventListener('input', resize);
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) resize();
    });
    observer.observe(el);
  });
}

setupInlineSlugEditor({
  editBtn: esSlugEditBtn,
  copyBtn: esSlugCopyBtn,
  displayEl: esSlugDisplay,
  displayValEl: esSlugDisplayVal,
  hintEl: esSlugHint,
  rowEl: esSlugRow,
  inputEl: esSlug,
  genBtn: esSlugGen,
  updateBtn: esSlugUpdateBtn,
  cancelBtn: esSlugCancelBtn,
  titleEl: esTitle,
  getFullUrl: (slug) => {
    const sid = esId?.value || '';
    return location.origin + publicationPath(slug || sid);
  }
});

setupInlineSlugEditor({
  editBtn: eeSlugEditBtn,
  copyBtn: eeSlugCopyBtn,
  displayEl: eeSlugDisplay,
  displayValEl: eeSlugDisplayVal,
  hintEl: eeSlugHint,
  rowEl: eeSlugRow,
  inputEl: eeSlug,
  genBtn: eeSlugGen,
  updateBtn: eeSlugUpdateBtn,
  cancelBtn: eeSlugCancelBtn,
  titleEl: eeTitle,
  getFullUrl: (slug) => {
    const eid = eeId?.value || '';
    const pub = cachedCatalog.find((p) => String(p.id) === String(eid));
    const sid =
      (catalogSeriesMap && pub?.series_id && catalogSeriesMap[pub.series_id]?.slug) ||
      (pub?.series_slug && String(pub.series_slug).trim()) ||
      getSeriesCanonicalIdForPublication(pub) ||
      eid;
    return location.origin + editionPath(sid, slug || eid);
  }
});

attachAutoTextarea('.studio-auto-textarea');

function attachDatePreview(dateInput, previewEl) {
  if (!dateInput || !previewEl) return () => {};
  const update = () => {
    const val = (dateInput.value || '').trim();
    if (val) {
      const parts = val.split('-');
      if (parts.length === 3) {
        const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
        if (!Number.isNaN(d.getTime())) {
          previewEl.textContent = d.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
          });
          previewEl.classList.remove('hidden');
          return;
        }
      }
    }
    previewEl.textContent = '';
    previewEl.classList.add('hidden');
  };
  dateInput.addEventListener('input', update);
  dateInput.addEventListener('change', update);
  return update;
}

const updateEeDatePreview = attachDatePreview(eeIssueDate, eeIssueDatePreview);
