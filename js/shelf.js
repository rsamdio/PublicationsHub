/**
 * Public library (index.html): featured editions row + grid of publication series (grouped catalog).
 */
import { fetchPublishedCatalog, fetchPublishedSeriesMap } from './db-public.js';
import { groupEditionsIntoSeries } from './catalog-series.js';
import {
  buildEditionDeepLink,
  buildSeriesPagePath,
  getSeriesCanonicalIdForPublication
} from './url-routes.js';
import { readEditionRefFromHash } from './url-routes.js';
import { buildCoverImgHtml, wireCoverImgReveal } from './cover-markup.js';
import { pubIcon } from './icons-public.js';
import { seriesFrequencyBadgeAttrs, seriesFrequencyLabel } from './frequency-label.js';
import { sortEditionsNewestFirstInPlace } from './edition-sort.js';

let allPublications = [];

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

function openExplorePublication(pub) {
  if (!pub?.id) return;
  window.location.assign(
    buildEditionDeepLink(pub.id, getSeriesCanonicalIdForPublication(pub))
  );
}

function wireOpenReader(el, pub) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('a[href]')) return;
    if (e.target.closest('.shelf-edition-share-trigger') || e.target.closest('.shelf-edition-share-menu')) {
      return;
    }
    openExplorePublication(pub);
  });
}

let shelfShareGlobalListenersBound = false;

function closeAllShelfShareMenus() {
  document.querySelectorAll('.shelf-edition-share-menu, .shelf-series-share-menu').forEach((m) => m.classList.add('hidden'));
  document.querySelectorAll('.shelf-edition-share-trigger, .shelf-series-share-trigger').forEach((t) =>
    t.setAttribute('aria-expanded', 'false')
  );
}

function bindShelfShareGlobalListenersOnce() {
  if (shelfShareGlobalListenersBound) return;
  shelfShareGlobalListenersBound = true;
  document.addEventListener('click', (e) => {
    if (
      e.target.closest('.shelf-edition-share-trigger') ||
      e.target.closest('.shelf-edition-share-menu') ||
      e.target.closest('.shelf-series-share-trigger') ||
      e.target.closest('.shelf-series-share-menu')
    ) {
      return;
    }
    closeAllShelfShareMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllShelfShareMenus();
  });
}

/**
 * @param {HTMLElement} card
 * @param {object} pub — catalog edition from `fetchPublishedCatalog`
 */
function wireShelfEditionShare(card, pub) {
  bindShelfShareGlobalListenersOnce();
  const trigger = card.querySelector('.shelf-edition-share-trigger');
  const menu = card.querySelector('.shelf-edition-share-menu');
  const deviceBtn = card.querySelector('.shelf-edition-share-device');
  const copyBtn = card.querySelector('.shelf-edition-share-copy');
  const copyLabel = card.querySelector('.shelf-edition-share-copy-label');
  if (!trigger || !menu || !copyBtn) return;

  const shareUrl = () => buildEditionDeepLink(pub.id, getSeriesCanonicalIdForPublication(pub));
  const title = pub.title || 'Edition';
  const text = `${title}${pub.publisher_name ? ` — ${pub.publisher_name}` : ''}`;

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
    closeAllShelfShareMenus();
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

/** @param {object} group — series row from `groupEditionsIntoSeries` */
function wireShelfSeriesShare(card, group) {
  bindShelfShareGlobalListenersOnce();
  const trigger = card.querySelector('.shelf-series-share-trigger');
  const menu = card.querySelector('.shelf-series-share-menu');
  const deviceBtn = card.querySelector('.shelf-series-share-device');
  const copyBtn = card.querySelector('.shelf-series-share-copy');
  const copyLabel = card.querySelector('.shelf-series-share-copy-label');
  if (!trigger || !menu || !copyBtn) return;

  const shareUrl = () => new URL(buildSeriesPagePath(group.canonicalId), window.location.href).href;
  const title = group.seriesTitle || 'Publication';
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
    closeAllShelfShareMenus();
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

function wireShelfSeriesCard(card, group) {
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (e.target.closest('.shelf-series-share-menu')) return;
    window.location.assign(buildSeriesPagePath(group.canonicalId));
  });
  const openBtn = card.querySelector('.shelf-series-open-btn');
  openBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.assign(buildSeriesPagePath(group.canonicalId));
  });
}

