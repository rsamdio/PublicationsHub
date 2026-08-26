const fs = require('fs');
let content = fs.readFileSync('app/[seriesSlug]/[editionSlug]/page.tsx', 'utf8');

// 1. Update Props
content = content.replace(
  'type Props = {\n  params: Promise<{ seriesId: string; editionId: string }>;\n};',
  'type Props = {\n  params: Promise<{ seriesSlug: string; editionSlug: string }>;\n};'
);

// 2. Import resolvers
content = content.replace(
  'fetchPublicSeries } from \'@/lib/firebase/rtdb-rest\';',
  'fetchPublicSeries,\n  fetchPublicSeriesMap,\n  fetchPublicEditionsMap,\n  resolveSeriesBySlugOrId,\n  resolveEditionBySlugOrId\n} from \'@/lib/firebase/rtdb-rest\';'
);

// 3. Update generateMetadata
const oldMeta = `export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesId: sRaw, editionId: eRaw } = await params;
  const seriesId = decodeURIComponent(sRaw);
  const editionId = decodeURIComponent(eRaw);
  const [series, edition] = await Promise.all([
    fetchPublicSeries(seriesId),
    fetchPublicEdition(editionId)
  ]);`;

const newMeta = `export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesSlug: sRaw, editionSlug: eRaw } = await params;
  const seriesSlug = decodeURIComponent(sRaw);
  const editionSlug = decodeURIComponent(eRaw);
  
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  
  const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug) || seriesSlug;
  const editionId = resolveEditionBySlugOrId(editionsMap, editionSlug) || editionSlug;
  
  const [series, edition] = await Promise.all([
    fetchPublicSeries(seriesId),
    fetchPublicEdition(editionId)
  ]);`;
content = content.replace(oldMeta, newMeta);

// In generateMetadata, update editionPath
content = content.replace(
  'const path = editionPath(seriesId, editionId);',
  'const path = editionPath(seriesSlug, editionSlug);'
);

// 4. Update EditionReaderPage
const oldPage = `export default async function EditionReaderPage({ params }: Props) {
  const { seriesId: sRaw, editionId: eRaw } = await params;
  const seriesId = decodeURIComponent(sRaw);
  const editionId = decodeURIComponent(eRaw);
  const [series, edition] = await Promise.all([
    fetchPublicSeries(seriesId),
    fetchPublicEdition(editionId)
  ]);`;

const newPage = `export default async function EditionReaderPage({ params }: Props) {
  const { seriesSlug: sRaw, editionSlug: eRaw } = await params;
  const seriesSlug = decodeURIComponent(sRaw);
  const editionSlug = decodeURIComponent(eRaw);
  
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  
  const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug) || seriesSlug;
  const editionId = resolveEditionBySlugOrId(editionsMap, editionSlug) || editionSlug;
  
  const [series, edition] = await Promise.all([
    fetchPublicSeries(seriesId),
    fetchPublicEdition(editionId)
  ]);`;
content = content.replace(oldPage, newPage);

// In EditionReaderPage, update editionPath and publicationPath
content = content.replace(
  'const path = editionPath(seriesId, editionId);',
  'const path = editionPath(seriesSlug, editionSlug);'
);
content = content.replace(
  'seriesUrl: publicationPath(seriesId),',
  'seriesUrl: publicationPath(seriesSlug),'
);


fs.writeFileSync('app/[seriesSlug]/[editionSlug]/page.tsx', content, 'utf8');
console.log('Patched edition page.tsx successfully');
