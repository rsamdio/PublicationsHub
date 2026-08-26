const fs = require('fs');
let content = fs.readFileSync('app/[seriesSlug]/page.tsx', 'utf8');

// 1. Update Props
content = content.replace(
  'type Props = { params: Promise<{ seriesId: string }> };',
  'type Props = { params: Promise<{ seriesSlug: string }> };'
);

// 2. Import resolvers
content = content.replace(
  'fetchPublicSeries,',
  'fetchPublicSeries,\n  resolveSeriesBySlugOrId,\n  resolveEditionBySlugOrId,'
);

// 3. Update generateMetadata
const oldMeta = `export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesId: raw } = await params;
  const seriesId = decodeURIComponent(raw);
  const series = await fetchPublicSeries(seriesId);
  const edition = series ? null : await fetchPublicEdition(seriesId);`;

const newMeta = `export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesSlug: raw } = await params;
  const seriesSlug = decodeURIComponent(raw);
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug);
  const editionId = !seriesId ? resolveEditionBySlugOrId(editionsMap, seriesSlug) : null;
  const resolvedId = seriesId || editionId;

  if (!resolvedId) {
    return {
      title: 'Publication not found',
      description: 'This publication could not be found on Publications Hub.',
      robots: { index: false, follow: false }
    };
  }

  const series = seriesId ? await fetchPublicSeries(seriesId) : null;
  const edition = editionId ? await fetchPublicEdition(editionId) : null;`;
content = content.replace(oldMeta, newMeta);

// In generateMetadata, update publicationPath(seriesId) to use the slug
content = content.replace(
  'const path = publicationPath(seriesId);',
  'const path = publicationPath(seriesSlug);'
);


// 4. Update PublicationPage
const oldPage = `export default async function PublicationPage({ params }: Props) {
  const { seriesId: raw } = await params;
  const seriesId = decodeURIComponent(raw);
  const seriesDoc = await fetchPublicSeries(seriesId);
  const standalone = seriesDoc ? null : await fetchPublicEdition(seriesId);
  if (!seriesDoc && !standalone) {
    notFound();
  }

  const editionsMap = await fetchPublicEditionsMap();`;

const newPage = `export default async function PublicationPage({ params }: Props) {
  const { seriesSlug: raw } = await params;
  const seriesSlug = decodeURIComponent(raw);
  
  const [seriesMap, editionsMap] = await Promise.all([
    fetchPublicSeriesMap(),
    fetchPublicEditionsMap()
  ]);
  const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug);
  const editionId = !seriesId ? resolveEditionBySlugOrId(editionsMap, seriesSlug) : null;
  const resolvedId = seriesId || editionId;

  if (!resolvedId) {
    notFound();
  }

  const seriesDoc = seriesId ? await fetchPublicSeries(seriesId) : null;
  const standalone = editionId ? await fetchPublicEdition(editionId) : null;`;
content = content.replace(oldPage, newPage);

// In PublicationPage, update publicationPath
content = content.replace(
  'const path = publicationPath(seriesId);',
  'const path = publicationPath(seriesSlug);'
);
// In PublicationPage, update url: editionPath(seriesId, ed.id) to use slugs
content = content.replace(
  'url: editionPath(seriesId, ed.id),',
  'url: editionPath(seriesSlug, ed.slug || ed.id),'
);

// In PublicationPage, PublicationCrawlSummary and PublicationDetail use seriesId string, we should pass resolvedId because that's the RTDB ID. Wait, wait, if we are on standalone edition page, resolvedId is editionId, which PublicationCrawlSummary handles (fallback to standalone).
// Wait, PublicationDetail takes seriesId={seriesId}. We need to pass the ACTUAL RTDB series ID or edition ID to PublicationDetail because it fetches data using the ID. So passing resolvedId is correct.
content = content.replace(
  '<PublicationCrawlSummary\n          mode="series"\n          seriesId={seriesId}',
  '<PublicationCrawlSummary\n          mode="series"\n          seriesId={resolvedId}'
);
content = content.replace(
  '<PublicationDetail seriesId={seriesId} />',
  '<PublicationDetail seriesId={resolvedId} />'
);
content = content.replace(
  'editionsForSeries(editionsMap, seriesId);',
  'editionsForSeries(editionsMap, resolvedId);'
);


fs.writeFileSync('app/[seriesSlug]/page.tsx', content, 'utf8');
console.log('Patched page.tsx successfully');
