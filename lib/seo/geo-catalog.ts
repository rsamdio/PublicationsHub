import {
  featuredEditions,
  fetchPublicEditionsMap,
  fetchPublicSeriesMap,
  seriesSummaries,
  type CatalogEditionRow
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
};

/** Home hero counts + ItemList JSON-LD (no visible duplicate catalog UI). */
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
      return {
        name: (ed.title && String(ed.title).trim()) || ed.id,
        url: editionPath(seriesId, ed.id),
        image: ed.cover_url || ed.cover_thumb_url || null
      };
    });
  } else {
    listName = 'Publications on Publications Hub';
    listItems = seriesRows.slice(0, ITEM_LIST_LIMIT).map((s) => ({
      name: (s.title && String(s.title).trim()) || s.id,
      url: publicationPath(s.id),
      image: s.cover_url || s.cover_thumb_url || null
    }));
  }

  return {
    seriesCount: seriesRows.length,
    editionCount: editionIds.length,
    listItems,
    listName
  };
}
