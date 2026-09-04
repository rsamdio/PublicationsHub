/**
 * Publisher studio (/studio): Google auth, series + editions, PDF/cover upload, reader.
 */
import { onAuthStateChange, signInWithGoogle, signOut } from '@/lib/firebase/auth.js';
import {
  listMyPublisherMemberships,
  fetchPublisher,
  subscribePublisherStudio,
  subscribeMyPublisherMemberships,
  createSeries,
  insertPublishedEdition,
  updateEdition,
  updateSeries,
  publisherCreateInvite,
  publisherRevokeInvite,
  listMyPendingInvitesCallable,
  acceptPublisherInviteCallable,
  publisherRemoveMemberCallable,
  deleteEditionAssetsCallable,
  deleteSeriesCallable
} from '@/lib/firebase/db-publisher.js';
import { sortEditionsNewestFirstInPlace } from '@/lib/catalog/edition-sort.js';
import { SERIES_FREQUENCY_VALUES, seriesFrequencyBadgeAttrs } from '@/lib/catalog/frequency-label.js';
import { uploadEditionPdf, uploadEditionCoverWebp, uploadSeriesCoverFile } from '@/lib/firebase/storage.js';
import { fbAuth } from '@/lib/firebase/init';
import { renderFirstPageWebpFromPdfFile, renderFirstPageWebpFromPdfUrl } from '@/lib/client/pdf-first-page-webp.js';
import {
  openReader,
  closeReader,
  flipPrev,
  flipNext,
  flipFirst,
  flipLast,
  zoomIn,
  zoomOut,
  resetReaderZoom,
  readerToggleFullscreen,
  readerSubmitPageJump,
  setPageJumpOpen,
  tryOpenReaderFromHash,
  warmReaderForEdition,
  preloadReaderAssets
} from '@/lib/client/viewer.js';
import { showToast, studioConfirm } from '@/lib/client/dashboard/studio-feedback.js';
import { sanitizeSlug, isReservedSlug, publicationPath, editionPath } from '@/lib/urls';
import { fetchPublishedSeriesMap } from '@/lib/firebase/db-public.js';

const PUB_STORAGE_KEY = 'pubhub.selectedPublisherId';

/** @param {HTMLButtonElement | null} btn */
function setSubmitBusy(btn, busy, busyText) {
  if (!btn) return;
  if (busy) {
    if (btn.dataset.studioOrigContent == null) btn.dataset.studioOrigContent = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '';
    const wrap = document.createElement('span');
    wrap.className = 'inline-flex items-center justify-center gap-2';
    const spin = document.createElement('span');
    spin.className = 'studio-spinner';
    spin.setAttribute('aria-hidden', 'true');
    const lab = document.createElement('span');
    lab.className = 'studio-busy-label';
    lab.textContent = busyText;
    wrap.appendChild(spin);
    wrap.appendChild(lab);
    btn.appendChild(wrap);
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.studioOrigContent != null) {
      btn.innerHTML = btn.dataset.studioOrigContent;
      delete btn.dataset.studioOrigContent;
    }
  }
}

/** Updates label on a button already in `setSubmitBusy(..., true, ...)` state. */
function setSubmitBusyLabel(btn, text) {
  if (!btn) return;
  btn.querySelector('.studio-busy-label')?.replaceChildren(document.createTextNode(text));
}

const uploadProgressPanel = document.getElementById('upload-progress-panel');
const uploadProgressTitle = document.getElementById('upload-progress-title');
const uploadProgressDetail = document.getElementById('upload-progress-detail');
const studioBlockingStatus = document.getElementById('studio-blocking-status');
const studioBlockingStatusText = document.getElementById('studio-blocking-status-text');

function setUploadProgressVisible(visible, title, detail) {
  if (!uploadProgressPanel) return;
  uploadProgressPanel.classList.toggle('hidden', !visible);
  if (visible) {
    if (title && uploadProgressTitle) uploadProgressTitle.textContent = title;
    if (uploadProgressDetail) uploadProgressDetail.textContent = detail || '';
  }
}

function showStudioBlockingStatus(message) {
  if (studioBlockingStatusText) studioBlockingStatusText.textContent = message;
  studioBlockingStatus?.classList.remove('hidden');
}

function hideStudioBlockingStatus() {
  studioBlockingStatus?.classList.add('hidden');
}

const viewGuest = document.getElementById('view-guest');
const viewNoMembership = document.getElementById('view-no-membership');
const viewStudio = document.getElementById('view-studio');
const headerSignedOut = document.getElementById('header-signed-out');
const headerSignedIn = document.getElementById('header-signed-in');
const guestError = document.getElementById('guest-error');
const btnGoogleSignin = document.getElementById('btn-google-signin');
const btnSignout = document.getElementById('btn-signout');
const btnSignoutNoOrg = document.getElementById('btn-signout-no-org');
const seriesListEl = document.getElementById('series-list');
const newSeriesSlug = document.getElementById('new-series-slug');
const newSeriesSlugGen = document.getElementById('new-series-slug-gen');
const seriesEditSlug = document.getElementById('series-edit-slug');
const seriesEditSlugGen = document.getElementById('series-edit-slug-gen');
const seriesEditSlugDisplay = document.getElementById('series-edit-slug-display');
const seriesEditSlugDisplayVal = document.getElementById('series-edit-slug-display-val');
const seriesEditSlugCopyBtn = document.getElementById('series-edit-slug-copy-btn');
const seriesEditSlugEditBtn = document.getElementById('series-edit-slug-edit-btn');
const seriesEditSlugHint = document.getElementById('series-edit-slug-hint');
const seriesEditSlugRow = document.getElementById('series-edit-slug-row');
const seriesEditSlugUpdateBtn = document.getElementById('series-edit-slug-update-btn');
const seriesEditSlugCancelBtn = document.getElementById('series-edit-slug-cancel-btn');

const uploadSlug = document.getElementById('upload-slug');
const uploadSlugGen = document.getElementById('upload-slug-gen');

const editSlug = document.getElementById('edit-slug');
const editSlugGen = document.getElementById('edit-slug-gen');
const editSlugDisplay = document.getElementById('edit-slug-display');
const editSlugDisplayVal = document.getElementById('edit-slug-display-val');
const editSlugCopyBtn = document.getElementById('edit-slug-copy-btn');
const editSlugEditBtn = document.getElementById('edit-slug-edit-btn');
const editSlugHint = document.getElementById('edit-slug-hint');
const editSlugRow = document.getElementById('edit-slug-row');
const editSlugUpdateBtn = document.getElementById('edit-slug-update-btn');
const editSlugCancelBtn = document.getElementById('edit-slug-cancel-btn');

const btnCopyCurrentSeriesUrl = document.getElementById('btn-copy-current-series-url');
const btnViewCurrentSeriesLive = document.getElementById('btn-view-current-series-live');

const uploadFormBody = document.getElementById('upload-form-body');
const uploadSuccessPanel = document.getElementById('upload-success-panel');
const uploadSuccessCover = document.getElementById('upload-success-cover');
const uploadSuccessTitle = document.getElementById('upload-success-title');
const uploadSuccessDate = document.getElementById('upload-success-date');
const uploadSuccessUrl = document.getElementById('upload-success-url');
const uploadSuccessCopy = document.getElementById('upload-success-copy');
const uploadSuccessAnother = document.getElementById('upload-success-another');
const uploadSuccessViewLive = document.getElementById('upload-success-view-live');
const uploadSuccessDone = document.getElementById('upload-success-done');
const newSeriesTitle = document.getElementById('new-series-title');
const newSeriesDesc = document.getElementById('new-series-desc');
const newSeriesFrequency = document.getElementById('new-series-frequency');
const newSeriesCoverFile = document.getElementById('new-series-cover-file');
const seriesFormError = document.getElementById('series-form-error');
const newPublicationModal = document.getElementById('new-publication-modal');
const newPublicationForm = document.getElementById('new-publication-form');
const btnNewPublicationOpen = document.getElementById('btn-new-publication-open');
const newPublicationClose = document.getElementById('new-publication-close');
const newPublicationCancel = document.getElementById('new-publication-cancel');
const btnNewPublicationSubmit = document.getElementById('btn-new-publication-submit');
const selectSeriesUpload = document.getElementById('select-series-upload');
const editionsGrid = document.getElementById('editions-grid');
const editionCountLabel = document.getElementById('edition-count-label');

const uploadModal = document.getElementById('upload-modal');
const uploadForm = document.getElementById('upload-form');
const uploadTitle = document.getElementById('upload-title');
const uploadDescription = document.getElementById('upload-description');
const uploadFile = document.getElementById('upload-file');
const uploadError = document.getElementById('upload-error');
const uploadSuccess = document.getElementById('upload-success');
const uploadClose = document.getElementById('upload-close');
const uploadCancel = document.getElementById('upload-cancel');
const uploadSubmit = document.getElementById('upload-submit');
const uploadPublicationName = document.getElementById('upload-publication-name');
const uploadPublicationSlug = document.getElementById('upload-publication-slug');

const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const editEditionId = document.getElementById('edit-edition-id');
const editTitle = document.getElementById('edit-title');
const editDescription = document.getElementById('edit-description');
const editRegenerateCover = document.getElementById('edit-regenerate-cover');
const editCoverHint = document.getElementById('edit-cover-hint');
const editError = document.getElementById('edit-error');
const editSuccess = document.getElementById('edit-success');
const editClose = document.getElementById('edit-close');
const editCancel = document.getElementById('edit-cancel');
const editSave = document.getElementById('edit-save');

/** @type {object | null} Edition row from RTDB while edit modal open */
let editingEdition = null;

const readerPrev = document.getElementById('reader-prev');
const readerNext = document.getElementById('reader-next');
const readerFirst = document.getElementById('reader-first');
const readerLast = document.getElementById('reader-last');
const readerZoomIn = document.getElementById('reader-zoom-in');
const readerZoomOut = document.getElementById('reader-zoom-out');
const readerCloseBtn = document.getElementById('reader-close');
const readerFitReset = document.getElementById('reader-fit-reset');
const readerFullscreen = document.getElementById('reader-fullscreen');
const readerPageJumpGo = document.getElementById('reader-page-jump-go');
const readerPageJump = document.getElementById('reader-page-jump');
const uploadIssueDate = document.getElementById('upload-issue-date');
const uploadIssueDatePreview = document.getElementById('upload-issue-date-preview');
const editIssueDate = document.getElementById('edit-issue-date');
const editIssueDatePreview = document.getElementById('edit-issue-date-preview');
const seriesCoverInput = document.getElementById('series-cover-input');

