/**
 * publication (publication.html) — single series hero + editions grid (series detail + reader).
 */
import './hydrate-pub-icons.js';
import { fetchPublishedCatalog, fetchPublishedSeriesMap } from './db-public.js';
import { groupEditionsIntoSeries, findSeriesGroup } from './catalog-series.js';
import { seriesFrequencyLabel } from './frequency-label.js';
import {
  getSeriesCanonicalIdFromSearchParams,
  buildEditionDeepLink,
  getSeriesCanonicalIdForPublication,
  readEditionRefFromHash
} from './url-routes.js';
import { buildCoverImgHtml, wireCoverImgReveal } from './cover-markup.js';
import { pubIcon } from './icons-public.js';

let viewerModPromise = null;
function getViewerModule() {
  if (!viewerModPromise) viewerModPromise = import('./viewer.js');
  return viewerModPromise;
}

function openReader(pub) {
  void getViewerModule().then((m) => m.openReader(pub));
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

const params = new URLSearchParams(location.search);
const seriesCanonicalId = getSeriesCanonicalIdFromSearchParams(params);

const heroTitle = document.getElementById('series-hero-title');
const heroDesc = document.getElementById('series-hero-desc');
const heroCover = document.getElementById('series-hero-cover');
const heroBadgePublisher = document.getElementById('series-badge-publisher');
const heroBadgeFrequency = document.getElementById('series-badge-frequency');
const heroBadgeUpdated = document.getElementById('series-badge-updated');
const heroBadgeCount = document.getElementById('series-badge-count');
const btnReadLatest = document.getElementById('series-read-latest');
const editionsGrid = document.getElementById('series-editions-grid');
const editionsCount = document.getElementById('series-editions-count');
const notFound = document.getElementById('series-not-found');
const mainContent = document.getElementById('series-main');
const errorEl = document.getElementById('series-error');

let currentGroup = null;

let editionShareGlobalListenersBound = false;

function closeAllEditionShareMenus() {
  document.querySelectorAll('.edition-share-menu').forEach((m) => m.classList.add('hidden'));
  document.querySelectorAll('.edition-share-trigger').forEach((t) => t.setAttribute('aria-expanded', 'false'));
}

function bindEditionShareGlobalListenersOnce() {
  if (editionShareGlobalListenersBound) return;
  editionShareGlobalListenersBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('.edition-share-trigger') || e.target.closest('.edition-share-menu')) return;
    closeAllEditionShareMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllEditionShareMenus();
  });
}

/**
 * @param {HTMLElement} card
 * @param {object} ed — edition row from group
 * @param {object} group — series group (publisherName, seriesTitle)
 */
function wireEditionShareMenu(card, ed, group) {
  bindEditionShareGlobalListenersOnce();
  const trigger = card.querySelector('.edition-share-trigger');
  const menu = card.querySelector('.edition-share-menu');
  const deviceBtn = card.querySelector('.edition-share-device');
  const copyBtn = card.querySelector('.edition-share-copy');
  const copyLabel = card.querySelector('.edition-share-copy-label');
  if (!trigger || !menu || !copyBtn) return;

  const shareUrl = () => buildEditionDeepLink(ed.id, getSeriesCanonicalIdForPublication(ed));
  const title = ed.title || 'Edition';
  const text = `${title}${group.publisherName ? ` — ${group.publisherName}` : ''}`;

  const closeMenu = () => {
    menu.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
  };

  let deviceAvailable = typeof navigator.share === 'function';
  if (deviceAvailable && typeof navigator.canShare === 'function') {
    try {
      deviceAvailable = navigator.canShare({ url: shareUrl() });
    } catch {
      deviceAvailable = false;
    }
  }
  if (deviceBtn) {
    if (deviceAvailable) {
      deviceBtn.classList.remove('hidden');
      copyBtn.classList.add(
        'border-t',
        'border-slate-100',
        'dark:border-slate-700/80'
      );
      deviceBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.share({ title, text, url: shareUrl() });
          closeMenu();
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      });
    } else {
      deviceBtn.classList.add('hidden');
    }
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasHidden = menu.classList.contains('hidden');
    closeAllEditionShareMenus();
    if (wasHidden) {
      menu.classList.remove('hidden');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const label = copyLabel || copyBtn;
    const original = label.textContent;
    try {
      await navigator.clipboard.writeText(shareUrl());
      label.textContent = 'Link copied';
      setTimeout(() => {
        label.textContent = original;
        closeMenu();
      }, 1200);
    } catch {
      label.textContent = 'Copy failed';
      setTimeout(() => {
        label.textContent = original;
      }, 2000);
    }
  });
}

function editionToReaderPub(ed) {
  return {
    id: ed.id,
    title: ed.title,
    description: ed.description,
    pdf_url: ed.pdf_url,
    cover_url: ed.cover_url,
    created_at: ed.created_at,
    issue_date: ed.issue_date,
    series_title: ed.series_title ?? null
  };
}

