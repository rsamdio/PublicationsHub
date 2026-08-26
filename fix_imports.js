const fs = require('fs');
let page = fs.readFileSync('app/[seriesSlug]/page.tsx', 'utf8');

// 1. Add fetchPublicSeriesMap
page = page.replace(
  'fetchPublicSeries,',
  'fetchPublicSeries,\n  fetchPublicSeriesMap,'
);

// 2. Fix the string | undefined issue
page = page.replace(
  'id: ed.id,',
  'id: String(ed.id || ""), // ensure id is always a string'
);

// 3. Fix the standalone fallback array id: seriesId type
page = page.replace(
  '? [{ id: seriesId, ...standalone }]',
  '? [{ id: String(seriesId || ""), ...standalone }]'
);

fs.writeFileSync('app/[seriesSlug]/page.tsx', page, 'utf8');

console.log('Fixed imports in page.tsx');