function setUploadModalFieldsDisabled(disabled) {
  [uploadTitle, uploadDescription, uploadIssueDate, uploadFile, uploadCancel, uploadClose].forEach((el) => {
    if (el) el.disabled = disabled;
  });
}
const studioPanelContent = document.getElementById('studio-panel-content');
const studioPanelTeam = document.getElementById('studio-panel-team');
const coverRequiredBanner = document.getElementById('cover-required-banner');
const teamInvitesTbody = document.getElementById('team-invites-tbody');
const teamRosterTbody = document.getElementById('team-roster-tbody');
const teamOwnerUi = document.getElementById('team-owner-ui');
const teamEditorNote = document.getElementById('team-editor-note');
const inviteName = document.getElementById('invite-name');
const inviteEmail = document.getElementById('invite-email');
const inviteFormMsg = document.getElementById('invite-form-msg');
const btnSendInvite = document.getElementById('btn-send-invite');
const studioPendingBanner = document.getElementById('studio-pending-invites-banner');
const studioPendingText = document.getElementById('studio-pending-invites-text');
const studioPendingActions = document.getElementById('studio-pending-invites-actions');
const noOrgInvitesError = document.getElementById('no-org-invites-error');
const studioPublisherNameLabel = document.getElementById('studio-publisher-name-label');
const contentStepPublications = document.getElementById('content-step-publications');
const contentStepEditions = document.getElementById('content-step-editions');
const btnBackPublications = document.getElementById('btn-back-publications');
const btnUploadInFlow = document.getElementById('btn-upload-in-flow');
const editionsSeriesTitle = document.getElementById('editions-series-title');
const editionsSeriesDesc = document.getElementById('editions-series-desc');
const flowStepPill1 = document.getElementById('flow-step-pill-1');
const flowStepPill2 = document.getElementById('flow-step-pill-2');
const seriesSearchInput = document.getElementById('series-search-input');
const editionsSearchInput = document.getElementById('editions-search-input');
let seriesSearchQuery = '';
let editionsSearchQuery = '';
const seriesEditModal = document.getElementById('series-edit-modal');
const seriesEditForm = document.getElementById('series-edit-form');
const seriesEditId = document.getElementById('series-edit-id');
const seriesEditTitle = document.getElementById('series-edit-title');
const seriesEditDesc = document.getElementById('series-edit-desc');
const seriesEditFrequency = document.getElementById('series-edit-frequency');
const seriesEditCoverFile = document.getElementById('series-edit-cover-file');
const seriesEditCoverPreview = document.getElementById('series-edit-cover-preview');
const seriesEditCoverEmpty = document.getElementById('series-edit-cover-empty');
const seriesEditError = document.getElementById('series-edit-error');
const seriesEditClose = document.getElementById('series-edit-close');
const seriesEditCancel = document.getElementById('series-edit-cancel');
const seriesEditSave = document.getElementById('series-edit-save');

/** Cover URL for the series being edited (for preview when no new file selected). */
let seriesEditCurrentCoverUrl = '';
/** Object URL for a newly chosen file in the edit modal; revoked on close / replace. */
let seriesEditCoverPreviewObjectUrl = null;

function revokeSeriesEditPreviewObjectUrl() {
  if (seriesEditCoverPreviewObjectUrl) {
    URL.revokeObjectURL(seriesEditCoverPreviewObjectUrl);
    seriesEditCoverPreviewObjectUrl = null;
  }
}

function refreshSeriesEditCoverPreview() {
  const file = seriesEditCoverFile?.files?.[0];
  revokeSeriesEditPreviewObjectUrl();
  if (file) {
    seriesEditCoverPreviewObjectUrl = URL.createObjectURL(file);
    if (seriesEditCoverPreview) {
      seriesEditCoverPreview.src = seriesEditCoverPreviewObjectUrl;
      seriesEditCoverPreview.classList.remove('hidden');
      seriesEditCoverPreview.onerror = null;
    }
    seriesEditCoverEmpty?.classList.add('hidden');
    return;
  }
  const url = (seriesEditCurrentCoverUrl || '').trim();
  if (url && seriesEditCoverPreview) {
    seriesEditCoverPreview.onerror = () => {
      seriesEditCoverPreview.classList.add('hidden');
      seriesEditCoverPreview.removeAttribute('src');
      seriesEditCoverEmpty?.classList.remove('hidden');
    };
    seriesEditCoverPreview.src = url;
    seriesEditCoverPreview.classList.remove('hidden');
    seriesEditCoverEmpty?.classList.add('hidden');
  } else {
    if (seriesEditCoverPreview) {
      seriesEditCoverPreview.onerror = null;
      seriesEditCoverPreview.removeAttribute('src');
      seriesEditCoverPreview.classList.add('hidden');
    }
    seriesEditCoverEmpty?.classList.remove('hidden');
  }
}

let memberships = [];
let currentPublisherId = null;
let currentPublisherRecord = null;
let currentUserRole = null;
let seriesItems = [];
let latestInvites = [];
let latestRoster = [];
/** @type {string | null} */
let pendingSeriesIdForCover = null;
let activeStudioTab = 'content';
/** Unsubscribe RTDB org/{publisherId}/series + editions (set when studio is active). */
let studioUnsubscribe = null;
/** Unsubscribe RTDB userMemberships/{uid}. */
let membershipUnsubscribe = null;
/** Latest pending publisher invites (callable); used when rendering no-org UI. */
let latestPendingInvites = [];

/** Latest editions list for reader hash deep links in studio overlay. */
let studioEditionsForHash = [];
/** Full editions array from last live subscription emit (for re-renders when navigating steps). */
let studioLiveEditions = [];

/** @type {'publications' | 'editions'} */
let contentFlowStep = 'publications';
/** @type {string | null} */
let selectedContentSeriesId = null;

function stopStudioSubscription() {
  if (studioUnsubscribe) {
    studioUnsubscribe();
    studioUnsubscribe = null;
  }
}

function stopMembershipSubscription() {
  membershipUnsubscribe?.();
  membershipUnsubscribe = null;
}

function startMembershipSubscription(uid) {
  stopMembershipSubscription();
  if (!uid) return;
  membershipUnsubscribe = subscribeMyPublisherMemberships(uid, ({ data, error }) => {
    void applyStudioMembershipSnapshot(data, error);
  });
}

function setNoOrgInvitesLoadError(message) {
  if (!noOrgInvitesError) return;
  const msg = (message || '').trim();
  if (msg) {
    noOrgInvitesError.textContent = msg;
    noOrgInvitesError.classList.remove('hidden');
  } else {
    noOrgInvitesError.textContent = '';
    noOrgInvitesError.classList.add('hidden');
  }
}

function syncStudioPublisherNameLabel() {
  if (!studioPublisherNameLabel) return;
  let name = (currentPublisherRecord?.name || '').trim();
  if (!name && currentPublisherId) name = 'Publisher';
  studioPublisherNameLabel.textContent = name;
  studioPublisherNameLabel.title = name || '';
}

function clearStudioPublisherNameLabel() {
  if (!studioPublisherNameLabel) return;
  studioPublisherNameLabel.textContent = '';
  studioPublisherNameLabel.title = '';
}

function showGuest() {
  stopStudioSubscription();
  stopMembershipSubscription();
  activeStudioTab = 'content';
  studioEditionsForHash = [];
  studioLiveEditions = [];
  resetContentFlow();
  currentPublisherId = null;
  clearStudioPublisherNameLabel();
  setNoOrgInvitesLoadError('');
  viewGuest?.classList.remove('hidden');
  viewNoMembership?.classList.add('hidden');
  viewStudio?.classList.add('hidden');
  headerSignedOut?.classList.remove('hidden');
  headerSignedIn?.classList.add('hidden');
  headerSignedIn?.classList.remove('flex');
}

function showNoMembership() {
  stopStudioSubscription();
  activeStudioTab = 'content';
  studioEditionsForHash = [];
  studioLiveEditions = [];
  resetContentFlow();
  currentPublisherId = null;
  clearStudioPublisherNameLabel();
  viewGuest?.classList.add('hidden');
  viewNoMembership?.classList.remove('hidden');
  viewStudio?.classList.add('hidden');
  headerSignedOut?.classList.add('hidden');
  headerSignedIn?.classList.remove('hidden');
  headerSignedIn?.classList.add('flex');
}

function showStudio() {
  setNoOrgInvitesLoadError('');
  viewGuest?.classList.add('hidden');
  viewNoMembership?.classList.add('hidden');
  viewStudio?.classList.remove('hidden');
  headerSignedOut?.classList.add('hidden');
  headerSignedIn?.classList.remove('hidden');
  headerSignedIn?.classList.add('flex');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function isoToDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

const studioDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const studioUtcDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return studioDateFormatter.format(d);
  } catch (_) {
    return '';
  }
}