function renderEditions(group) {
  if (!editionsGrid) return;
  editionsGrid.innerHTML = '';
  const total = group.editions.length;
  group.editions.forEach((ed, i) => {
    const vol = total - i;
    const card = document.createElement('article');
    card.className =
      'edition-card group flex flex-col bg-white dark:bg-[#182430] rounded-xl border border-slate-200 dark:border-slate-800 transition-colors hover:border-primary/50 cursor-pointer';
    const sizesEd = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
    const img =
      ed.cover_url || ed.cover_thumb_url
        ? buildCoverImgHtml(ed.cover_url || '', ed.cover_thumb_url || '', sizesEd, 'book-cover w-full h-full object-cover', 'lazy', null)
        : `<div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-xs font-bold text-primary">PDF</div>`;
    card.innerHTML = `
      <div class="relative aspect-[3/4] bg-gray-200 dark:bg-gray-800 overflow-hidden">
        ${img}
        <div class="absolute top-3 right-3">
          <span class="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-bold rounded">VOL ${vol}</span>
        </div>
      </div>
      <div class="p-5 flex-1 flex flex-col">
        <div class="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
          ${pubIcon('calendar_today', 'text-sm mr-1')}
          ${escapeHtml(formatDate(ed.issue_date || ed.created_at) || 'Edition')}
        </div>
        <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1 group-hover:text-primary transition-colors line-clamp-2">${escapeHtml(ed.title || 'Edition')}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 flex-1">${escapeHtml(ed.description || '')}</p>
        <div class="flex items-center gap-3 mt-auto">
          <button type="button" class="series-read-btn flex-1 border border-primary/50 bg-blue-50 text-blue-950 hover:bg-primary hover:text-white hover:border-primary dark:bg-primary/15 dark:text-sky-100 dark:border-primary/40 dark:hover:border-primary font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
            ${pubIcon('auto_stories', 'text-base')}
            Read now
          </button>
          <div class="relative shrink-0">
            <button type="button" class="edition-share-trigger p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors" aria-expanded="false" aria-haspopup="true" title="Share this edition">
              ${pubIcon('share', 'text-xl')}
            </button>
            <div class="edition-share-menu hidden absolute bottom-full right-0 mb-1 z-40 min-w-[13rem] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark shadow-xl py-1.5 overflow-hidden" role="menu" aria-label="Share edition">
              <button type="button" class="edition-share-device hidden w-full text-left px-4 py-3 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-2" role="menuitem">
                ${pubIcon('send', 'text-lg text-primary')}
                <span>Share via device…</span>
              </button>
              <button type="button" class="edition-share-copy w-full text-left px-4 py-3 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-2" role="menuitem">
                ${pubIcon('link', 'text-lg text-slate-500 dark:text-slate-400')}
                <span class="edition-share-copy-label">Copy link</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    const readBtn = card.querySelector('.series-read-btn');
    readBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openReader(editionToReaderPub(ed));
    });
    wireEditionShareMenu(card, ed, group);
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (e.target.closest('.edition-share-menu')) return;
      openReader(editionToReaderPub(ed));
    });
    editionsGrid.appendChild(card);
  });
  wireCoverImgReveal(editionsGrid);
}

function getSeriesPageShareUrl() {
  const u = new URL(window.location.href);
  u.hash = '';
  return u.toString();
}

function setupSeriesShare(group) {
  const btn = document.getElementById('series-hero-share');
  const menu = document.getElementById('series-share-menu');
  const deviceBtn = document.getElementById('series-share-device');
  const copyBtn = document.getElementById('series-share-copy');
  const copyLabel = document.getElementById('series-share-copy-label');
  if (!btn || !menu || !copyBtn) return;

  const url = getSeriesPageShareUrl();
  const title = group.seriesTitle || 'Publication';
  const text = `${title}${group.publisherName ? ` — ${group.publisherName}` : ''}`;

  const closeMenu = () => {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  };

  let deviceAvailable = typeof navigator.share === 'function';
  if (deviceAvailable && typeof navigator.canShare === 'function') {
    try {
      deviceAvailable = navigator.canShare({ url });
    } catch {
      deviceAvailable = false;
    }
  }
  if (deviceBtn) {
    if (deviceAvailable) {
      deviceBtn.classList.remove('hidden');
      copyBtn.classList.add(
        'border-t',
        'border-slate-100',
        'dark:border-slate-700/80'
      );
      deviceBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.share({ title, text, url });
          closeMenu();
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      });
    } else {
      deviceBtn.classList.add('hidden');
    }
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) openMenu();
    else closeMenu();
  });

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const label = copyLabel || copyBtn;
    const original = label.textContent;
    try {
      await navigator.clipboard.writeText(url);
      label.textContent = 'Link copied';
      setTimeout(() => {
        label.textContent = original;
        closeMenu();
      }, 1200);
    } catch {
      label.textContent = 'Copy failed';
      setTimeout(() => {
        label.textContent = original;
      }, 2000);
    }
  });

  document.addEventListener('click', (e) => {
    if (menu.classList.contains('hidden')) return;
    if (btn.contains(e.target) || menu.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

function fillHero(group) {
  if (heroTitle) heroTitle.textContent = group.seriesTitle;
  if (heroDesc) {
    heroDesc.textContent =
      group.description ||
      `Digital editions from ${group.publisherName || 'this publisher'}. Pick an issue below or read the latest.`;
  }
  if (heroCover) {
    if (group.coverUrl || group.coverThumbUrl) {
      heroCover.innerHTML = buildCoverImgHtml(
        group.coverUrl || '',
        group.coverThumbUrl || '',
        'min(100vw, 36rem)',
        'w-full h-full object-cover',
        'eager',
        'high'
      );
      wireCoverImgReveal(heroCover);
      heroCover.classList.remove('bg-gradient-to-br', 'from-primary/20', 'to-blue-600/10');
    } else {
      heroCover.innerHTML = '';
      heroCover.classList.add('bg-gradient-to-br', 'from-primary/20', 'to-blue-600/10');
    }
  }
  if (heroBadgePublisher) {
    heroBadgePublisher.textContent = group.publisherName || 'Publication';
  }
  if (heroBadgeFrequency) {
    const fLabel = seriesFrequencyLabel(group.frequency);
    if (fLabel) {
      heroBadgeFrequency.textContent = fLabel;
      heroBadgeFrequency.classList.remove('hidden');
    } else {
      heroBadgeFrequency.textContent = '';
      heroBadgeFrequency.classList.add('hidden');
    }
  }
  if (heroBadgeCount) {
    heroBadgeCount.textContent = `${group.editionCount} edition${group.editionCount === 1 ? '' : 's'}`;
  }
  if (heroBadgeUpdated && group.latestEdition) {
    const latestWhen = formatDate(group.latestEdition.issue_date || group.latestEdition.created_at);
    if (latestWhen) heroBadgeUpdated.textContent = `Latest Issue · ${latestWhen}`;
  }
  if (editionsCount) editionsCount.textContent = String(group.editionCount);
}

function wireReaderChrome() {
  const onClick = (id, method) => {
    document.getElementById(id)?.addEventListener('click', () => {
      void getViewerModule().then((m) => m[method]());
    });
  };
  onClick('reader-prev', 'flipPrev');
  onClick('reader-next', 'flipNext');
  onClick('reader-first', 'flipFirst');
  onClick('reader-last', 'flipLast');
  onClick('reader-zoom-in', 'zoomIn');
  onClick('reader-zoom-out', 'zoomOut');
  onClick('reader-close', 'closeReader');
  onClick('reader-fit-reset', 'resetReaderZoom');
  onClick('reader-fullscreen', 'readerToggleFullscreen');
  document.getElementById('reader-page-jump-go')?.addEventListener('click', () => {
    void getViewerModule().then((m) => m.readerSubmitPageJump());
  });
  document.getElementById('reader-page-jump')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void getViewerModule().then((m) => m.readerSubmitPageJump());
    }
  });
}

/** When reader opens from hash on index, we stay on series page — resolve edition from current group. */
function resolveEditionFromHash(ref) {
  if (!currentGroup?.editions?.length) return null;
  const ed = currentGroup.editions.find(
    (e) => e.id === ref || (e.slug && String(e.slug) === ref)
  );
  return ed ? editionToReaderPub(ed) : null;
}

async function main() {
  wireReaderChrome();

  if (!seriesCanonicalId) {
    notFound?.classList.remove('hidden');
    mainContent?.classList.add('hidden');
    return;
  }

  const [catRes, seriesRes] = await Promise.all([
    fetchPublishedCatalog(),
    fetchPublishedSeriesMap()
  ]);
  const { data, error } = catRes;
  const seriesMap = seriesRes.data && !seriesRes.error ? seriesRes.data : {};
  if (error) {
    if (errorEl) {
      errorEl.textContent = error.message || 'Failed to load catalog';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  const groups = groupEditionsIntoSeries(data || [], seriesMap);
  const group = findSeriesGroup(groups, seriesCanonicalId);
  if (!group) {
    notFound?.classList.remove('hidden');
    mainContent?.classList.add('hidden');
    return;
  }

  currentGroup = group;
  notFound?.classList.add('hidden');
  mainContent?.classList.remove('hidden');

  fillHero(group);
  setupSeriesShare(group);
  renderEditions(group);

  btnReadLatest?.addEventListener('click', () => {
    if (group.latestEdition) openReader(editionToReaderPub(group.latestEdition));
  });

  window.addEventListener('hashchange', () => {
    void getViewerModule().then((m) =>
      m.tryOpenReaderFromHash((r) => resolveEditionFromHash(r))
    );
  });

  if (readEditionRefFromHash()) {
    void getViewerModule().then((m) =>
      m.tryOpenReaderFromHash((r) => resolveEditionFromHash(r))
    );
  }
}

main();
