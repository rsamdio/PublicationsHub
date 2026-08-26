const fs = require('fs');
let content = fs.readFileSync('components/EditionReader.tsx', 'utf8');

// 1. Update Props
content = content.replace(
  'type Props = {\n  seriesId: string;\n  editionId: string;\n  /**',
  'type Props = {\n  seriesId: string;\n  editionId: string;\n  seriesSlug?: string;\n  editionSlug?: string;\n  /**'
);

// 2. Update Component signature
content = content.replace(
  `export function EditionReader({
  seriesId,
  editionId,
  initialEdition = null,
  seriesTitle = null
}: Props) {`,
  `export function EditionReader({
  seriesId,
  editionId,
  seriesSlug,
  editionSlug,
  initialEdition = null,
  seriesTitle = null
}: Props) {`
);

// 3. Update paths
content = content.replace(
  `const seriesPath = publicationPath(seriesId);`,
  `const seriesPath = publicationPath(seriesSlug || seriesId);`
);

content = content.replace(
  `openInNewTabIfEmbedded(editionPath(seriesId, editionId));`,
  `openInNewTabIfEmbedded(editionPath(seriesSlug || seriesId, editionSlug || editionId));`
);

fs.writeFileSync('components/EditionReader.tsx', content, 'utf8');
console.log('Patched EditionReader.tsx successfully');