function attachDatePreview(dateInput, previewEl) {
  if (!dateInput || !previewEl) return () => {};
  const update = () => {
    const val = (dateInput.value || '').trim();
    if (val) {
      const parts = val.split('-');
      if (parts.length === 3) {
        const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
        if (!Number.isNaN(d.getTime())) {
          previewEl.textContent = studioUtcDateFormatter.format(d);
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

const updateUploadDatePreview = attachDatePreview(uploadIssueDate, uploadIssueDatePreview);
const updateEditDatePreview = attachDatePreview(editIssueDate, editIssueDatePreview);

/** Pre-index edition counts and max activity timestamps per series for O(1) lookups */
function buildSeriesEditionStats(editions) {
  const countMap = new Map();
  const maxActivityMap = new Map();
  if (Array.isArray(editions)) {
    for (let i = 0; i < editions.length; i++) {
      const e = editions[i];
      const sid = e.series_id;
      if (!sid) continue;
      countMap.set(sid, (countMap.get(sid) || 0) + 1);
      let max = maxActivityMap.get(sid) || '';
      const c = e.created_at ? String(e.created_at).trim() : '';
      if (c && c.localeCompare(max) > 0) max = c;
      const d = e.issue_date ? String(e.issue_date).trim() : '';
      if (d && d.localeCompare(max) > 0) max = d;
      maxActivityMap.set(sid, max);
    }
  }
  return { countMap, maxActivityMap };
}

function studioSeriesEditionCount(seriesId, editionsOrStats) {
  if (editionsOrStats && editionsOrStats.countMap) {
    return editionsOrStats.countMap.get(seriesId) || 0;
  }
  return (editionsOrStats || []).filter((e) => e.series_id === seriesId).length;
}

/** Max activity timestamp for a series (series row + editions), for "Updated" line. */
function studioSeriesLastActivityIso(seriesId, editionsOrStats, s) {
  let max = '';
  if (editionsOrStats && editionsOrStats.maxActivityMap) {
    max = editionsOrStats.maxActivityMap.get(seriesId) || '';
  } else if (Array.isArray(editionsOrStats)) {
    const bump = (t) => {
      const v = t != null && String(t).trim() ? String(t).trim() : '';
      if (v && v.localeCompare(max) > 0) max = v;
    };
    for (const e of editionsOrStats) {
      if (e.series_id !== seriesId) continue;
      bump(e.created_at);
      bump(e.issue_date);
    }
  }
  const sc = s?.created_at ? String(s.created_at).trim() : '';
  if (sc && sc.localeCompare(max) > 0) max = sc;
  return max;
}

function syncCurrentUserRole() {
  const m = memberships.find((x) => x.publisherId === currentPublisherId);
  currentUserRole = m?.role || null;
}

function getTargetSeriesIdForCoverCheck() {
  if (contentFlowStep === 'editions' && selectedContentSeriesId) return selectedContentSeriesId;
  return selectSeriesUpload?.value || null;
}

function selectedSeriesHasCover() {
  const sid = getTargetSeriesIdForCoverCheck();
  if (!sid) return false;
  const s = seriesItems.find((x) => x.id === sid);
  return !!(s?.cover_url && String(s.cover_url).trim());
}

function updateCoverRequiredBanner() {
  if (!coverRequiredBanner) return;
  if (contentFlowStep !== 'editions' || !selectedContentSeriesId) {
    coverRequiredBanner.classList.add('hidden');
    return;
  }
  coverRequiredBanner.classList.toggle('hidden', selectedSeriesHasCover());
}

function syncContentFlowPanels() {
  const onPub = contentFlowStep === 'publications';
  contentStepPublications?.classList.toggle('hidden', !onPub);
  contentStepEditions?.classList.toggle('hidden', onPub);
  if (flowStepPill1 && flowStepPill2) {
    if (onPub) {
      flowStepPill1.className =
        'inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-3 py-1.5 border border-primary/25';
      flowStepPill2.className =
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500';
    } else {
      flowStepPill1.className =
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500';
      flowStepPill2.className =
        'inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-3 py-1.5 border border-primary/25';
    }
  }
}

function resetContentFlow() {
  contentFlowStep = 'publications';
  selectedContentSeriesId = null;
  syncContentFlowPanels();
}

function goToPublicationsList() {
  contentFlowStep = 'publications';
  selectedContentSeriesId = null;
  editionsSearchQuery = '';
  if (editionsSearchInput) editionsSearchInput.value = '';
  syncContentFlowPanels();
  if (currentPublisherId) {
    scheduleStudioRender(
      currentPublisherId,
      seriesItems,
      studioLiveEditions,
      latestInvites,
      latestRoster
    );
  }
}

function goToEditionsStep(seriesId) {
  if (!seriesId || !seriesItems.some((s) => s.id === seriesId)) return;
  contentFlowStep = 'editions';
  selectedContentSeriesId = seriesId;
  editionsSearchQuery = '';
  if (editionsSearchInput) editionsSearchInput.value = '';
  if (selectSeriesUpload) selectSeriesUpload.value = seriesId;
  syncContentFlowPanels();
  scheduleStudioRender(
    currentPublisherId,
    seriesItems,
    studioLiveEditions,
    latestInvites,
    latestRoster
  );
}

/** Ensure signed-in member appears even if RTDB roster mirror lags or missed owner row. */
function getRosterRowsForDisplay() {
  const rows = [...(latestRoster || [])];
  const auth = fbAuth();
  const u = auth.currentUser;
  if (u && currentPublisherId) {
    const uid = u.uid;
    if (!rows.some((r) => r.uid === uid)) {
      const m = memberships.find((x) => x.publisherId === currentPublisherId);
      if (m) {
        rows.push({
          uid,
          email: (u.email || '').toLowerCase(),
          display_name: u.displayName || u.email || 'You',
          role: m.role || 'editor'
        });
      }
    }
  }
  return rows;
}

function setStudioTab(tab) {
  activeStudioTab = tab;
  studioPanelContent?.classList.toggle('hidden', tab !== 'content');
  studioPanelTeam?.classList.toggle('hidden', tab !== 'team');
  document.querySelectorAll('[data-studio-tab]').forEach((b) => {
    const on = b.getAttribute('data-studio-tab') === tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.classList.toggle('border-primary', on);
    b.classList.toggle('border-transparent', !on);
    b.classList.toggle('text-slate-900', on);
    b.classList.toggle('dark:text-white', on);
    b.classList.toggle('bg-slate-50/80', on);
    b.classList.toggle('dark:bg-surface-dark/40', on);
    b.classList.toggle('text-slate-500', !on);
    b.classList.toggle('dark:text-slate-400', !on);
  });
}

function renderTeamTab() {
  const isOwner = currentUserRole === 'owner';
  teamOwnerUi?.classList.toggle('hidden', !isOwner);
  teamEditorNote?.classList.toggle('hidden', isOwner);

  if (teamInvitesTbody) {
    teamInvitesTbody.innerHTML = '';
    const pending = latestInvites.filter((i) => i.status === 'pending' || !i.status);
    if (!pending.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" class="px-4 py-6 text-center text-slate-500 text-sm">No pending invites</td>`;
      teamInvitesTbody.appendChild(tr);
    } else {
      pending.forEach((inv) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 dark:hover:bg-surface-dark-hover/40';
        const emailCell = escapeHtml(inv.email_normalized || '-');
        tr.innerHTML = `
          <td class="px-4 py-2.5 text-slate-900 dark:text-white">${escapeHtml(inv.invitee_name || '')}</td>
          <td class="px-4 py-2.5 text-slate-500 font-mono text-xs">${emailCell}</td>
          <td class="px-4 py-2.5 text-right">${isOwner ? `<button type="button" class="revoke-invite-btn text-xs font-semibold text-red-500 hover:underline" data-invite-id="${escapeHtml(inv.id)}">Revoke</button>` : '-'}</td>`;
        teamInvitesTbody.appendChild(tr);
      });
    }
  }

  if (teamRosterTbody) {
    teamRosterTbody.innerHTML = '';
    const rows = getRosterRowsForDisplay().sort((a, b) =>
      String(a.display_name || a.email || '').localeCompare(String(b.display_name || b.email || ''))
    );
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4" class="px-4 py-6 text-center text-slate-500 text-sm">No members yet</td>`;
      teamRosterTbody.appendChild(tr);
    } else {
        const myUid = fbAuth().currentUser?.uid;
        const ownerCount = rows.filter((r) => r.role === 'owner').length;
        rows.forEach((r) => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-50 dark:hover:bg-surface-dark-hover/40';
          const isSelf = r.uid === myUid;
          const isTargetOwner = r.role === 'owner';
          const showRemove = isOwner && !isSelf && (!isTargetOwner || ownerCount > 1);
          const removeCell = showRemove
            ? `<button type="button" class="remove-member-btn text-xs font-semibold text-red-500 hover:underline" data-target-uid="${escapeHtml(r.uid)}">Remove</button>`
            : isSelf
              ? '<span class="text-xs text-slate-500">You</span>'
              : '-';
        tr.innerHTML = `
          <td class="px-4 py-2.5 text-slate-900 dark:text-white">${escapeHtml(r.display_name || '-')}</td>
          <td class="px-4 py-2.5 text-slate-500 text-xs">${escapeHtml(r.email || '')}</td>
          <td class="px-4 py-2.5"><span class="text-xs font-medium capitalize">${escapeHtml(r.role || '')}</span></td>
          <td class="px-4 py-2.5 text-right">${removeCell}</td>`;
        teamRosterTbody.appendChild(tr);
      });
    }
  }
}

async function refreshStudioExternalInvitesBanner() {
  if (!studioPendingBanner || !studioPendingText || !studioPendingActions) return;
  const { data: invites, error } = await listMyPendingInvitesCallable();
  if (error || !invites?.length) {
    studioPendingBanner.classList.add('hidden');
    return;
  }
  const myPubIds = new Set(memberships.map((m) => m.publisherId));
  const external = invites.filter((i) => !myPubIds.has(i.publisherId));
  if (!external.length) {
    studioPendingBanner.classList.add('hidden');
    return;
  }
  studioPendingBanner.classList.remove('hidden');
  studioPendingText.textContent =
    external.length === 1
      ? `You have a pending invitation to ${external[0].publisherName || 'a publisher'} (${external[0].intended_role === 'owner' ? 'owner' : 'editor'}). Accepting may require leaving your current organization first.`
      : `You have ${external.length} pending publisher invitations. Each must match your Google sign-in email.`;
  studioPendingActions.innerHTML = '';
  external.forEach((inv) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'accept-invite-btn px-3 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-semibold';
    btn.textContent = `Accept - ${inv.publisherName || inv.publisherId}`;
    btn.dataset.publisherId = inv.publisherId;
    btn.dataset.inviteId = inv.inviteId;
    studioPendingActions.appendChild(btn);
  });
}

function renderNoOrgPendingInvites(invites) {
  const wrap = document.getElementById('no-org-invites');
  const list = document.getElementById('no-org-invites-list');
  if (!wrap || !list) return;
  list.innerHTML = '';
  if (!invites?.length) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  invites.forEach((inv) => {
    const li = document.createElement('li');
    li.className =
      'flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/60 dark:bg-card-dark/40 px-3 py-2 border border-slate-200 dark:border-slate-700';
    li.innerHTML = `
      <span class="text-slate-800 dark:text-slate-200 text-left">${escapeHtml(inv.publisherName || inv.publisherId)} - <span class="capitalize">${escapeHtml(inv.intended_role === 'owner' ? 'Owner' : 'Editor')}</span></span>
      <button type="button" class="accept-invite-btn shrink-0 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold" data-publisher-id="${escapeHtml(inv.publisherId)}" data-invite-id="${escapeHtml(inv.inviteId)}">Accept</button>`;
    list.appendChild(li);
  });
}

/**
 * @param {string} publisherId
 * @param {string} inviteId
 * @param {HTMLButtonElement | null} [triggerBtn]
 */
async function onAcceptInvite(publisherId, inviteId, triggerBtn) {
  showStudioBlockingStatus('Joining publisher…');
  setSubmitBusy(triggerBtn, true, 'Joining…');
  try {
    const { error } = await acceptPublisherInviteCallable({ publisherId, inviteId });
    if (error) {
      showToast(error.message || 'Could not accept invite', { type: 'error' });
      return;
    }
    const user = fbAuth().currentUser;
    if (user) await refreshMembershipsAndUi(user);
  } finally {
    hideStudioBlockingStatus();
    setSubmitBusy(triggerBtn, false, '');
  }
}

function studioEditionToReaderPub(ed) {
  const ser = seriesItems.find((s) => s.id === ed.series_id);
  return {
    id: ed.id,
    slug: ed.slug || null,
    series_id: ed.series_id || null,
    series_slug: ser?.slug || ed.series_slug || null,
    _seriesSlug: ser?.slug || ed.series_slug || null,
    _seriesCanonicalId: ed.series_id || null,
    title: ed.title,
    description: ed.description,
    pdf_url: ed.pdf_url,
    cover_url: ed.cover_url,
    cover_thumb_url: ed.cover_thumb_url,
    created_at: ed.created_at,
    issue_date: ed.issue_date,
    series_title: ed.series_title ?? ser?.title ?? null
  };
}

function resolveStudioEditionForHash(ref) {
  const ed = studioEditionsForHash.find(
    (e) => e.id === ref || (e.slug && String(e.slug) === ref)
  );
  return ed ? studioEditionToReaderPub(ed) : null;
}

let pendingStudioRender = null;

/**
 * Coalesce multiple synchronous or microtask live updates into a single render pass.
 */
function scheduleStudioRender(publisherId, series, editions, invites, roster) {
  pendingStudioRender = { publisherId, series, editions, invites, roster };
  queueMicrotask(() => {
    if (!pendingStudioRender) return;
    const { publisherId: pid, series: s, editions: e, invites: inv, roster: ros } = pendingStudioRender;
    pendingStudioRender = null;
    renderStudioFromLiveData(pid, s, e, inv, ros);
  });
}

function renderSeriesListSection() {
  if (!seriesListEl) return;
  if (!seriesListEl.dataset.delegationBound) {
    seriesListEl.dataset.delegationBound = '1';
    seriesListEl.addEventListener('click', onSeriesListClick);
  }

  const query = (seriesSearchQuery || '').trim().toLowerCase();
  const list = query
    ? seriesItems.filter(
        (s) =>
          (s.title || '').toLowerCase().includes(query) ||
          (s.description || '').toLowerCase().includes(query) ||
          (s.slug || '').toLowerCase().includes(query)
      )
    : seriesItems;

  seriesListEl.innerHTML = '';
  if (!seriesItems.length) {
    seriesListEl.innerHTML =
      '<p class="text-sm text-slate-500 dark:text-slate-400 py-8 px-4 rounded-xl bg-slate-100 dark:bg-[#15202B]/80 border border-dashed border-slate-200 dark:border-slate-700 text-center col-span-full">No publications yet - create one below.</p>';
    return;
  }

  if (!list.length) {
    seriesListEl.innerHTML =
      '<p class="text-sm text-slate-500 dark:text-slate-400 py-8 px-4 rounded-xl bg-slate-100 dark:bg-[#15202B]/80 border border-dashed border-slate-200 dark:border-slate-700 text-center col-span-full">No publications match your search query.</p>';
    return;
  }

  const stats = buildSeriesEditionStats(studioLiveEditions);
  list.forEach((s) => {
    const card = document.createElement('article');
    card.setAttribute('role', 'listitem');
    card.setAttribute('data-series-id', s.id);
    card.className =
      'edition-card group flex flex-col bg-white dark:bg-[#182430] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors hover:border-primary/50 cursor-pointer';
    const ec = studioSeriesEditionCount(s.id, stats);
    const updatedIso = studioSeriesLastActivityIso(s.id, stats, s);
    const coverUrl = s.cover_url || '';
    const coverInner = coverUrl
      ? `<img alt="" class="book-cover w-full h-full object-cover" src="${escapeHtml(coverUrl)}"/>`
      : `<div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-500 font-display font-bold">PDF</div>`;
    const freqBadge = seriesFrequencyBadgeAttrs(s.frequency, { compact: true });
    card.innerHTML = `
      <div class="relative aspect-[3/4] bg-gray-200 dark:bg-gray-800 overflow-hidden">
        ${coverInner}
        <div class="absolute top-3 right-3">
          <span class="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-bold rounded">${ec} edition${ec === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="p-5 flex-1 flex flex-col">
        <div class="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span class="material-icons text-xs mr-1" style="font-size:14px">schedule</span>
          ${escapeHtml(updatedIso ? `Updated ${formatDate(updatedIso)}` : 'Publication')}
        </div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-1.5 group-hover:text-primary transition-colors line-clamp-2">${escapeHtml(s.title)}</h3>
        <span class="${freqBadge.className}">${escapeHtml(freqBadge.text)}</span>
        <div class="flex-1"></div>
        <div class="flex items-center gap-3 mt-auto">
          <button type="button" class="series-btn-open flex-1 bg-primary/10 hover:bg-primary text-primary hover:text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2" data-series-id="${escapeHtml(s.id)}">
            <span class="material-icons text-base">library_books</span>
            Open publication
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <button type="button" class="series-btn-copy text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-primary/10 hover:text-primary transition-colors inline-flex items-center gap-1" data-series-id="${escapeHtml(s.id)}" title="Copy link" aria-label="Copy link">
            <span class="material-icons text-[14px]">link</span>Copy link
          </button>
          <button type="button" class="series-btn-cover text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20" data-series-id="${escapeHtml(s.id)}">Cover</button>
          <button type="button" class="series-btn-edit text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100" data-series-id="${escapeHtml(s.id)}">Edit</button>
          <button type="button" class="series-btn-del text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10" data-series-id="${escapeHtml(s.id)}">Delete</button>
        </div>
      </div>`;
    seriesListEl.appendChild(card);
  });
}

function setupEditionsGridDelegation() {
  if (!editionsGrid || editionsGrid.dataset.delegationBound) return;
  editionsGrid.dataset.delegationBound = '1';

  editionsGrid.addEventListener('click', onEditionsGridClick);

  let lastWarmedPdfUrl = null;
  editionsGrid.addEventListener('pointerover', (e) => {
    const card = e.target.closest('[data-edition-id]');
    if (!card) return;
    const edId = card.getAttribute('data-edition-id');
    const ed = studioLiveEditions.find((x) => x.id === edId);
    if (ed?.pdf_url && ed.pdf_url !== lastWarmedPdfUrl) {
      lastWarmedPdfUrl = ed.pdf_url;
      warmReaderForEdition(ed.pdf_url);
    }
  }, { passive: true });
}

async function onEditionsGridClick(e) {
  const trigger = e.target.closest('[data-action]');
  if (!trigger || trigger.disabled || trigger.hasAttribute('disabled')) return;
  const action = trigger.getAttribute('data-action');
  const edId = trigger.getAttribute('data-edition-id');
  if (!action || !edId) return;

  const ed = studioLiveEditions.find((x) => x.id === edId);
  if (!ed) return;

  if (action === 'read') {
    openReader(studioEditionToReaderPub(ed));
    return;
  }

  if (action === 'copy') {
    const ser = seriesItems.find((s) => s.id === ed.series_id || s.id === selectedContentSeriesId);
    const edUrl = location.origin + editionPath(ser?.slug || ed.series_id || selectedContentSeriesId, ed.slug || ed.id);
    try {
      await navigator.clipboard.writeText(edUrl);
      showToast('Edition link copied.', { type: 'success' });
    } catch (_) {
      showToast('Could not copy link.', { type: 'error' });
    }
    return;
  }

  if (action === 'edit') {
    openEditEditionModal(ed);
    return;
  }

  if (action === 'delete') {
    trigger.setAttribute('disabled', 'true');
    try {
      const ok = await studioConfirm({
        title: 'Delete edition?',
        message: `Delete "${ed.title || 'this edition'}" and its files in the data repo? This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
      });
      if (!ok) return;
      showStudioBlockingStatus('Deleting edition...');
      const { error } = await deleteEditionAssetsCallable(ed.id);
      if (error) {
        showToast(error.message || 'Delete failed', { type: 'error' });
        return;
      }
      showToast('Edition removed.', { type: 'success' });
      studioLiveEditions = studioLiveEditions.filter((x) => x.id !== ed.id);
      renderEditionsGridSection();
    } finally {
      hideStudioBlockingStatus();
      trigger.removeAttribute('disabled');
    }
  }
}

function renderEditionsGridSection() {
  if (!editionsGrid) return;
  setupEditionsGridDelegation();

  const editionsForSeries =
    selectedContentSeriesId
      ? sortEditionsNewestFirstInPlace(
          studioLiveEditions.filter((ed) => ed.series_id === selectedContentSeriesId).slice()
        )
      : [];

  const totalVol = editionsForSeries.length;

  if (selectedContentSeriesId) {
    const ser = seriesItems.find((s) => s.id === selectedContentSeriesId);
    if (editionsSeriesTitle) editionsSeriesTitle.textContent = ser?.title || 'Publication';
    if (editionsSeriesDesc) {
      editionsSeriesDesc.textContent = (ser?.description && String(ser.description).trim()) || '';
      editionsSeriesDesc.classList.toggle('hidden', !editionsSeriesDesc.textContent);
    }
    if (btnViewCurrentSeriesLive) {
      btnViewCurrentSeriesLive.href = publicationPath(ser?.slug || selectedContentSeriesId);
      btnViewCurrentSeriesLive.classList.remove('hidden');
    }
  }

  const query = (editionsSearchQuery || '').trim().toLowerCase();
  const list = query
    ? editionsForSeries.filter((ed) => {
        const titleMatch = (ed.title || '').toLowerCase().includes(query);
        const slugMatch = (ed.slug || '').toLowerCase().includes(query);
        const dateMatch = formatDate(ed.issue_date || ed.created_at).toLowerCase().includes(query);
        return titleMatch || slugMatch || dateMatch;
      })
    : editionsForSeries;

  if (editionCountLabel) {
    editionCountLabel.textContent = `${list.length} edition${list.length === 1 ? '' : 's'}`;
  }

  editionsGrid.innerHTML = '';

  if (totalVol === 0) {
    const empty = document.createElement('div');
    empty.className = 'col-span-full flex flex-col items-center justify-center text-center py-14 px-4';
    const emptyIcon = document.createElement('span');
    emptyIcon.className = 'material-icons text-4xl text-slate-300 dark:text-slate-600 mb-3';
    emptyIcon.textContent = 'menu_book';
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'text-sm text-slate-500 dark:text-slate-400 mb-4';
    emptyMsg.textContent = 'No editions in this publication yet.';
    const emptyCta = document.createElement('button');
    emptyCta.type = 'button';
    emptyCta.className =
      'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-medium transition-colors';
    emptyCta.innerHTML = '<span class="material-icons text-base">upload_file</span>Upload first edition';
    emptyCta.addEventListener('click', () => openUploadModal());
    empty.append(emptyIcon, emptyMsg, emptyCta);
    editionsGrid.appendChild(empty);
    return;
  }

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'col-span-full flex flex-col items-center justify-center text-center py-14 px-4';
    empty.innerHTML = `
      <span class="material-icons text-4xl text-slate-300 dark:text-slate-600 mb-3">search_off</span>
      <p class="text-sm text-slate-500 dark:text-slate-400">No editions match your search query.</p>`;
    editionsGrid.appendChild(empty);
    return;
  }

  list.forEach((ed) => {
    const origIdx = editionsForSeries.findIndex((item) => item.id === ed.id);
    const vol = origIdx >= 0 ? totalVol - origIdx : 1;
    const card = document.createElement('article');
    card.className =
      'group relative flex flex-col edition-card rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#182430] p-3 sm:p-4 shadow-sm hover:shadow-md dark:shadow-none dark:hover:border-primary/45 hover:border-primary/30 transition-all';
    card.setAttribute('data-edition-id', ed.id);

    const coverUrl = ed.cover_url || '';
    const volBadge = `<div class="absolute bottom-2 left-2 z-[5] pointer-events-none"><span class="px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold rounded">VOL ${vol}</span></div>`;
    const coverInner = coverUrl
      ? `<div class="relative w-full aspect-[3/4] rounded-lg overflow-hidden book-cover ring-1 ring-inset ring-slate-200 dark:ring-slate-700 cursor-pointer edition-cover-trigger" data-action="read" data-edition-id="${escapeHtml(ed.id)}"><div class="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.02]" style="background-image:url('${escapeHtml(coverUrl)}')"></div>${volBadge}<div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"><span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-slate-900 text-xs font-semibold shadow-md"><span class="material-icons text-sm text-primary">menu_book</span>Read</span></div></div>`
      : `<div class="relative w-full aspect-[3/4] rounded-lg flex items-center justify-center bg-gradient-to-br from-primary/15 to-rose-400/10 dark:from-primary/25 dark:to-rose-400/10 text-slate-400 dark:text-slate-500 text-xs font-bold book-cover ring-1 ring-inset ring-slate-200 dark:ring-slate-700 cursor-pointer edition-cover-trigger" data-action="read" data-edition-id="${escapeHtml(ed.id)}"><span>PDF</span>${volBadge}<div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"><span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-slate-900 text-xs font-semibold shadow-md"><span class="material-icons text-sm text-primary">menu_book</span>Read</span></div></div>`;

    const dateLine = formatDate(ed.issue_date || ed.created_at);
    const subLine = dateLine || String(ed.series_title || ed.status || '').trim() || 'Edition';

    card.innerHTML = `
      ${coverInner}
      <h3 class="mt-3 text-sm font-semibold text-slate-900 dark:text-white line-clamp-2" title="${escapeHtml(ed.title)}">${escapeHtml(ed.title)}</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-1">${escapeHtml(subLine)}</p>
      <div class="flex-1"></div>
      <div class="flex items-center justify-between gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <button type="button" class="btn-edition-read inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/10 hover:bg-primary text-primary hover:text-white transition-colors" data-action="read" data-edition-id="${escapeHtml(ed.id)}">
          <span class="material-icons text-sm">visibility</span> Read
        </button>
        <div class="flex items-center gap-1">
          <button type="button" class="btn-edition-copy inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-action="copy" data-edition-id="${escapeHtml(ed.id)}" title="Copy link" aria-label="Copy link">
            <span class="material-icons text-sm">link</span>
          </button>
          <button type="button" class="btn-edition-edit inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-action="edit" data-edition-id="${escapeHtml(ed.id)}" title="Edit edition">
            <span class="material-icons text-sm">edit</span>
          </button>
          <button type="button" class="btn-edition-delete inline-flex items-center justify-center h-7 w-7 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" data-action="delete" data-edition-id="${escapeHtml(ed.id)}" title="Delete edition">
            <span class="material-icons text-sm">delete</span>
          </button>
        </div>
      </div>`;

    editionsGrid.appendChild(card);
  });
}

/**
 * Render publications list, editions (when a publication is open), and team data from RTDB-shaped rows.
 * @param {string} publisherId - must match currentPublisherId or update is skipped (stale subscription).
 */
function renderStudioFromLiveData(publisherId, series, editions, invites, roster) {
  if (publisherId !== currentPublisherId) return;
  seriesItems = series;
  latestInvites = invites || [];
  latestRoster = roster || [];
  studioLiveEditions = editions;

  if (
    contentFlowStep === 'editions' &&
    selectedContentSeriesId &&
    !series.some((s) => s.id === selectedContentSeriesId)
  ) {
    contentFlowStep = 'publications';
    selectedContentSeriesId = null;
  }

  if (selectSeriesUpload) {
    const prevSeriesId = selectSeriesUpload.value;
    selectSeriesUpload.innerHTML = '';
    series.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.title;
      selectSeriesUpload.appendChild(opt);
    });
    if (contentFlowStep === 'editions' && selectedContentSeriesId && series.some((s) => s.id === selectedContentSeriesId)) {
      selectSeriesUpload.value = selectedContentSeriesId;
    } else if (prevSeriesId && series.some((s) => s.id === prevSeriesId)) {
      selectSeriesUpload.value = prevSeriesId;
    } else if (series.length) {
      selectSeriesUpload.value = series[0].id;
    }
  }

  updateCoverRequiredBanner();
  renderTeamTab();
  syncContentFlowPanels();

  if (contentFlowStep === 'publications') {
    renderSeriesListSection();
  } else if (contentFlowStep === 'editions') {
    renderEditionsGridSection();
  }

  studioEditionsForHash = editions;
  tryOpenReaderFromHash((r) => resolveStudioEditionForHash(r));
}

function openEditSeriesModal(s) {
  if (!s?.id) return;
  seriesEditId.value = s.id;
  seriesEditTitle.value = s.title || '';
  const currentSlug = s.slug || '';
  if (seriesEditSlug) seriesEditSlug.value = currentSlug;
  if (seriesEditSlugDisplayVal) seriesEditSlugDisplayVal.textContent = currentSlug ? '/' + currentSlug : (s.id ? '/' + s.id : '/');
  if (seriesEditSlugRow) seriesEditSlugRow.classList.add('hidden');
  if (seriesEditSlugDisplay) seriesEditSlugDisplay.classList.remove('hidden');
  if (seriesEditSlugHint) seriesEditSlugHint.classList.remove('hidden');
  seriesEditDesc.value = s.description || '';
  const f = String(s.frequency || '').trim();
  if (seriesEditFrequency) {
    if (window.setSeriesEditFrequency) {
      window.setSeriesEditFrequency(SERIES_FREQUENCY_VALUES.includes(f) ? f : 'monthly');
    } else {
      seriesEditFrequency.value = SERIES_FREQUENCY_VALUES.includes(f) ? f : 'monthly';
    }
  }
  seriesEditCurrentCoverUrl = String(s.cover_url || '').trim();
  if (seriesEditCoverFile) seriesEditCoverFile.value = '';
  revokeSeriesEditPreviewObjectUrl();
  refreshSeriesEditCoverPreview();
  seriesEditError?.classList.add('hidden');
  seriesEditModal?.classList.remove('hidden');
  seriesEditModal?.classList.add('flex');
}

function closeEditSeriesModal() {
  if (seriesEditSave?.getAttribute('aria-busy') === 'true') return;
  if (seriesEditCoverFile) seriesEditCoverFile.value = '';
  revokeSeriesEditPreviewObjectUrl();
  seriesEditCurrentCoverUrl = '';
  if (seriesEditCoverPreview) {
    seriesEditCoverPreview.onerror = null;
    seriesEditCoverPreview.removeAttribute('src');
    seriesEditCoverPreview.classList.add('hidden');
  }
  seriesEditCoverEmpty?.classList.add('hidden');
  seriesEditModal?.classList.add('hidden');
  seriesEditModal?.classList.remove('flex');
}

function onSeriesListClick(e) {
  const btn = e.target.closest('button');
  if (btn && currentPublisherId) {
    const sid = btn.getAttribute('data-series-id');
    if (!sid) return;
    if (btn.classList.contains('series-btn-copy')) {
      const s = seriesItems.find((x) => x.id === sid);
      const pubUrl = location.origin + publicationPath(s?.slug || sid);
      void (async () => {
        try {
          await navigator.clipboard.writeText(pubUrl);
          showToast('Publication link copied.', { type: 'success' });
        } catch (_) {
          showToast('Could not copy link.', { type: 'error' });
        }
      })();
      return;
    }
    if (btn.classList.contains('series-btn-cover')) {
      pendingSeriesIdForCover = sid;
      seriesCoverInput?.click();
      return;
    }
    if (btn.classList.contains('series-btn-edit')) {
      const s = seriesItems.find((x) => x.id === sid);
      if (s) openEditSeriesModal(s);
      return;
    }
    if (btn.classList.contains('series-btn-del')) {
      const edCount = studioEditionsForHash.filter((ed) => ed.series_id === sid).length;
      void (async () => {
        const ok = await studioConfirm({
          title: 'Delete publication?',
          message: `Delete this publication and ${edCount} edition(s) in it? Stored PDFs/covers and Firestore documents will be removed. This cannot be undone.`,
          confirmText: 'Delete publication',
          cancelText: 'Cancel',
          danger: true
        });
        if (!ok) return;
        showStudioBlockingStatus('Deleting publication…');
        btn.disabled = true;
        try {
          const { error } = await deleteSeriesCallable(sid);
          if (error) {
            showToast(error.message || 'Delete failed', { type: 'error' });
            return;
          }
          showToast('Publication deleted.', { type: 'success' });
          seriesItems = seriesItems.filter((s) => s.id !== sid);
          studioLiveEditions = studioLiveEditions.filter((e) => e.series_id !== sid);
          renderSeriesListSection();
        } finally {
          hideStudioBlockingStatus();
          btn.disabled = false;
        }
      })();
      return;
    }
    if (btn.classList.contains('series-btn-open')) {
      goToEditionsStep(sid);
      return;
    }
  }
  const card = e.target.closest('[data-series-id]');
  if (card && currentPublisherId && !e.target.closest('button')) {
    const sid = card.getAttribute('data-series-id');
    if (sid) goToEditionsStep(sid);
  }
}

async function loadPublisherContext(publisherId) {
  if (!publisherId) return;
  stopStudioSubscription();
  resetContentFlow();
  currentPublisherId = publisherId;
  currentPublisherRecord = null;
  syncCurrentUserRole();
  clearStudioPublisherNameLabel();
  try {
    localStorage.setItem(PUB_STORAGE_KEY, publisherId);
  } catch (_) {}

  studioUnsubscribe = subscribePublisherStudio(
    publisherId,
    ({ series, editions, invites, roster, profile }) => {
      if (currentPublisherId !== publisherId) return;
      if (profile) {
        currentPublisherRecord = profile;
        syncStudioPublisherNameLabel();
      }
      scheduleStudioRender(publisherId, series, editions, invites, roster);
    }
  );
}

async function pickPublisherAndLoad() {
  let stored = null;
  try {
    stored = localStorage.getItem(PUB_STORAGE_KEY);
  } catch (_) {}
  let pick =
    memberships.find((m) => m.publisherId === stored)?.publisherId || memberships[0]?.publisherId;
  const tried = new Set();
  while (pick && tried.size < memberships.length) {
    tried.add(pick);
    const prof = await fetchPublisher(pick);
    if (prof.data) break;
    try {
      localStorage.removeItem(PUB_STORAGE_KEY);
    } catch (_) {}
    const next = memberships.find((m) => !tried.has(m.publisherId));
    pick = next?.publisherId || null;
  }

  if (!pick) {
    renderNoOrgPendingInvites(latestPendingInvites);
    showNoMembership();
    return;
  }

  await loadPublisherContext(pick);
  await refreshStudioExternalInvitesBanner();
}

async function applyStudioMembershipSnapshot(data, error) {
  if (error || !data) {
    renderNoOrgPendingInvites(latestPendingInvites);
    showNoMembership();
    return;
  }
  memberships = data;
  if (!memberships.length) {
    renderNoOrgPendingInvites(latestPendingInvites);
    showNoMembership();
    return;
  }

  showStudio();
  setStudioTab(activeStudioTab);

  const stillMember =
    currentPublisherId && memberships.some((m) => m.publisherId === currentPublisherId);

  if (!stillMember) {
    await pickPublisherAndLoad();
    return;
  }

  syncCurrentUserRole();
  syncStudioPublisherNameLabel();
  scheduleStudioRender(
    currentPublisherId,
    seriesItems,
    studioLiveEditions,
    latestInvites,
    latestRoster
  );
  void refreshStudioExternalInvitesBanner();
}

async function refreshMembershipsAndUi(user) {
  if (!user) {
    showGuest();
    return;
  }

  const pendingRes = await listMyPendingInvitesCallable();
  setNoOrgInvitesLoadError(pendingRes.error?.message || '');
  latestPendingInvites = pendingRes.data || [];
  renderNoOrgPendingInvites(latestPendingInvites);

  const { data, error } = await listMyPublisherMemberships();
  await applyStudioMembershipSnapshot(data, error);
  startMembershipSubscription(user.uid);
}

onAuthStateChange((state, user) => {
  if (state === 'SIGNED_IN' && user) {
    guestError?.classList.add('hidden');
    refreshMembershipsAndUi(user);
  } else {
    showGuest();
  }
});

btnGoogleSignin?.addEventListener('click', async () => {
  guestError?.classList.add('hidden');
  setSubmitBusy(btnGoogleSignin, true, 'Signing in…');
  try {
    const { error } = await signInWithGoogle();
    if (error) {
      guestError.textContent = error.message || 'Sign-in failed';
      guestError.classList.remove('hidden');
    }
  } finally {
    setSubmitBusy(btnGoogleSignin, false, '');
  }
});

btnSignout?.addEventListener('click', () => signOut());
btnSignoutNoOrg?.addEventListener('click', () => signOut());

btnBackPublications?.addEventListener('click', () => goToPublicationsList());
btnUploadInFlow?.addEventListener('click', () => openUploadModal());

selectSeriesUpload?.addEventListener('change', () => updateCoverRequiredBanner());

document.querySelectorAll('[data-studio-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-studio-tab');
    if (tab === 'content' || tab === 'team') setStudioTab(tab);
  });
});

function openNewPublicationModal() {
  if (!currentPublisherId) return;
  seriesFormError?.classList.add('hidden');
  newSeriesTitle.value = '';
  newSeriesDesc.value = '';
  if (newSeriesFrequency) {
    if (window.setNewSeriesFrequency) {
      window.setNewSeriesFrequency('monthly');
    } else {
      newSeriesFrequency.value = 'monthly';
    }
  }
  if (newSeriesCoverFile) newSeriesCoverFile.value = '';
  newPublicationModal?.classList.remove('hidden');
  newPublicationModal?.classList.add('flex');
  queueMicrotask(() => newSeriesTitle?.focus());
}

function closeNewPublicationModal() {
  if (btnNewPublicationSubmit?.getAttribute('aria-busy') === 'true') return;
  newPublicationModal?.classList.add('hidden');
  newPublicationModal?.classList.remove('flex');
}

btnNewPublicationOpen?.addEventListener('click', () => openNewPublicationModal());
newPublicationClose?.addEventListener('click', closeNewPublicationModal);
newPublicationCancel?.addEventListener('click', closeNewPublicationModal);

newPublicationForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  seriesFormError?.classList.add('hidden');
  const title = (newSeriesTitle?.value || '').trim();
  if (!title || !currentPublisherId) {
    if (seriesFormError) {
      seriesFormError.textContent = 'Enter a publication title.';
      seriesFormError.classList.remove('hidden');
    }
    return;
  }
  const description = (newSeriesDesc?.value || '').trim();
  const frequency = (newSeriesFrequency?.value || '').trim();
  if (!frequency) {
    if (seriesFormError) {
      seriesFormError.textContent = 'Select a frequency.';
      seriesFormError.classList.remove('hidden');
    }
    return;
  }
  const coverFile = newSeriesCoverFile?.files?.[0];
  const slug = (newSeriesSlug?.value || '').trim();
  if (slug) {
    if (isReservedSlug(slug)) {
      if (seriesFormError) {
        seriesFormError.textContent = `"${slug}" is a reserved system route and cannot be used.`;
        seriesFormError.classList.remove('hidden');
      }
      return;
    }
    const slugLower = slug.toLowerCase();
    const localTaken = seriesItems.some((s) => (s.slug || '').toLowerCase() === slugLower);
    if (localTaken) {
      if (seriesFormError) {
        seriesFormError.textContent = `The URL slug "${slug}" is already in use by another publication.`;
        seriesFormError.classList.remove('hidden');
      }
      return;
    }
    try {
      const { data: pubMap } = await fetchPublishedSeriesMap();
      const globalTaken = Object.values(pubMap || {}).some((s) => (s?.slug || '').toLowerCase() === slugLower);
      if (globalTaken) {
        if (seriesFormError) {
          seriesFormError.textContent = `The URL slug "${slug}" is already in use by another publication.`;
          seriesFormError.classList.remove('hidden');
        }
        return;
      }
    } catch (_) {}
  }
  setSubmitBusy(btnNewPublicationSubmit, true, 'Creating publication…');
  const { data, error } = await createSeries({
    publisherId: currentPublisherId,
    title,
    description,
    frequency,
    slug: slug || null
  });
  if (error) {
    setSubmitBusy(btnNewPublicationSubmit, false, '');
    if (seriesFormError) {
      seriesFormError.textContent = error.message || 'Could not create publication';
      seriesFormError.classList.remove('hidden');
    }
    return;
  }
  const seriesId = data?.id;
  if (coverFile && seriesId) {
    setSubmitBusyLabel(btnNewPublicationSubmit, 'Uploading cover…');
    const up = await uploadSeriesCoverFile(coverFile, {
      publisherId: currentPublisherId,
      seriesId
    });
    if (up.error) {
      setSubmitBusy(btnNewPublicationSubmit, false, '');
      showToast(
        `Publication created, but the cover could not be uploaded: ${up.error}\n\nAdd a cover from the publication card.`,
        { type: 'error', duration: 9000 }
      );
      closeNewPublicationModal();
      return;
    }
    const { error: upSeriesErr } = await updateSeries(seriesId, {
      cover_url: up.download_url,
      cover_thumb_url: up.cover_thumb_url || null,
      cover_repo_path: up.path || null
    });
    if (upSeriesErr) {
      setSubmitBusy(btnNewPublicationSubmit, false, '');
      showToast(
        `Publication created and cover uploaded, but saving the URL failed: ${upSeriesErr.message || upSeriesErr}\n\nTry uploading the cover again from the publication card.`,
        { type: 'error', duration: 9000 }
      );
      closeNewPublicationModal();
      return;
    }
  }
  setSubmitBusy(btnNewPublicationSubmit, false, '');
  closeNewPublicationModal();
  showToast('Publication created.', { type: 'success' });
});

function openUploadModal() {
  if (contentFlowStep !== 'editions' || !selectedContentSeriesId) {
    showToast('Open a publication first, then upload an edition for that series.', { type: 'info' });
    return;
  }
  if (selectSeriesUpload) selectSeriesUpload.value = selectedContentSeriesId;
  const ser = seriesItems.find((s) => s.id === selectedContentSeriesId);
  if (ser && !(ser.cover_url && String(ser.cover_url).trim())) {
    showToast('Upload a cover for this publication before publishing editions.', { type: 'info' });
    activeStudioTab = 'content';
    setStudioTab('content');
    return;
  }
  uploadError?.classList.add('hidden');
  uploadSuccess?.classList.add('hidden');
  uploadForm?.reset();
  if (uploadIssueDate) {
    uploadIssueDate.value = new Date().toISOString().slice(0, 10);
    updateUploadDatePreview();
  }
  if (uploadPublicationName) {
    uploadPublicationName.textContent = ser?.title || 'Publication';
  }
  if (uploadPublicationSlug) {
    const slug = ser?.slug && String(ser.slug).trim();
    if (slug) {
      uploadPublicationSlug.textContent = slug;
      uploadPublicationSlug.classList.remove('hidden');
    } else {
      uploadPublicationSlug.textContent = '';
      uploadPublicationSlug.classList.add('hidden');
    }
  }
  setUploadProgressVisible(false);
  uploadModal?.classList.remove('hidden');
  uploadModal?.classList.add('flex');
}

function closeUploadModal() {
  if (uploadSubmit?.getAttribute('aria-busy') === 'true') return;
  setUploadProgressVisible(false);
  setUploadModalFieldsDisabled(false);
  uploadModal?.classList.add('hidden');
  uploadModal?.classList.remove('flex');
}

function openEditEditionModal(ed) {
  if (!ed?.id) return;
  if (ed.publisher_id && ed.publisher_id !== currentPublisherId) return;
  editingEdition = ed;
  editEditionId.value = ed.id;
  editTitle.value = ed.title || '';
  const currentSlug = ed.slug || '';
  if (editSlug) editSlug.value = currentSlug;
  if (editSlugDisplayVal) editSlugDisplayVal.textContent = currentSlug ? '/' + currentSlug : (ed.id ? '/' + ed.id : '/');
  if (editSlugRow) editSlugRow.classList.add('hidden');
  if (editSlugDisplay) editSlugDisplay.classList.remove('hidden');
  if (editSlugHint) editSlugHint.classList.remove('hidden');
  editDescription.value = ed.description || '';
  if (editIssueDate) {
    editIssueDate.value = isoToDateInput(ed.issue_date);
    updateEditDatePreview();
  }
    editError?.classList.add('hidden');
  editSuccess?.classList.add('hidden');
  editCoverHint?.classList.add('hidden');
  editCoverHint.textContent = '';
  const hasPath = !!(ed.pdf_repo_path && String(ed.pdf_repo_path).trim());
  if (editRegenerateCover) {
    editRegenerateCover.disabled = !hasPath;
    editRegenerateCover.title = hasPath
      ? 'Re-render first page of the PDF and upload cover (browser must be able to fetch the PDF URL; ensure R2/public CDN CORS allows your site)'
      : 'Re-publish this edition (new PDF upload) once to store the object path, then you can regenerate the cover.';
  }
  editModal?.classList.remove('hidden');
  editModal?.classList.add('flex');
}

function closeEditEditionModal() {
  if (
    editSave?.getAttribute('aria-busy') === 'true' ||
    editRegenerateCover?.getAttribute('aria-busy') === 'true'
  ) {
    return;
  }
  editingEdition = null;
  editModal?.classList.add('hidden');
  editModal?.classList.remove('flex');
}

uploadClose?.addEventListener('click', closeUploadModal);
uploadCancel?.addEventListener('click', closeUploadModal);

editClose?.addEventListener('click', closeEditEditionModal);
editCancel?.addEventListener('click', closeEditEditionModal);

editRegenerateCover?.addEventListener('click', async () => {
  const ed = editingEdition;
  if (!ed?.id || !currentPublisherId) return;
  const pdfPath = ed.pdf_repo_path && String(ed.pdf_repo_path).trim();
  if (!pdfPath) {
    editCoverHint.textContent =
      'This edition has no stored PDF path (usually created before this feature). Upload a new PDF for this edition to enable cover regeneration.';
    editCoverHint.classList.remove('hidden');
    return;
  }
  if (!ed.pdf_url) {
    editError.textContent = 'No PDF URL on this edition.';
    editError.classList.remove('hidden');
    return;
  }
  editError?.classList.add('hidden');
  editSuccess?.classList.add('hidden');
  editCoverHint?.classList.add('hidden');
  setSubmitBusy(editRegenerateCover, true, 'Rendering cover…');
  try {
    const { blob, error: genErr } = await renderFirstPageWebpFromPdfUrl(ed.pdf_url, {});
    if (!blob) {
      editCoverHint.textContent = genErr || 'Could not render the first PDF page.';
      editCoverHint.classList.remove('hidden');
      return;
    }
    setSubmitBusyLabel(editRegenerateCover, 'Uploading cover…');
    const cup = await uploadEditionCoverWebp(blob, {
      publisherId: currentPublisherId,
      seriesId: ed.series_id,
      pdfRepoPath: pdfPath
    });
    if (cup.error) {
      editError.textContent = cup.error;
      editError.classList.remove('hidden');
      return;
    }
    setSubmitBusyLabel(editRegenerateCover, 'Saving…');
    const { error: upErr } = await updateEdition(ed.id, {
      cover_url: cup.download_url,
      cover_thumb_url: cup.cover_thumb_url || null
    });
    if (upErr) {
      editError.textContent = upErr.message || 'Cover uploaded but Firestore update failed';
      editError.classList.remove('hidden');
      return;
    }
    editSuccess.textContent = 'Cover updated.';
    editSuccess.classList.remove('hidden');
    showToast('Cover updated.', { type: 'success' });
    editingEdition = {
      ...ed,
      cover_url: cup.download_url,
      cover_thumb_url: cup.cover_thumb_url || null,
      pdf_repo_path: pdfPath
    };
  } finally {
    setSubmitBusy(editRegenerateCover, false, '');
  }
});

editForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = (editEditionId?.value || '').trim();
  if (!id || !currentPublisherId) return;
  editError?.classList.add('hidden');
  editSuccess?.classList.add('hidden');
  const title = (editTitle?.value || '').trim();
  const description = (editDescription?.value || '').trim();
  const slug = (editSlug?.value || '').trim();
  const seriesId = editingEdition?.series_id || selectedContentSeriesId;
  if (slug) {
    if (isReservedSlug(slug)) {
      editError.textContent = `"${slug}" is a reserved system route and cannot be used.`;
      editError.classList.remove('hidden');
      return;
    }
    const slugLower = slug.toLowerCase();
    const editionCollision = studioLiveEditions.some(
      (e) => e.id !== id && e.series_id === seriesId && (e.slug || '').toLowerCase() === slugLower
    );
    if (editionCollision) {
      editError.textContent = `An edition with the URL slug "${slug}" already exists in this publication. Edition slugs must be unique within the publication.`;
      editError.classList.remove('hidden');
      return;
    }
  }
  if (!title) {
    editError.textContent = 'Title is required.';
    editError.classList.remove('hidden');
    return;
  }
  const series = seriesItems.find((s) => s.id === seriesId);
  const issueRaw = (editIssueDate?.value || '').trim();
  setSubmitBusy(editSave, true, 'Saving…');
  const { error } = await updateEdition(id, {
    title,
    description: description || null,
    slug: slug || null,
    series_id: seriesId,
    series_title: series?.title ?? null,
    ...(issueRaw ? { issue_date: issueRaw } : { issue_date: null })
  });
  setSubmitBusy(editSave, false, '');
  if (error) {
    editError.textContent = error.message || 'Update failed';
    editError.classList.remove('hidden');
    return;
  }
  showToast('Edition saved.', { type: 'success' });
  if (editingEdition && editingEdition.id === id) {
    editingEdition = {
      ...editingEdition,
      title,
      description: description || null,
      slug: slug || null,
      series_id: seriesId,
      series_title: series?.title ?? null,
      issue_date: issueRaw ? new Date(`${issueRaw}T12:00:00.000Z`).toISOString() : null
    };
  }
  setTimeout(closeEditEditionModal, 600);
});

uploadForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  uploadError?.classList.add('hidden');
  uploadSuccess?.classList.add('hidden');
  const seriesId = selectSeriesUpload?.value;
  if (!currentPublisherId || !seriesId) {
    uploadError.textContent = 'Select a publisher and series.';
    uploadError.classList.remove('hidden');
    return;
  }
  const title = (uploadTitle?.value || '').trim();
  const description = (uploadDescription?.value || '').trim();
  const issueRaw = (uploadIssueDate?.value || '').trim();
  if (!issueRaw) {
    uploadError.textContent = 'Issue date is required.';
    uploadError.classList.remove('hidden');
    return;
  }
  const file = uploadFile?.files?.[0];
  if (!file) {
    uploadError.textContent = 'Choose a PDF.';
    uploadError.classList.remove('hidden');
    return;
  }
  const slug = (uploadSlug?.value || '').trim();
  if (slug) {
    if (isReservedSlug(slug)) {
      uploadError.textContent = `"${slug}" is a reserved system route and cannot be used.`;
      uploadError.classList.remove('hidden');
      return;
    }
    const slugLower = slug.toLowerCase();
    const editionCollision = studioLiveEditions.some(
      (e) => e.series_id === seriesId && (e.slug || '').toLowerCase() === slugLower
    );
    if (editionCollision) {
      uploadError.textContent = `An edition with the URL slug "${slug}" already exists in this publication. Edition slugs must be unique within the publication.`;
      uploadError.classList.remove('hidden');
      return;
    }
  }
  setUploadProgressVisible(
    true,
    'Publishing your edition',
    'Uploading PDF to storage… This can take a minute for large files.'
  );
  setUploadModalFieldsDisabled(true);
  setSubmitBusy(uploadSubmit, true, 'Publishing…');
  try {
    const up = await uploadEditionPdf(file, {
      publisherId: currentPublisherId,
      seriesId
    });
    if (up.error) {
      uploadError.textContent = up.error;
      uploadError.classList.remove('hidden');
      return;
    }
    let coverUrl = null;
    let coverThumbUrl = null;
    if (up.path) {
      setUploadProgressVisible(
        true,
        'Publishing your edition',
        'Building cover preview from the first page…'
      );
      setSubmitBusyLabel(uploadSubmit, 'Cover preview…');
      const { blob: coverBlob } = await renderFirstPageWebpFromPdfFile(file, {});
      if (coverBlob) {
        setUploadProgressVisible(
          true,
          'Publishing your edition',
          'Uploading cover image…'
        );
        setSubmitBusyLabel(uploadSubmit, 'Uploading cover…');
        const cup = await uploadEditionCoverWebp(coverBlob, {
          publisherId: currentPublisherId,
          seriesId,
          pdfRepoPath: up.path
        });
        if (!cup.error) {
          coverUrl = cup.download_url;
          coverThumbUrl = cup.cover_thumb_url || null;
        }
      }
    }
    setUploadProgressVisible(
      true,
      'Publishing your edition',
      'Saving edition to the catalog…'
    );
    setSubmitBusyLabel(uploadSubmit, 'Saving…');
    const series = seriesItems.find((s) => s.id === seriesId);
    const pubName = currentPublisherRecord?.name || null;
    const seriesTitle = series?.title || null;
    const slug = (uploadSlug?.value || '').trim();
    const ins = await insertPublishedEdition({
      publisher_id: currentPublisherId,
      series_id: seriesId,
      title,
      description: description || null,
      pdf_url: up.download_url,
      cover_url: coverUrl,
      cover_thumb_url: coverThumbUrl,
      pdf_repo_path: up.path || null,
      publisher_name: pubName,
      series_title: seriesTitle,
      issue_date: issueRaw,
      slug: slug || null
    });
    if (ins.error) {
      uploadError.textContent = ins.error.message || 'Saved file but Firestore write failed';
      uploadError.classList.remove('hidden');
      return;
    }
    
    // Show success panel
    if (uploadFormBody && uploadSuccessPanel) {
      uploadFormBody.classList.add('hidden');
      uploadSuccessPanel.classList.remove('hidden');
      
      const resolvedSeriesSlug = series?.slug || seriesId;
      const resolvedEditionSlug = slug || ins.data?.slug || ins.data?.id || '';
      const editionUrl = location.origin + editionPath(resolvedSeriesSlug, resolvedEditionSlug);
      
      if (uploadSuccessCover) {
        uploadSuccessCover.src = coverUrl || coverThumbUrl || '';
        uploadSuccessCover.classList.toggle('hidden', !coverUrl && !coverThumbUrl);
      }
      if (uploadSuccessTitle) uploadSuccessTitle.textContent = title;
      if (uploadSuccessDate) uploadSuccessDate.textContent = formatDate(issueRaw);
      if (uploadSuccessUrl) uploadSuccessUrl.value = editionUrl;
      if (uploadSuccessViewLive) uploadSuccessViewLive.href = editionUrl;
      
      if (uploadSuccessCopy) {
        uploadSuccessCopy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(editionUrl);
            showToast('Link copied.', { type: 'success' });
          } catch (_) {
            showToast('Could not copy - long-press the link to copy.', { type: 'error' });
          }
        };
      }
    } else {
      showToast('Edition published to the catalog.', { type: 'success' });
    }
  } finally {
    setUploadProgressVisible(false);
    setUploadModalFieldsDisabled(false);
    setSubmitBusy(uploadSubmit, false, '');
  }
});

readerPrev?.addEventListener('click', flipPrev);
readerNext?.addEventListener('click', flipNext);
readerFirst?.addEventListener('click', flipFirst);
readerLast?.addEventListener('click', flipLast);
readerZoomIn?.addEventListener('click', zoomIn);
readerZoomOut?.addEventListener('click', zoomOut);
readerCloseBtn?.addEventListener('click', closeReader);
readerFitReset?.addEventListener('click', resetReaderZoom);
readerFullscreen?.addEventListener('click', readerToggleFullscreen);
readerPageJumpGo?.addEventListener('click', readerSubmitPageJump);
readerPageJump?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    setPageJumpOpen(false);
    e.target.blur();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    readerSubmitPageJump();
  }
});

seriesCoverInput?.addEventListener('change', async (e) => {
  const input = e.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !pendingSeriesIdForCover || !currentPublisherId) return;
  const sid = pendingSeriesIdForCover;
  pendingSeriesIdForCover = null;
  showStudioBlockingStatus('Uploading publication cover…');
  try {
    const up = await uploadSeriesCoverFile(file, { publisherId: currentPublisherId, seriesId: sid });
    if (up.error) {
      showToast(up.error, { type: 'error' });
      return;
    }
    showStudioBlockingStatus('Saving cover to publication…');
    const { error } = await updateSeries(sid, {
      cover_url: up.download_url,
      cover_thumb_url: up.cover_thumb_url || null,
      cover_repo_path: up.path || null
    });
    if (error) {
      showToast(error.message || 'Could not save cover URL', { type: 'error' });
      return;
    }
    showToast('Cover updated.', { type: 'success' });
  } finally {
    hideStudioBlockingStatus();
  }
});

seriesEditForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = (seriesEditId?.value || '').trim();
  if (!id || !currentPublisherId) return;
  seriesEditError?.classList.add('hidden');
  const title = (seriesEditTitle?.value || '').trim();
  if (!title) {
    if (seriesEditError) {
      seriesEditError.textContent = 'Title required';
      seriesEditError.classList.remove('hidden');
    }
    return;
  }
  const slug = (seriesEditSlug?.value || '').trim();
  if (slug) {
    if (isReservedSlug(slug)) {
      if (seriesEditError) {
        seriesEditError.textContent = `"${slug}" is a reserved system route and cannot be used.`;
        seriesEditError.classList.remove('hidden');
      }
      return;
    }
    const slugLower = slug.toLowerCase();
    const localTaken = seriesItems.some((s) => s.id !== id && (s.slug || '').toLowerCase() === slugLower);
    if (localTaken) {
      if (seriesEditError) {
        seriesEditError.textContent = `The URL slug "${slug}" is already in use by another publication.`;
        seriesEditError.classList.remove('hidden');
      }
      return;
    }
    try {
      const { data: pubMap } = await fetchPublishedSeriesMap();
      const globalTaken = Object.entries(pubMap || {}).some(
        ([sid, s]) => sid !== id && (s?.slug || '').toLowerCase() === slugLower
      );
      if (globalTaken) {
        if (seriesEditError) {
          seriesEditError.textContent = `The URL slug "${slug}" is already in use by another publication.`;
          seriesEditError.classList.remove('hidden');
        }
        return;
      }
    } catch (_) {}
  }
  const description = (seriesEditDesc?.value || '').trim();
  const frequency = (seriesEditFrequency?.value || '').trim();
  if (!frequency) {
    if (seriesEditError) {
      seriesEditError.textContent = 'Select a frequency.';
      seriesEditError.classList.remove('hidden');
    }
    return;
  }
  const coverFile = seriesEditCoverFile?.files?.[0];
  setSubmitBusy(seriesEditSave, true, 'Saving…');

  if (coverFile) {
    setSubmitBusyLabel(seriesEditSave, 'Uploading cover…');
    const up = await uploadSeriesCoverFile(coverFile, {
      publisherId: currentPublisherId,
      seriesId: id
    });
    if (up.error) {
      setSubmitBusy(seriesEditSave, false, '');
      if (seriesEditError) {
        seriesEditError.textContent = up.error;
        seriesEditError.classList.remove('hidden');
      }
      return;
    }
    setSubmitBusyLabel(seriesEditSave, 'Saving publication…');
    const { error } = await updateSeries(id, {
      title,
      description,
      slug: slug || null,
      frequency,
      cover_url: up.download_url,
      cover_thumb_url: up.cover_thumb_url || null,
      cover_repo_path: up.path || null
    });
    setSubmitBusy(seriesEditSave, false, '');
    if (error) {
      if (seriesEditError) {
        seriesEditError.textContent = error.message || 'Save failed';
        seriesEditError.classList.remove('hidden');
      }
      return;
    }
    showToast('Publication updated.', { type: 'success' });
    closeEditSeriesModal();
    return;
  }

  const { error } = await updateSeries(id, { title, description, slug: slug || null, frequency });
  setSubmitBusy(seriesEditSave, false, '');
  if (error) {
    if (seriesEditError) {
      seriesEditError.textContent = error.message || 'Save failed';
      seriesEditError.classList.remove('hidden');
    }
    return;
  }
  showToast('Publication updated.', { type: 'success' });
  closeEditSeriesModal();
});

seriesEditClose?.addEventListener('click', closeEditSeriesModal);
seriesEditCancel?.addEventListener('click', closeEditSeriesModal);
seriesEditCoverFile?.addEventListener('change', () => refreshSeriesEditCoverPreview());

btnSendInvite?.addEventListener('click', async () => {
  if (!inviteFormMsg) return;
  inviteFormMsg.textContent = '';
  inviteFormMsg.classList.remove('text-red-500', 'text-emerald-600');
  const name = (inviteName?.value || '').trim();
  const email = (inviteEmail?.value || '').trim();
  if (!currentPublisherId || !name || !email) {
    inviteFormMsg.textContent = 'Name and email required.';
    inviteFormMsg.classList.add('text-red-500');
    return;
  }
  setSubmitBusy(btnSendInvite, true, 'Sending…');
  const { error } = await publisherCreateInvite({
    publisherId: currentPublisherId,
    invitee_name: name,
    email,
    intended_role: 'editor'
  });
  setSubmitBusy(btnSendInvite, false, '');
  if (error) {
    inviteFormMsg.textContent = error.message || 'Invite failed';
    inviteFormMsg.classList.add('text-red-500');
    return;
  }
  inviteFormMsg.textContent = 'Invite sent.';
  inviteFormMsg.classList.add('text-emerald-600');
  inviteName.value = '';
  inviteEmail.value = '';
});

studioPanelTeam?.addEventListener('click', async (e) => {
  const rev = /** @type {HTMLButtonElement | null} */ (e.target.closest('.revoke-invite-btn'));
  if (rev && currentPublisherId) {
    const inviteId = rev.getAttribute('data-invite-id');
    if (!inviteId) return;
    const ok = await studioConfirm({
      title: 'Revoke invite?',
      message: 'They will no longer be able to accept this invitation.',
      confirmText: 'Revoke',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    showStudioBlockingStatus('Revoking invite…');
    setSubmitBusy(rev, true, 'Revoking…');
    try {
      const { error } = await publisherRevokeInvite({ publisherId: currentPublisherId, inviteId });
      if (error) {
        showToast(error.message || 'Revoke failed', { type: 'error' });
        return;
      }
      showToast('Invite revoked.', { type: 'success' });
    } finally {
      hideStudioBlockingStatus();
      setSubmitBusy(rev, false, '');
    }
    return;
  }
  const rem = /** @type {HTMLButtonElement | null} */ (e.target.closest('.remove-member-btn'));
  if (rem && currentPublisherId) {
    const targetUid = rem.getAttribute('data-target-uid');
    if (!targetUid) return;
    const ok = await studioConfirm({
      title: 'Remove member?',
      message: 'They will lose access to this publisher until invited again.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    showStudioBlockingStatus('Removing member…');
    setSubmitBusy(rem, true, 'Removing…');
    try {
      const { error } = await publisherRemoveMemberCallable({ publisherId: currentPublisherId, targetUid });
      if (error) {
        showToast(error.message || 'Remove failed', { type: 'error' });
        return;
      }
      showToast('Member removed.', { type: 'success' });
    } finally {
      hideStudioBlockingStatus();
      setSubmitBusy(rem, false, '');
    }
  }
});

document.getElementById('no-org-invites-list')?.addEventListener('click', (e) => {
  const b = /** @type {HTMLButtonElement | null} */ (e.target.closest('.accept-invite-btn'));
  if (!b) return;
  const publisherId = b.getAttribute('data-publisher-id');
  const inviteId = b.getAttribute('data-invite-id');
  if (publisherId && inviteId) void onAcceptInvite(publisherId, inviteId, b);
});

studioPendingActions?.addEventListener('click', (e) => {
  const b = /** @type {HTMLButtonElement | null} */ (e.target.closest('.accept-invite-btn'));
  if (!b) return;
  const publisherId = b.dataset.publisherId;
  const inviteId = b.dataset.inviteId;
  if (publisherId && inviteId) void onAcceptInvite(publisherId, inviteId, b);
});

window.addEventListener('hashchange', () => {
  tryOpenReaderFromHash((r) => resolveStudioEditionForHash(r));
});


uploadSuccessAnother?.addEventListener('click', () => {
  uploadFormBody?.classList.remove('hidden');
  uploadSuccessPanel?.classList.add('hidden');
  uploadForm?.reset();
  if (selectSeriesUpload && selectedContentSeriesId) {
    selectSeriesUpload.value = selectedContentSeriesId;
  }
  
});

uploadSuccessDone?.addEventListener('click', () => {
  uploadClose?.click();
});


/** Live URL slug generation and UI */
function attachSlugGenerator(inputEl, genBtnEl, titleEl) {
  if (!genBtnEl || !inputEl || !titleEl) return;
  genBtnEl.addEventListener('click', () => {
    const titleVal = titleEl.value.trim();
    if (titleVal) {
      inputEl.value = sanitizeSlug(titleVal);
    }
  });
}

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
  getFullUrl,
  validate
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
        showToast('Link copied.', { type: 'success' });
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
      if (cleanVal && isReservedSlug(cleanVal)) {
        showToast(`"${cleanVal}" is a reserved system route and cannot be used.`, { type: 'error' });
        return;
      }
      if (cleanVal && validate) {
        const valErr = validate(cleanVal);
        if (valErr) {
          showToast(valErr, { type: 'error' });
          return;
        }
      }
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
  document.querySelectorAll(selector).forEach(el => {
    const resize = () => {
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight) + 'px';
    };
    el.addEventListener('input', resize);
    // Observe when modal opens to resize
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) resize();
    });
    observer.observe(el);
  });
}

attachSlugGenerator(newSeriesSlug, document.getElementById('new-series-slug-gen'), newSeriesTitle);
attachSlugGenerator(uploadSlug, document.getElementById('upload-slug-gen'), uploadTitle);

setupInlineSlugEditor({
  editBtn: editSlugEditBtn,
  copyBtn: editSlugCopyBtn,
  displayEl: editSlugDisplay,
  displayValEl: editSlugDisplayVal,
  hintEl: editSlugHint,
  rowEl: editSlugRow,
  inputEl: editSlug,
  genBtn: editSlugGen,
  updateBtn: editSlugUpdateBtn,
  cancelBtn: editSlugCancelBtn,
  titleEl: editTitle,
  getFullUrl: (slug) => {
    const sId = editingEdition?.series_id || selectedContentSeriesId;
    const ser = seriesItems.find((s) => s.id === sId);
    const resolvedSeriesSlug = ser?.slug || sId || '';
    const resolvedEditionSlug = slug || editingEdition?.id || '';
    return location.origin + editionPath(resolvedSeriesSlug, resolvedEditionSlug);
  },
  validate: (slug) => {
    const sId = editingEdition?.series_id || selectedContentSeriesId;
    const slugLower = slug.toLowerCase();
    const collision = studioLiveEditions.some(
      (e) => e.id !== editingEdition?.id && e.series_id === sId && (e.slug || '').toLowerCase() === slugLower
    );
    if (collision) {
      return `An edition with the URL slug "${slug}" already exists in this publication.`;
    }
    return null;
  }
});

setupInlineSlugEditor({
  editBtn: seriesEditSlugEditBtn,
  copyBtn: seriesEditSlugCopyBtn,
  displayEl: seriesEditSlugDisplay,
  displayValEl: seriesEditSlugDisplayVal,
  hintEl: seriesEditSlugHint,
  rowEl: seriesEditSlugRow,
  inputEl: seriesEditSlug,
  genBtn: seriesEditSlugGen,
  updateBtn: seriesEditSlugUpdateBtn,
  cancelBtn: seriesEditSlugCancelBtn,
  titleEl: seriesEditTitle,
  getFullUrl: (slug) => {
    const resolvedSlug = slug || seriesEditId?.value || '';
    return location.origin + publicationPath(resolvedSlug);
  },
  validate: (slug) => {
    const sId = (seriesEditId?.value || '').trim();
    const slugLower = slug.toLowerCase();
    const collision = seriesItems.some(
      (s) => s.id !== sId && (s.slug || '').toLowerCase() === slugLower
    );
    if (collision) {
      return `The URL slug "${slug}" is already in use by another publication.`;
    }
    return null;
  }
});

btnCopyCurrentSeriesUrl?.addEventListener('click', async () => {
  if (!selectedContentSeriesId) return;
  const ser = seriesItems.find((s) => s.id === selectedContentSeriesId);
  const pubUrl = location.origin + publicationPath(ser?.slug || selectedContentSeriesId);
  try {
    await navigator.clipboard.writeText(pubUrl);
    showToast('Publication link copied.', { type: 'success' });
  } catch (_) {
    showToast('Could not copy link.', { type: 'error' });
  }
});

attachAutoTextarea('.studio-auto-textarea');

// Custom Select Initialization
function setupCustomSelect(id) {
  const wrapper = document.getElementById(`${id}-wrapper`);
  const input = document.getElementById(id);
  const btn = document.getElementById(`${id}-btn`);
  const label = document.getElementById(`${id}-label`);
  const list = document.getElementById(`${id}-list`);
  if (!wrapper || !input || !btn || !list) return null;

  const options = Array.from(list.querySelectorAll('li'));
  
  const setValue = (val) => {
    input.value = val;
    options.forEach(opt => {
      const isSelected = opt.dataset.value === val;
      opt.querySelector('span:first-child').className = isSelected ? 'block truncate font-medium' : 'block truncate font-normal';
      const check = opt.querySelector('.checkmark');
      if (check) check.classList.toggle('hidden', !isSelected);
      if (isSelected) label.textContent = opt.querySelector('span:first-child').textContent;
    });
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.custom-select ul').forEach(u => u.classList.add('hidden'));
    document.querySelectorAll('.custom-select button').forEach(b => b.setAttribute('aria-expanded', 'false'));
    
    if (!expanded) {
      list.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
    }
  });

  options.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      setValue(opt.dataset.value);
      list.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      list.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  
  return setValue;
}

window.setNewSeriesFrequency = setupCustomSelect('new-series-frequency');
window.setSeriesEditFrequency = setupCustomSelect('series-edit-frequency');

seriesSearchInput?.addEventListener('input', () => {
  seriesSearchQuery = (seriesSearchInput.value || '').trim().toLowerCase();
  renderSeriesListSection();
});

editionsSearchInput?.addEventListener('input', () => {
  editionsSearchQuery = (editionsSearchInput.value || '').trim().toLowerCase();
  renderEditionsGridSection();
});