function renderPublicationSeriesGrid(container, groups) {
  if (!container) return;
  container.innerHTML = '';
  groups.forEach((s) => {
    const card = document.createElement('article');
    card.className =
      'edition-card group flex flex-col bg-white dark:bg-[#182430] rounded-xl border border-slate-200 dark:border-slate-800 transition-colors hover:border-primary/50 cursor-pointer';
    const freqSearch = seriesFrequencyLabel(s.frequency) || String(s.frequency || '').trim();
    card.setAttribute(
      'data-shelf-filter',
      `${s.seriesTitle} ${s.publisherName} ${s.description || ''} ${freqSearch}`.toLowerCase()
    );
    const coverFull = s.coverUrl || '';
    const coverThumb = s.coverThumbUrl || '';
    const sizesGrid = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 34vw, 25vw';
    const img =
      coverFull || coverThumb
        ? buildCoverImgHtml(coverFull, coverThumb, sizesGrid, 'book-cover w-full h-full object-cover', 'lazy', null)
        : `<div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-500 font-display font-bold">PDF</div>`;
    const updatedIso = s.lastActivityIso || '';
    const freqBadge = seriesFrequencyBadgeAttrs(s.frequency, { compact: true });
    card.innerHTML = `
      <div class="relative aspect-[3/4] bg-gray-200 dark:bg-gray-800 overflow-hidden">
        ${img}
        <div class="absolute top-3 right-3">
          <span class="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-bold rounded">${s.editionCount} edition${s.editionCount === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="p-5 flex-1 flex flex-col">
        <div class="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
          ${pubIcon('new_releases', 'text-sm mr-1')}
          ${escapeHtml(updatedIso ? `Latest Issue · ${formatDate(updatedIso)}` : 'Latest Issue')}
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-1 line-clamp-1">${escapeHtml(s.publisherName || 'Publisher')}</p>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-1 group-hover:text-primary transition-colors line-clamp-2">${escapeHtml(s.seriesTitle)}</h3>
        <span class="${freqBadge.className}">${escapeHtml(freqBadge.text)}</span>
        <div class="flex-1"></div>
        <div class="flex items-center gap-3 mt-auto">
          <button type="button" class="shelf-series-open-btn flex-1 border border-primary/50 bg-blue-50 text-blue-950 hover:bg-primary hover:text-white hover:border-primary dark:bg-primary/15 dark:text-sky-100 dark:border-primary/40 dark:hover:border-primary font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
            ${pubIcon('library_books', 'text-base')}
            Open publication
          </button>
          <div class="relative shrink-0">
            <button type="button" class="shelf-series-share-trigger p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors" aria-expanded="false" aria-haspopup="true" title="Share this publication">
              ${pubIcon('share', 'text-xl')}
            </button>
            <div class="shelf-series-share-menu hidden absolute bottom-full right-0 mb-1 z-40 min-w-[13rem] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#182430] shadow-xl py-1.5 overflow-hidden" role="menu" aria-label="Share publication">
              <button type="button" class="shelf-series-share-device hidden w-full text-left px-4 py-3 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-2" role="menuitem">
                ${pubIcon('send', 'text-lg text-primary')}
                <span>Share via device…</span>
              </button>
              <button type="button" class="shelf-series-share-copy w-full text-left px-4 py-3 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-2" role="menuitem">
                ${pubIcon('link', 'text-lg text-slate-500 dark:text-slate-400')}
                <span class="shelf-series-share-copy-label">Copy link</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    wireShelfSeriesShare(card, s);
    wireShelfSeriesCard(card, s);
    container.appendChild(card);
  });
  wireCoverImgReveal(container);
}

function renderFeaturedGrid(container, pubs) {
  if (!container) return;
  container.innerHTML = '';
  pubs.forEach((pub, idx) => {
    const card = document.createElement('article');
    card.className =
      'group relative flex flex-col cursor-pointer edition-card';
    card.setAttribute('data-publication-id', pub.id);
    card.setAttribute(
      'data-title',
      `${pub.title || ''} ${pub.publisher_name || ''} ${pub.series_title || ''}`.toLowerCase()
    );
    const coverFull = pub.cover_url || '';
    const coverThumb = pub.cover_thumb_url || '';
    const badgeLabel = (pub.publisher_name || '').trim() || 'Publisher';
    const seriesLine = (pub.series_title || '').trim() || '—';
    const eagerFeatured = idx < 6;
    const sizesFeat = '(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw';
    const coverInner =
      coverFull || coverThumb
        ? buildCoverImgHtml(
            coverFull,
            coverThumb,
            sizesFeat,
            'w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105',
            eagerFeatured ? 'eager' : 'lazy',
            eagerFeatured && idx === 0 ? 'high' : null
          )
        : `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-blue-600/20 text-slate-400 font-bold text-sm">PDF</div>`;
    card.innerHTML = `
      <div class="aspect-[3/4] rounded-lg overflow-hidden bg-surface-dark relative shadow-lg shadow-black/20 group-hover:shadow-primary/20 group-hover:shadow-2xl transition-all duration-300 transform group-hover:-translate-y-1 book-cover border border-slate-800">
        ${coverInner}
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 pointer-events-none"></div>
        <div class="absolute bottom-3 left-3 right-3 pointer-events-none">
          <span class="inline-block max-w-full px-2 py-0.5 rounded bg-primary/90 text-white text-[10px] font-semibold leading-tight line-clamp-2 text-left">${escapeHtml(badgeLabel)}</span>
        </div>
        <div class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-r from-white/20 to-transparent pointer-events-none"></div>
      </div>
      <div class="mt-3">
        <h3 class="text-base font-semibold text-slate-900 dark:text-white leading-tight group-hover:text-primary transition-colors line-clamp-2">${escapeHtml(pub.title)}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">${escapeHtml(seriesLine)}</p>
      </div>`;
    wireOpenReader(card, pub);
    container.appendChild(card);
  });
  wireCoverImgReveal(container);
}

