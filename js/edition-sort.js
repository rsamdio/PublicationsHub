/**
 * Edition ordering for UI: newest first by calendar issue date, then upload/created time.
 */

/** ISO-ish string for sorting, or '' if neither date is set. */
export function editionPrimaryDateKey(ed) {
  if (!ed || typeof ed !== 'object') return '';
  const i = ed.issue_date != null && String(ed.issue_date).trim();
  if (i) return String(i).trim();
  const c = ed.created_at != null && String(ed.created_at).trim();
  return c ? String(c).trim() : '';
}

/**
 * Sort comparator: newer issues first; editions with no dates sort last; stable tie-break on id.
 * @param {object} a
 * @param {object} b
 */
export function compareEditionsNewestFirst(a, b) {
  const ka = editionPrimaryDateKey(a);
  const kb = editionPrimaryDateKey(b);
  if (!ka && !kb) return String(a.id || '').localeCompare(String(b.id || ''));
  if (!ka) return 1;
  if (!kb) return -1;
  const c = kb.localeCompare(ka);
  if (c !== 0) return c;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

/** @param {object[]} arr */
export function sortEditionsNewestFirstInPlace(arr) {
  if (!arr?.length) return arr;
  arr.sort(compareEditionsNewestFirst);
  return arr;
}
