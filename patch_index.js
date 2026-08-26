const fs = require('fs');

let content = fs.readFileSync('index.md', 'utf8');

// Replace directory map legacy routes
const oldDirMap = `│   ├── p/                     # Publication routes
│   │   ├── page.tsx           # Redirects to /
│   │   └── [seriesId]/        # Series detail route (/p/[seriesId])
│   │       ├── page.tsx       # Series detail view
│   │       └── e/             # Edition reader routes
│   │           ├── page.tsx   # Redirects to /p/[seriesId]
│   │           └── [editionId]/page.tsx # Edition flipbook reader (/p/[seriesId]/e/[editionId])`;

const newDirMap = `│   ├── [seriesSlug]/          # Publication routes
│   │   ├── page.tsx           # Series detail view
│   │   └── [editionSlug]/     # Edition reader routes
│   │       └── page.tsx       # Edition flipbook reader (/[seriesSlug]/[editionSlug])`;

content = content.replace(oldDirMap, newDirMap);

// Replace URLs in Feature map
content = content.replace('app/p/[seriesId]/page.tsx', 'app/[seriesSlug]/page.tsx');
content = content.replace('app/p/[seriesId]/e/[editionId]/page.tsx', 'app/[seriesSlug]/[editionSlug]/page.tsx');
content = content.replace('(/p/..., /p/.../e/...)', '(/[seriesSlug], /[seriesSlug]/[editionSlug])');

fs.writeFileSync('index.md', content, 'utf8');
console.log('Patched index.md successfully');
