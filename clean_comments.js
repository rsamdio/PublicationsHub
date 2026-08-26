const fs = require('fs');

const replacements = [
  {
    file: 'components/EditionReader.tsx',
    searches: [
      { find: '`/p/[seriesId]/e/[editionId]`', replace: '`/[seriesSlug]/[editionSlug]`' }
    ]
  },
  {
    file: 'lib/urls.ts',
    searches: [
      { find: '`/p/…/e/…`', replace: '`/[seriesSlug]/[editionSlug]`' }
    ]
  },
  {
    file: 'app/[seriesSlug]/[editionSlug]/page.tsx',
    searches: [
      { find: '`/p/{id}/e/{id}`', replace: '`/[editionSlug]/[editionSlug]`' }
    ]
  }
];

for (const rep of replacements) {
  if (fs.existsSync(rep.file)) {
    let content = fs.readFileSync(rep.file, 'utf8');
    let changed = false;
    for (const search of rep.searches) {
      if (content.includes(search.find)) {
        content = content.replace(search.find, search.replace);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(rep.file, content, 'utf8');
      console.log(`Cleaned comment in ${rep.file}`);
    }
  }
}
