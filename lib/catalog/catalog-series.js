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
    const seriesFull = catalogSeries?.cover_url ? String(catalogSeries.cover_url).trim() : '';
    const seriesThumb = catalogSeries?.cover_thumb_url
      ? String(catalogSeries.cover_thumb_url).trim()
      : '';
    const edFull = g.editions.find((e) => e.cover_url)?.cover_url || g.latestEdition?.cover_url || '';
    const edThumb =
      g.editions.find((e) => e.cover_thumb_url)?.cover_thumb_url ||
      g.latestEdition?.cover_thumb_url ||
      '';
    // Never mix series + edition covers: CoverImage uses thumb as `src`, so a missing
    // series thumb previously showed the latest edition cover over the series art.
    if (seriesFull || seriesThumb) {
      g.coverUrl = seriesFull || seriesThumb;
      g.coverThumbUrl = seriesThumb || seriesFull;
    } else {
      g.coverUrl = edFull || '';
      g.coverThumbUrl = edThumb || edFull || '';
    }
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
    if (g.seriesId && catalogSeries?.publisher_name) {
      g.publisherName = String(catalogSeries.publisher_name).trim();
    }
    g.slug = catalogSeries?.slug || null;
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

/**
 * Directly construct a single series group in O(1) without iterating and sorting the whole platform catalog.
 * @param {string} canonicalId
 * @param {string | null} seriesId
 * @param {object | null} seriesDoc
 * @param {Array<object>} editions
 */
export function buildSingleSeriesGroup(canonicalId, seriesId, seriesDoc, editions) {
  const sortedEditions = editions ? [...editions] : [];
  sortEditionsNewestFirstInPlace(sortedEditions);
  const latestEdition = sortedEditions[0] || null;

  const seriesFull = seriesDoc?.cover_url ? String(seriesDoc.cover_url).trim() : '';
  const seriesThumb = seriesDoc?.cover_thumb_url ? String(seriesDoc.cover_thumb_url).trim() : '';
  const edFull = sortedEditions.find((e) => e.cover_url)?.cover_url || latestEdition?.cover_url || '';
  const edThumb = sortedEditions.find((e) => e.cover_thumb_url)?.cover_thumb_url || latestEdition?.cover_thumb_url || '';

  let coverUrl = '';
  let coverThumbUrl = '';
  if (seriesFull || seriesThumb) {
    coverUrl = seriesFull || seriesThumb;
    coverThumbUrl = seriesThumb || seriesFull;
  } else {
    coverUrl = edFull || '';
    coverThumbUrl = edThumb || edFull || '';
  }

  const seriesTitle = seriesId && seriesDoc?.title
    ? String(seriesDoc.title).trim()
    : (latestEdition?.series_title || latestEdition?.title || (seriesId ? 'Series' : 'Publication')).trim();

  const description =
    (seriesDoc?.description && String(seriesDoc.description).trim()) ||
    pickBestDescription(sortedEditions);

  const frequency =
    seriesId && seriesDoc?.frequency != null && String(seriesDoc.frequency).trim()
      ? String(seriesDoc.frequency).trim()
      : '';

  const publisherName =
    (seriesId && seriesDoc?.publisher_name ? String(seriesDoc.publisher_name).trim() : '') ||
    (latestEdition?.publisher_name ? String(latestEdition.publisher_name).trim() : '');

  const group = {
    canonicalId,
    seriesId,
    seriesTitle,
    publisherId: seriesDoc?.publisher_id || latestEdition?.publisher_id || null,
    publisherName,
    editions: sortedEditions,
    editionCount: sortedEditions.length,
    latestEdition,
    coverUrl,
    coverThumbUrl,
    description,
    frequency,
    slug: seriesDoc?.slug || latestEdition?.slug || null,
    lastActivityIso: ''
  };
  group.lastActivityIso = seriesActivityTimestamp(group);
  return group;
}