function renderEditionGrid(container, pubs, options = {}) {
  if (!container) return;
  const compact = options.compact;
  container.innerHTML = '';
  const sorted = pubs.length ? sortEditionsNewestFirstInPlace([...pubs]) : [];
  sorted.forEach((pub, i) => {
    const card = document.createElement('article');
    card.className = compact
      ? 'edition-card group flex flex-col bg-white dark:bg-[#182430] rounded-xl border border-slate-200 dark:border-slate-800 transition-colors hover:border-primary/50 cursor-pointer'
      : 'edition-card group flex flex-col bg-white dark:bg-[#182430] rounded-xl border border-slate-200 dark:border-slate-800 transition-colors hover:border-primary/50 cursor-pointer';
    card.setAttribute('data-publication-id', pub.id);
    card.setAttribute(
      'data-title',
      `${pub.title || ''} ${pub.publisher_name || ''} ${pub.series_title || ''}`.toLowerCase()
    );
    const coverFull = pub.cover_url || '';
    const coverThumb = pub.cover_thumb_url || '';
    const vol = String(sorted.length - i);
    const sizesDash = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw';
    const img =
      coverFull || coverThumb
        ? buildCoverImgHtml(coverFull, coverThumb, sizesDash, 'book-cover w-full h-full object-cover', 'lazy', null)
        : `<div class="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-500 font-display font-bold">PDF</div>`;
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
          ${escapeHtml(formatDate(pub.issue_date || pub.created_at) || 'Edition')}
        </div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-1 group-hover:text-primary transition-colors line-clamp-2">${escapeHtml(pub.title)}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 flex-1">${escapeHtml(pub.publisher_name ? `${pub.publisher_name}${pub.series_title ? ` · ${pub.series_title}` : ''}` : pub.description || '')}</p>
        <div class="flex items-center gap-3 mt-auto">
          <button type="button" class="flex-1 border border-primary/50 bg-blue-50 text-blue-950 hover:bg-primary hover:text-white hover:border-primary dark:bg-primary/15 dark:text-sky-100 dark:border-primary/40 dark:hover:border-primary font-medium py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
            ${pubIcon('auto_stories', 'text-base')}
            Read
          </button>
          <div class="relative shrink-0">
            <button type="button" class="shelf-edition-share-trigger p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors" aria-expanded="false" aria-haspopup="true" title="Share this edition">
              ${pubIcon('share', 'text-xl')}
            </button>
            <div class="shelf-edition-share-menu hidden absolute bottom-full right-0 mb-1 z-40 min-w-[13rem] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#182430] shadow-xl py-1.5 overflow-hidden" role="menu" aria-label="Share edition">
              <button type="button" class="shelf-edition-share-device hidden w-full text-left px-4 py-3 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-2" role="menuitem">
                ${pubIcon('send', 'text-lg text-primary')}
                <span>Share via device…</span>
              </button>
              <button type="button" class="shelf-edition-share-copy w-full text-left px-4 py-3 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-2" role="menuitem">
                ${pubIcon('link', 'text-lg text-slate-500 dark:text-slate-400')}
                <span class="shelf-edition-share-copy-label">Copy link</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    wireShelfEditionShare(card, pub);
    wireOpenReader(card, pub);
    container.appendChild(card);
  });
  wireCoverImgReveal(container);
}

