/**
 * Public URL contract (static hosting).
 * - Reader deep link: hash `#/r/<editionRef>` (short). Legacy `#/read/<editionRef>` still parsed.
 * - Publication page: `publication?s=<canonicalId>` (pretty path; file is `publication.html`). Legacy `?series=` and `?id=` still read.
 */

/** Path segment for the series shell (no `.html` — Netlify serves `publication.html`). */
export const PUBLICATION_PAGE_PATH = 'publication';

/** Short query key for series / publication shell (canonical id). */
export const SERIES_QUERY_PARAM = 's';
/** @deprecated Prefer `s`. */
export const SERIES_QUERY_PARAM_LEGACY_SERIES = 'series';
/** @deprecated Legacy alias. */
export const SERIES_QUERY_PARAM_LEGACY = 'id';

/** New short reader path segment (hash). Legacy: `read`. */
export const READ_HASH_SEGMENT = 'r';
export const READ_HASH_SEGMENT_LEGACY = 'read';

/** Hash fragment for opening the reader (edition id or slug, encoded). */
export function formatReadLocationHash(editionRef) {
  const ref = editionRef != null ? String(editionRef).trim() : '';
  if (!ref) return '';
  return `#/${READ_HASH_SEGMENT}/${encodeURIComponent(ref)}`;
}

/** True if hash opens the reader (short or legacy). */
export function isReaderLocationHash(hash) {
  return /^#\/?(r|read)\//i.test(hash || '');
}

/**
 * Parse edition ref from location hash (`#/r/…` or `#/read/…`).
 * @param {string} hash — e.g. `location.hash`
 */
export function parseReadRefFromHash(hash) {
  const h = hash || '';
  const short = new RegExp(`^#/?${READ_HASH_SEGMENT}/([^?#]+)/?$`, 'i').exec(h);
  if (short) return decodeURIComponent(short[1].trim());
  const leg = new RegExp(`^#/?${READ_HASH_SEGMENT_LEGACY}/([^?#]+)/?$`, 'i').exec(h);
  if (leg) return decodeURIComponent(leg[1].trim());
  return null;
}

export function getSeriesCanonicalIdFromSearchParams(params) {
  const v =
    params.get(SERIES_QUERY_PARAM) ??
    params.get(SERIES_QUERY_PARAM_LEGACY_SERIES) ??
    params.get(SERIES_QUERY_PARAM_LEGACY);
  return v != null && String(v).trim() ? String(v).trim() : null;
}

/**
 * RTDB catalog card → publication shell `?s=` value (same rules as `catalog-series.js` grouping).
 * @param {{ id?: string, series_id?: string | null } | null | undefined} pub
 */
export function getSeriesCanonicalIdForPublication(pub) {
  if (!pub?.id) return '';
  const sid = pub.series_id != null && String(pub.series_id).trim();
  if (sid) return String(pub.series_id).trim();
  return String(pub.id).trim();
}

/** Relative navigation target from the site root (same directory as index.html). */
export function buildSeriesPagePath(canonicalId) {
  const id = canonicalId != null ? String(canonicalId).trim() : '';
  if (!id) return PUBLICATION_PAGE_PATH;
  return `${PUBLICATION_PAGE_PATH}?${SERIES_QUERY_PARAM}=${encodeURIComponent(id)}`;
}

/**
 * Canonical read URL: publication shell + reader hash (explore + shares).
 * Standalone editions use `?s=<editionId>` (same as `catalog-series.js` single-group key).
 * @param {string} editionId
 * @param {string | null | undefined} seriesCanonicalId — pass `getSeriesCanonicalIdForPublication(pub)`; if empty, falls back to `editionId`.
 */
export function buildEditionDeepLink(editionId, seriesCanonicalId) {
  const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
  const eid = editionId != null ? String(editionId).trim() : '';
  if (!eid) {
    const u = new URL(PUBLICATION_PAGE_PATH, base);
    return u.href;
  }
  const sidRaw = seriesCanonicalId != null && String(seriesCanonicalId).trim()
    ? String(seriesCanonicalId).trim()
    : '';
  const sid = sidRaw || eid;
  const u = new URL(PUBLICATION_PAGE_PATH, base);
  u.searchParams.set(SERIES_QUERY_PARAM, sid);
  u.hash = formatReadLocationHash(eid);
  return u.href;
}
