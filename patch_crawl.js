const fs = require('fs');

// Patch app/[seriesSlug]/page.tsx
let page = fs.readFileSync('app/[seriesSlug]/page.tsx', 'utf8');
page = page.replace(
  'id: ed.id,',
  'id: ed.id,\n    slug: ed.slug,'
);
// Also pass seriesSlug instead of resolvedId to PublicationCrawlSummary?
// Wait, PublicationCrawlSummary uses seriesId to generate publicationPath(seriesId) and editionPath(seriesId, ed.id)
page = page.replace(
  '<PublicationCrawlSummary\n          mode="series"\n          seriesId={resolvedId}',
  '<PublicationCrawlSummary\n          mode="series"\n          seriesId={seriesSlug}'
);
fs.writeFileSync('app/[seriesSlug]/page.tsx', page, 'utf8');

// Patch app/[seriesSlug]/[editionSlug]/page.tsx
let edPage = fs.readFileSync('app/[seriesSlug]/[editionSlug]/page.tsx', 'utf8');
edPage = edPage.replace(
  '<PublicationCrawlSummary\n        mode="edition"\n        seriesId={seriesId}',
  '<PublicationCrawlSummary\n        mode="edition"\n        seriesId={seriesSlug}'
);
fs.writeFileSync('app/[seriesSlug]/[editionSlug]/page.tsx', edPage, 'utf8');

// Patch components/PublicationCrawlSummary.tsx
let crawl = fs.readFileSync('components/PublicationCrawlSummary.tsx', 'utf8');
crawl = crawl.replace(
  'id: string;',
  'id: string;\n  slug?: string;'
);
crawl = crawl.replace(
  '<Link href={editionPath(seriesId, ed.id)}>',
  '<Link href={editionPath(seriesId, ed.slug || ed.id)}>'
);
fs.writeFileSync('components/PublicationCrawlSummary.tsx', crawl, 'utf8');

console.log('Patched crawl summary logic');