function filterGrid(query) {
  const q = (query || '').trim().toLowerCase();
  const grid = document.getElementById('shelf-grid');
  if (!grid) return;
  grid.querySelectorAll('[data-shelf-filter]').forEach((el) => {
    const key = el.getAttribute('data-shelf-filter') || '';
    el.classList.toggle('hidden', !!(q && !key.includes(q)));
  });
}

function setLibraryEmpty(visible) {
  document.getElementById('library-empty-state')?.classList.toggle('hidden', !visible);
  document.getElementById('library-content')?.classList.toggle('hidden', visible);
}

function updateDashboardStats(count) {
  const el = document.getElementById('stat-publication-count');
  if (el) el.textContent = String(count);
}

const SKELETON_SHELF_COUNT = 8;
const SKELETON_FEATURED_COUNT = 5;

function shelfSkeletonSeriesCard() {
  return `<article class="shelf-skeleton-card pointer-events-none animate-pulse rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#182430] overflow-hidden" aria-hidden="true">
    <div class="aspect-[3/4] bg-slate-200 dark:bg-slate-700/70"></div>
    <div class="p-5 space-y-3">
      <div class="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700"></div>
      <div class="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700"></div>
      <div class="h-5 w-4/5 rounded bg-slate-200 dark:bg-slate-700"></div>
      <div class="h-10 w-full rounded-lg bg-slate-200 dark:bg-slate-700 mt-4"></div>
    </div>
  </article>`;
}

function shelfSkeletonFeaturedCard() {
  return `<article class="shelf-skeleton-card pointer-events-none animate-pulse" aria-hidden="true">
    <div class="aspect-[3/4] rounded-lg bg-slate-200 dark:bg-slate-700/70 border border-slate-800"></div>
    <div class="mt-3 space-y-2">
      <div class="h-4 w-full rounded bg-slate-200 dark:bg-slate-700"></div>
      <div class="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700"></div>
    </div>
  </article>`;
}

/** Placeholder cards while catalog fetch runs (homepage only — grids exist in DOM). */
function injectLibraryLoadingSkeletons(featuredSection, featuredEl, shelfGrid) {
  if (!shelfGrid) return;
  shelfGrid.innerHTML = Array.from({ length: SKELETON_SHELF_COUNT }, () => shelfSkeletonSeriesCard()).join('');
  shelfGrid.setAttribute('aria-busy', 'true');
  if (featuredSection && featuredEl) {
    featuredSection.classList.remove('hidden');
    featuredEl.innerHTML = Array.from({ length: SKELETON_FEATURED_COUNT }, () => shelfSkeletonFeaturedCard()).join('');
    featuredEl.setAttribute('aria-busy', 'true');
  }
  const badge = document.getElementById('edition-count-badge');
  if (badge) badge.textContent = '…';
}

