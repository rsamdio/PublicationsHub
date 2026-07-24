import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/firebase/config';
import {
  fetchAllPublicEditionsMap,
  fetchAllPublicSeriesMap
} from '@/lib/firebase/rtdb-rest';
import { editionPath, publicationPath } from '@/lib/urls';

function abs(path: string): string {
  const base = siteUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: abs('/'),
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: abs('/privacy'),
      changeFrequency: 'yearly',
      priority: 0.3
    },
    {
      url: abs('/terms'),
      changeFrequency: 'yearly',
      priority: 0.3
    }
  ];

  const [seriesMap, editionsMap] = await Promise.all([
    fetchAllPublicSeriesMap(),
    fetchAllPublicEditionsMap()
  ]);

  for (const seriesId of Object.keys(seriesMap || {})) {
    if (!seriesId) continue;
    entries.push({
      url: abs(publicationPath(seriesId)),
      changeFrequency: 'weekly',
      priority: 0.8
    });
  }

  for (const [editionId, ed] of Object.entries(editionsMap || {})) {
    if (!editionId || !ed) continue;
    const seriesId =
      ed.series_id != null && String(ed.series_id).trim()
        ? String(ed.series_id).trim()
        : editionId;
    entries.push({
      url: abs(editionPath(seriesId, editionId)),
      changeFrequency: 'weekly',
      priority: 0.6
    });
  }

  return entries;
}
