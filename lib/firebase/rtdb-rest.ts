import { firebaseConfig } from '@/lib/firebase/config';

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
  description?: string | null;
  cover_url?: string | null;
  cover_thumb_url?: string | null;
  frequency?: string | null;
  publisher_name?: string | null;
  publisher_id?: string | null;
  created_at?: number | string | null;
};

export async function fetchPublicSeries(seriesId: string) {
  return rtdbGet<CatalogSeries>(`public/catalog/series/${encodeURIComponent(seriesId)}`);
}

export async function fetchPublicEdition(editionId: string) {
  return rtdbGet<CatalogEdition>(`public/catalog/editions/${encodeURIComponent(editionId)}`);
}

export async function fetchAllPublicSeriesMap() {
  const val = await rtdbGetSitemap<Record<string, CatalogSeries>>('public/catalog/series');
  return val && typeof val === 'object' ? val : {};
}

export async function fetchAllPublicEditionsMap() {
  const val = await rtdbGetSitemap<Record<string, CatalogEdition>>('public/catalog/editions');
  return val && typeof val === 'object' ? val : {};
}