export async function renderShelf() {
  const featuredSection = document.getElementById('featured-section');
  const featuredEl = document.getElementById('featured-grid');
  const shelfGrid = document.getElementById('shelf-grid');
  const dashGrid = document.getElementById('dashboard-publications');
  const emptyLib = document.getElementById('library-empty-state');
  const libContent = document.getElementById('library-content');
  const shelfError = document.getElementById('shelf-error');

  if (shelfError) {
    shelfError.textContent = '';
    shelfError.classList.add('hidden');
  }

  injectLibraryLoadingSkeletons(featuredSection, featuredEl, shelfGrid);

  const [catRes, seriesRes] = await Promise.all([
    fetchPublishedCatalog(),
    fetchPublishedSeriesMap()
  ]);
  const { data, error } = catRes;
  const seriesMap = seriesRes.data && !seriesRes.error ? seriesRes.data : {};
  if (error) {
    allPublications = [];
    if (shelfGrid) shelfGrid.innerHTML = '';
    shelfGrid?.removeAttribute('aria-busy');
    if (featuredEl) featuredEl.innerHTML = '';
    featuredEl?.removeAttribute('aria-busy');
    document.getElementById('featured-section')?.classList.add('hidden');
    if (shelfError) {
      shelfError.textContent = error.message || 'Failed to load publications';
      shelfError.classList.remove('hidden');
    }
    emptyLib?.classList.add('hidden');
    libContent?.classList.add('hidden');
    const badge = document.getElementById('edition-count-badge');
    if (badge) badge.textContent = '0';
    syncReaderDeepLink();
    return;
  }

  if (!data || data.length === 0) {
    allPublications = [];
    if (featuredEl) featuredEl.innerHTML = '';
    featuredEl?.removeAttribute('aria-busy');
    featuredSection?.classList.add('hidden');
    if (shelfGrid) shelfGrid.innerHTML = '';
    shelfGrid?.removeAttribute('aria-busy');
    if (dashGrid) dashGrid.innerHTML = '';
    setLibraryEmpty(true);
    updateDashboardStats(0);
    const badge = document.getElementById('edition-count-badge');
    if (badge) badge.textContent = '0';
    syncReaderDeepLink();
    return;
  }

  allPublications = data;
  setLibraryEmpty(false);
  updateDashboardStats(data.length);
  const seriesGroups = groupEditionsIntoSeries(data, seriesMap);
  const badge = document.getElementById('edition-count-badge');
  if (badge) badge.textContent = String(seriesGroups.length);

  const featuredPubs = sortEditionsNewestFirstInPlace([...data.filter((p) => p.featured)]);
  if (featuredSection) {
    featuredSection.classList.toggle('hidden', featuredPubs.length === 0);
  }
  renderFeaturedGrid(featuredEl, featuredPubs);
  renderPublicationSeriesGrid(shelfGrid, seriesGroups);
  renderEditionGrid(dashGrid, data, { compact: true });
  shelfGrid?.removeAttribute('aria-busy');
  featuredEl?.removeAttribute('aria-busy');

  const searchInput = document.getElementById('shelf-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = () => filterGrid(searchInput.value);
  }

  await syncReaderDeepLink();
}

export function getPublicationCount() {
  return allPublications.length;
}

/** Resolve reader hash `#/r/<ref>` (legacy `#/read/<ref>`): edition id or optional `slug` from RTDB. */
export function getPublicationByRef(ref) {
  if (!ref) return null;
  return (
    allPublications.find(
      (p) => p.id === ref || (p.slug && String(p.slug) === ref)
    ) ?? null
  );
}

export async function syncReaderDeepLink() {
  const ref = readEditionRefFromHash();
  const readerView = typeof document !== 'undefined' ? document.getElementById('reader-view') : null;
  const readerOpen = readerView && !readerView.classList.contains('hidden');
  if (!ref && !readerOpen) return;

  const viewer = await import('./viewer.js');
  if (!ref) {
    viewer.tryOpenReaderFromHash(() => null);
    return;
  }
  const pub = getPublicationByRef(ref);
  if (!pub) return;

  const target = buildEditionDeepLink(pub.id, getSeriesCanonicalIdForPublication(pub));
  let same = false;
  try {
    const cur = new URL(window.location.href);
    const next = new URL(target);
    same =
      cur.pathname === next.pathname &&
      cur.search === next.search &&
      cur.hash === next.hash;
  } catch (_) {}
  if (same) {
    viewer.tryOpenReaderFromHash((r) => getPublicationByRef(r));
    return;
  }
  window.location.replace(target);
}
