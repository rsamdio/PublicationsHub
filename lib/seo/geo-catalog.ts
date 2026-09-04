import {
  allEditionsSummaries,
  featuredEditions,
  fetchPublicEditionsMap,
  fetchPublicSeriesMap,
  seriesSummaries,
  type CatalogEditionRow,
  type CatalogSeries
} from '@/lib/firebase/rtdb-rest';
import {
  editionPath,
  getSeriesCanonicalIdForPublication,
  publicationPath
} from '@/lib/urls';

const ITEM_LIST_LIMIT = 24;

export type GeoCatalogData = {
  seriesCount: number;
  editionCount: number;
  listItems: { name: string; url: string; image?: string | null }[];
  listName: string;
  seriesMap: Record<string, CatalogSeries>;
  editions: CatalogEditionRow[];
};

/** Home hero counts + ItemList JSON-LD + SSR home shelf data. */
export async function loadGeoCatalogData(): Promise<GeoCatalogData> {
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  const seriesRows = seriesSummaries(seriesMap);
  const editionIds = Object.keys(editionsMap || {});
  const featured = featuredEditions(editionsMap);

  let listItems: { name: string; url: string; image?: string | null }[];
  let listName: string;

  if (featured.length) {
    listName = 'Featured editions on Publications Hub';
    listItems = featured.slice(0, ITEM_LIST_LIMIT).map((ed: CatalogEditionRow) => {
      const seriesId = getSeriesCanonicalIdForPublication(ed) || ed.id;
      const resolvedSeriesSlug = seriesMap[seriesId]?.slug || seriesId;
      return {
        name: (ed.title && String(ed.title).trim()) || ed.id,
        url: editionPath(resolvedSeriesSlug, ed.slug || ed.id),
        image: ed.cover_url || ed.cover_thumb_url || null
      };
    });
  } else {
    listName = 'Publications on Publications Hub';
    listItems = seriesRows.slice(0, ITEM_LIST_LIMIT).map((s) => ({
      name: (s.title && String(s.title).trim()) || s.id,
      url: publicationPath(s.slug || s.id),
      image: s.cover_url || s.cover_thumb_url || null
    }));
  }

  return {
    seriesCount: seriesRows.length,
    editionCount: editionIds.length,
    listItems,
    listName,
    seriesMap,
    editions: allEditionsSummaries(editionsMap)
  };
}
