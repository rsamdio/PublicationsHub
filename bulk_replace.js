const fs = require('fs');

const replacements = [
  {
    file: 'app/about/page.tsx',
    searches: [
      { find: '/p/…/e/…', replace: '/[seriesSlug]/[editionSlug]' }
    ]
  },
  {
    file: 'lib/client/reader-chrome.ts',
    searches: [
      { find: '(`/p/.../e/...`)', replace: '(`/[seriesSlug]/[editionSlug]`)' }
    ]
  },
  {
    file: 'lib/client/viewer.js',
    searches: [
      { find: '`/p/.../e/...`', replace: '`/[seriesSlug]/[editionSlug]`' },
      { find: '/p/[seriesId]/e/[editionId]', replace: '/[seriesSlug]/[editionSlug]' }
    ]
  },
  {
    file: 'components/FramedDeepLinkEscape.tsx',
    searches: [
      { find: '`/p/…`', replace: '`/[seriesSlug]/…`' },
      { find: "pathname.startsWith('/p/')", replace: "pathname.match(/^\\/[^/]+\\/[^/]+$/) || pathname.match(/^\\/[^/]+$/)" } // wait, FramedDeepLinkEscape logic might need a closer look. Let's look at it next.
    ]
  },
  {
    file: 'README.md',
    searches: [
      { find: '**`/p/[seriesId]`**', replace: '**`/[seriesSlug]`**' },
      { find: '**`/p/[seriesId]/e/[editionId]`**', replace: '**`/[seriesSlug]/[editionSlug]`**' },
      { find: '`/`, `/p/…`, `/p/…/e/…`', replace: '`/`, `/[seriesSlug]`, `/[seriesSlug]/[editionSlug]`' },
      { find: 'Canonical /p/… helpers', replace: 'Canonical URL helpers' }
    ]
  },
  {
    file: 'docs/architecture/system-overview.md',
    searches: [
      { find: 'Detail (/p/)', replace: 'Detail (Slug)' },
      { find: '| `/p/[seriesId]` | `app/p/[seriesId]/page.tsx` |', replace: '| `/[seriesSlug]` | `app/[seriesSlug]/page.tsx` |' },
      { find: '| `/p/[seriesId]/e/[editionId]` | `app/p/[seriesId]/e/[editionId]/page.tsx` |', replace: '| `/[seriesSlug]/[editionSlug]` | `app/[seriesSlug]/[editionSlug]/page.tsx` |' },
      { find: 'intercepts `/p/...` links', replace: 'intercepts publication links' }
    ]
  },
  {
    file: 'docs/SEO.md',
    searches: [
      { find: 'Publication `/p/[seriesId]`', replace: 'Publication `/[seriesSlug]`' },
      { find: 'Edition `/p/.../e/...`', replace: 'Edition `/[seriesSlug]/[editionSlug]`' },
      { find: '| `/p/[seriesId]` |', replace: '| `/[seriesSlug]` |' },
      { find: '| `/p/.../e/...` |', replace: '| `/[seriesSlug]/[editionSlug]` |' },
      { find: 'specific `/p/.../e/...` URLs', replace: 'specific `/[seriesSlug]/[editionSlug]` URLs' }
    ]
  },
  {
    file: 'docs/architecture/security-and-invariants.md',
    searches: [
      { find: 'Publication Series: `/p/[seriesId]`', replace: 'Publication Series: `/[seriesSlug]`' },
      { find: 'Read Edition: `/p/[seriesId]/e/[editionId]`', replace: 'Read Edition: `/[seriesSlug]/[editionSlug]`' },
      { find: 'e.g. `/p`, `/p/`', replace: 'legacy routes' }
    ]
  }
];

for (const rep of replacements) {
  if (fs.existsSync(rep.file)) {
    let content = fs.readFileSync(rep.file, 'utf8');
    let changed = false;
    for (const search of rep.searches) {
      if (content.includes(search.find)) {
        content = content.replace(new RegExp(search.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), search.replace);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(rep.file, content, 'utf8');
      console.log(`Updated ${rep.file}`);
    }
  }
}
