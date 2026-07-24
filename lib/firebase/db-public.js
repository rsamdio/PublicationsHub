/**
 * Public catalog reads (home shelf / publication pages). Realtime Database mirror — no auth.
 */
import { ref, get, onValue } from 'firebase/database';
import { fbRtdb } from './init';
import { sortEditionsNewestFirstInPlace } from '../catalog/edition-sort.js';

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
    cover_thumb_url: v.cover_thumb_url ?? null,
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
 * Single published edition from RTDB mirror.
 * @param {string} editionId
 */
export async function fetchPublishedEdition(editionId) {
  const id = String(editionId || '').trim();
  if (!id) return { data: null, error: { message: 'Missing edition id' } };
  try {
    const snap = await get(ref(fbRtdb(), `public/catalog/editions/${id}`));
    const val = snap.val();
    if (!val || typeof val !== 'object') {
      return { data: null, error: null };
    }
    return { data: mapEditionToCard(id, val), error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message || 'Failed to load edition' } };
  }
}

/**
 * Single series card from RTDB mirror.
 * @param {string} seriesId
 */
export async function fetchPublishedSeries(seriesId) {
  const id = String(seriesId || '').trim();
  if (!id) return { data: null, error: { message: 'Missing series id' } };
  try {
    const snap = await get(ref(fbRtdb(), `public/catalog/series/${id}`));
    const val = snap.val();
    if (!val || typeof val !== 'object') {
      return { data: null, error: null };
    }
    return { data: val, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message || 'Failed to load series' } };
  }
}

/**
 * @param {(result: { data: ReturnType<typeof mapEditionToCard>[] | null, error: { message: string } | null }) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
export function subscribePublishedCatalog(onUpdate) {
  const r = ref(fbRtdb(), 'public/catalog/editions');
  return onValue(
    r,
    (snap) => {
      try {
        const val = snap.val();
        if (!val || typeof val !== 'object') {
          onUpdate({ data: [], error: null });
          return;
        }
        const data = Object.keys(val).map((id) => mapEditionToCard(id, val[id]));
        sortEditionsNewestFirstInPlace(data);
        onUpdate({ data, error: null });
      } catch (e) {
        onUpdate({ data: null, error: { message: e?.message || 'Failed to parse catalog' } });
      }
    },
    (err) => {
      onUpdate({ data: null, error: { message: err?.message || 'Listen failed' } });
    }
  );
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
