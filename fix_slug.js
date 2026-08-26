const fs = require('fs');
let page = fs.readFileSync('app/[seriesSlug]/page.tsx', 'utf8');

page = page.replace(
  'slug: ed.slug,',
  'slug: ed.slug || undefined,'
);

fs.writeFileSync('app/[seriesSlug]/page.tsx', page, 'utf8');
console.log('Fixed ed.slug');
