const fs = require('fs');

let page = fs.readFileSync('app/[seriesSlug]/page.tsx', 'utf8');
page = page.replace(
  'const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug);',
  'const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug)?.seriesId;'
);
page = page.replace(
  'const editionId = !seriesId ? resolveEditionBySlugOrId(editionsMap, seriesSlug) : null;',
  'const editionId = !seriesId ? resolveEditionBySlugOrId(editionsMap, seriesSlug, seriesSlug)?.editionId : null;'
);
// Do it twice (once for generateMetadata, once for default)
page = page.replace(
  'const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug);',
  'const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug)?.seriesId;'
);
page = page.replace(
  'const editionId = !seriesId ? resolveEditionBySlugOrId(editionsMap, seriesSlug) : null;',
  'const editionId = !seriesId ? resolveEditionBySlugOrId(editionsMap, seriesSlug, seriesSlug)?.editionId : null;'
);

fs.writeFileSync('app/[seriesSlug]/page.tsx', page, 'utf8');

let edPage = fs.readFileSync('app/[seriesSlug]/[editionSlug]/page.tsx', 'utf8');
edPage = edPage.replace(
  'const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug) || seriesSlug;',
  'const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug)?.seriesId || seriesSlug;'
);
edPage = edPage.replace(
  'const editionId = resolveEditionBySlugOrId(editionsMap, editionSlug) || editionSlug;',
  'const editionId = resolveEditionBySlugOrId(editionsMap, seriesId, editionSlug)?.editionId || editionSlug;'
);
// Do it twice
edPage = edPage.replace(
  'const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug) || seriesSlug;',
  'const seriesId = resolveSeriesBySlugOrId(seriesMap, seriesSlug)?.seriesId || seriesSlug;'
);
edPage = edPage.replace(
  'const editionId = resolveEditionBySlugOrId(editionsMap, editionSlug) || editionSlug;',
  'const editionId = resolveEditionBySlugOrId(editionsMap, seriesId, editionSlug)?.editionId || editionSlug;'
);

fs.writeFileSync('app/[seriesSlug]/[editionSlug]/page.tsx', edPage, 'utf8');

console.log('Fixed build errors');
