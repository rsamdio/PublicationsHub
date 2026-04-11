/**
 * Group flat published editions (RTDB catalog cards) into series for browse UX.
 * Editions with the same series_id merge; editions without series_id stay as single-item groups keyed by edition id.
 */
import { editionPrimaryDateKey, sortEditionsNewestFirstInPlace } from './edition-sort.js';

/**
 * @param {Array<object>} editions
 * @param {Record<string, { cover_url?: string | null, cover_thumb_url?: string | null, title?: string, description?: string, frequency?: string }> | null} seriesMap from `public/catalog/series`
 */
export function groupEditionsIntoSeries(editions, seriesMap = null) {
  if (!Array.isArray(editions) || editions.length === 0) return [];

  /** @type {Map<string, { canonicalId: string, seriesId: string | null, seriesTitle: string, publisherId: string | null, publisherName: string, editions: typeof editions }>} */
  const map = new Map();

  for (const ed of editions) {
    const sid = ed.series_id != null && String(ed.series_id).trim() ? String(ed.series_id).trim() : null;
    const canonicalId = sid ?? ed.id;
    if (!map.has(canonicalId)) {
      map.set(canonicalId, {
        canonicalId,
        seriesId: sid,
        seriesTitle: sid ? (ed.series_title || ed.title || 'Series').trim() : (ed.title || 'Publication').trim(),
        publisherId: ed.publisher_id ?? null,
        publisherName: (ed.publisher_name || '').trim(),
        editions: []
      });
    }
    const g = map.get(canonicalId);
    g.editions.push(ed);
    if (sid && ed.series_title && String(ed.series_title).trim()) {
      g.seriesTitle = String(ed.series_title).trim();
    }
    if (!g.publisherName && ed.publisher_name) g.publisherName = String(ed.publisher_name).trim();
    if (!g.publisherId && ed.publisher_id) g.publisherId = ed.publisher_id;
  }

  const groups = Array.from(map.values());
  for (const g of groups) {
    sortEditionsNewestFirstInPlace(g.editions);
    g.editionCount = g.editions.length;
    g.latestEdition = g.editions[0];
    const catalogSeries = g.seriesId && seriesMap && seriesMap[g.seriesId] ? seriesMap[g.seriesId] : null;
    const seriesFull = catalogSeries?.cover_url ? String(catalogSeries.cover_url) : '';
    const seriesThumb = catalogSeries?.cover_thumb_url ? String(catalogSeries.cover_thumb_url) : '';
    const edFull = g.editions.find((e) => e.cover_url)?.cover_url || g.latestEdition?.cover_url || '';
    const edThumb = g.editions.find((e) => e.cover_thumb_url)?.cover_thumb_url || g.latestEdition?.cover_thumb_url || '';
    g.coverUrl = seriesFull || edFull || '';
    g.coverThumbUrl = seriesThumb || edThumb || g.coverUrl || '';
    g.description =
      (catalogSeries?.description && String(catalogSeries.description).trim()) ||
      pickBestDescription(g.editions);
    g.frequency =
      g.seriesId && catalogSeries?.frequency != null && String(catalogSeries.frequency).trim()
        ? String(catalogSeries.frequency).trim()
        : '';
    if (g.seriesId && catalogSeries?.title) {
      g.seriesTitle = String(catalogSeries.title).trim();
    }
    g.lastActivityIso = seriesActivityTimestamp(g);
  }

  groups.sort((a, b) => (b.lastActivityIso || '').localeCompare(a.lastActivityIso || ''));

  return groups;
}

/** Latest activity in a series: max of each edition's primary date (issue_date, else created_at). */
function seriesActivityTimestamp(group) {
  let max = '';
  for (const e of group.editions) {
    const s = editionPrimaryDateKey(e);
    if (s && s.localeCompare(max) > 0) max = s;
  }
  if (!max && group.latestEdition) {
    const s = editionPrimaryDateKey(group.latestEdition);
    if (s) max = s;
  }
  return max;
}

function pickBestDescription(editions) {
  const withDesc = editions.filter((e) => e.description && String(e.description).trim());
  if (!withDesc.length) return '';
  withDesc.sort((a, b) => String(b.description).length - String(a.description).length);
  return String(withDesc[0].description).trim();
}

export function findSeriesGroup(groups, canonicalId) {
  if (!canonicalId || !groups?.length) return null;
  const id = String(canonicalId).trim();
  return groups.find((g) => g.canonicalId === id) ?? null;
}
