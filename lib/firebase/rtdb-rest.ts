import { firebaseConfig } from '@/lib/firebase/config';
import { compareEditionsNewestFirst } from '@/lib/catalog/edition-sort.js';
import { toIsoDate } from '@/lib/seo/dates';
import { cache } from 'react';

async function rtdbGet<T>(path: string): Promise<T | null> {
  const base = firebaseConfig.databaseURL?.replace(/\/$/, '');
  if (!base) return null;
  const url = `${base}/${path.replace(/^\//, '')}.json`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Longer cache for sitemap builds. */
async function rtdbGetSitemap<T>(path: string): Promise<T | null> {
  const base = firebaseConfig.databaseURL?.replace(/\/$/, '');
  if (!base) return null;
  const url = `${base}/${path.replace(/^\//, '')}.json`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type CatalogEdition = {
  title?: string;
  slug?: string | null;
  description?: string | null;
  cover_url?: string | null;
  cover_thumb_url?: string | null;
  series_id?: string | null;
  series_title?: string | null;
  publisher_name?: string | null;
  publisher_id?: string | null;
  featured?: boolean;
  issue_date?: number | string | null;
  created_at?: number | string | null;
  pdf_url?: string | null;
};

export type CatalogSeries = {
  title?: string;
  slug?: string | null;
  description?: string | null;
  cover_url?: string | null;
  cover_thumb_url?: string | null;
  frequency?: string | null;
  publisher_name?: string | null;
  publisher_id?: string | null;
  created_at?: number | string | null;
};

export type CatalogEditionRow = CatalogEdition & { id: string };
export type CatalogSeriesRow = CatalogSeries & { id: string };

export const fetchPublicSeries = cache(async (seriesId: string) => {
  return rtdbGet<CatalogSeries>(`public/catalog/series/${encodeURIComponent(seriesId)}`);
});

export const fetchPublicEdition = cache(async (editionId: string) => {
  return rtdbGet<CatalogEdition>(`public/catalog/editions/${encodeURIComponent(editionId)}`);
});

/** Page SSR catalog maps (60s revalidate). */
export const fetchPublicSeriesMap = cache(async () => {
  const val = await rtdbGet<Record<string, CatalogSeries>>('public/catalog/series');
  return val && typeof val === 'object' ? val : {};
});

export const fetchPublicEditionsMap = cache(async () => {
  const val = await rtdbGet<Record<string, CatalogEdition>>('public/catalog/editions');
  return val && typeof val === 'object' ? val : {};
});

/** Sitemap builds (1h revalidate). */
export async function fetchAllPublicSeriesMap() {
  const val = await rtdbGetSitemap<Record<string, CatalogSeries>>('public/catalog/series');
  return val && typeof val === 'object' ? val : {};
}

export async function fetchAllPublicEditionsMap() {
  const val = await rtdbGetSitemap<Record<string, CatalogEdition>>('public/catalog/editions');
  return val && typeof val === 'object' ? val : {};
}

/** Editions belonging to a series, newest first. Standalone editions use editionId === seriesId. */
export function editionsForSeries(
  editionsMap: Record<string, CatalogEdition>,
  seriesId: string
): CatalogEditionRow[] {
  const sid = String(seriesId || '').trim();
  if (!sid) return [];
  const rows: CatalogEditionRow[] = [];
  for (const [id, ed] of Object.entries(editionsMap || {})) {
    if (!id || !ed) continue;
    const edSid =
      ed.series_id != null && String(ed.series_id).trim()
        ? String(ed.series_id).trim()
        : id;
    if (edSid !== sid) continue;
    rows.push({ id, ...ed });
  }
  rows.sort(compareEditionsNewestFirst);
  return rows;
}

export function featuredEditions(
  editionsMap: Record<string, CatalogEdition>
): CatalogEditionRow[] {
  const rows: CatalogEditionRow[] = [];
  for (const [id, ed] of Object.entries(editionsMap || {})) {
    if (!id || !ed || ed.featured !== true) continue;
    rows.push({ id, ...ed });
  }
  rows.sort(compareEditionsNewestFirst);
  return rows;
}

export function allEditionsSummaries(
  editionsMap: Record<string, CatalogEdition>
): CatalogEditionRow[] {
  const rows: CatalogEditionRow[] = [];
  for (const [id, ed] of Object.entries(editionsMap || {})) {
    if (!id || !ed) continue;
    rows.push({ id, ...ed });
  }
  rows.sort(compareEditionsNewestFirst);
  return rows;
}

export function seriesSummaries(
  seriesMap: Record<string, CatalogSeries>
): CatalogSeriesRow[] {
  const rows: CatalogSeriesRow[] = [];
  for (const [id, s] of Object.entries(seriesMap || {})) {
    if (!id || !s) continue;
    rows.push({ id, ...s });
  }
  rows.sort((a, b) => {
    const ta = a.title != null ? String(a.title) : a.id;
    const tb = b.title != null ? String(b.title) : b.id;
    return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
  });
  return rows;
}

export function resolveSeriesBySlugOrId(
  seriesMap: Record<string, CatalogSeries>,
  segment: string
): { seriesId: string; data: CatalogSeries } | null {
  if (!segment) return null;
  if (seriesMap[segment]) return { seriesId: segment, data: seriesMap[segment] };
  for (const [id, s] of Object.entries(seriesMap || {})) {
    if (s.slug === segment) return { seriesId: id, data: s };
  }
  return null;
}

export function resolveEditionBySlugOrId(
  editionsMap: Record<string, CatalogEdition>,
  seriesId: string,
  segment: string
): { editionId: string; data: CatalogEdition } | null {
  if (!segment || !seriesId) return null;
  if (editionsMap[segment]) {
    const ed = editionsMap[segment];
    const edSid =
      ed.series_id != null && String(ed.series_id).trim()
        ? String(ed.series_id).trim()
        : segment;
    if (edSid === seriesId) return { editionId: segment, data: ed };
  }
  for (const [id, ed] of Object.entries(editionsMap || {})) {
    const edSid =
      ed.series_id != null && String(ed.series_id).trim()
        ? String(ed.series_id).trim()
        : id;
    if (edSid === seriesId && ed.slug === segment) {
      return { editionId: id, data: ed };
    }
  }
  return null;
}

export { toIsoDate };
