/**
 * Public catalog reads (Explore / index.html). Realtime Database mirror — no auth.
 */
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { fbRtdb } from './firebase-init.js';
import { sortEditionsNewestFirstInPlace } from './edition-sort.js';

export function mapEditionToCard(id, v) {
  const created_at =
    v.created_at != null ? new Date(typeof v.created_at === 'number' ? v.created_at : 0).toISOString() : null;
  const issue_date =
    v.issue_date != null ? new Date(typeof v.issue_date === 'number' ? v.issue_date : 0).toISOString() : null;
  return {
    id,
    title: v.title,
    description: v.description ?? null,
    pdf_url: v.pdf_url,
    cover_url: v.cover_url ?? null,
    created_at,
    issue_date,
    publisher_id: v.publisher_id ?? null,
    series_id: v.series_id ?? null,
    publisher_name: v.publisher_name ?? null,
    series_title: v.series_title ?? null,
    /** Optional human-readable share segment when mirrored from Firestore (see README). */
    slug: v.slug ?? null,
    /** Set by platform admin; drives Explore featured row. */
    featured: v.featured === true
  };
}

/**
 * Published editions from RTDB mirror, newest first by issue_date then created_at.
 */
export async function fetchPublishedCatalog() {
  try {
    const snap = await get(ref(fbRtdb(), 'public/catalog/editions'));
    const val = snap.val();
    if (!val || typeof val !== 'object') {
      return { data: [], error: null };
    }
    const data = Object.keys(val).map((id) => mapEditionToCard(id, val[id]));
    sortEditionsNewestFirstInPlace(data);
    return { data, error: null };
  } catch (e) {
    const message = e?.message || 'Failed to load catalog';
    return { data: null, error: { message } };
  }
}

/**
 * @returns {Promise<{ data: Record<string, object>, error: { message: string } | null }>}
 */
export async function fetchPublishedSeriesMap() {
  try {
    const snap = await get(ref(fbRtdb(), 'public/catalog/series'));
    const val = snap.val();
    if (!val || typeof val !== 'object') {
      return { data: {}, error: null };
    }
    return { data: val, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message || 'Failed to load series catalog' } };
  }
}
