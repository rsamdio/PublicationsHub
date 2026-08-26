const fs = require('fs');
let content = fs.readFileSync('components/PublicationDetail.tsx', 'utf8');

// 1. openEdition
const oldOpenEdition = `const openEdition = (ed: any) => {
    const path = editionPath(seriesId, ed.id);
    if (openInNewTabIfEmbedded(path)) return;
    router.push(path);
  };`;

const newOpenEdition = `const openEdition = (ed: any) => {
    const sId = group?.slug || seriesId;
    const eId = ed.slug || ed.id;
    const path = editionPath(sId, eId);
    if (openInNewTabIfEmbedded(path)) return;
    router.push(path);
  };`;
content = content.replace(oldOpenEdition, newOpenEdition);

// 2. seriesShareUrl
const oldSeriesShareUrl = `const seriesShareUrl = () => absoluteUrl(publicationPath(seriesId));`;
const newSeriesShareUrl = `const seriesShareUrl = () => absoluteUrl(publicationPath(group?.slug || seriesId));`;
content = content.replace(oldSeriesShareUrl, newSeriesShareUrl);

// 3. Read latest edition link
const oldLatestEdition = `href={editionPath(seriesId, group.latestEdition.id)}
                      onClick={(e) => {
                        openInNewTabIfEmbedded(
                          editionPath(seriesId, group.latestEdition.id),
                          e
                        );`;
const newLatestEdition = `href={editionPath(group?.slug || seriesId, group.latestEdition.slug || group.latestEdition.id)}
                      onClick={(e) => {
                        openInNewTabIfEmbedded(
                          editionPath(group?.slug || seriesId, group.latestEdition.slug || group.latestEdition.id),
                          e
                        );`;
content = content.replace(oldLatestEdition, newLatestEdition);

// 4. ShareMenu inside loop
const oldShareEdition = `getUrl={() =>
                          buildEditionDeepLink(
                            ed.id,
                            getSeriesCanonicalIdForPublication(ed) || seriesId
                          )
                        }`;
const newShareEdition = `getUrl={() =>
                          buildEditionDeepLink(
                            ed.slug || ed.id,
                            group?.slug || getSeriesCanonicalIdForPublication(ed) || seriesId
                          )
                        }`;
content = content.replace(oldShareEdition, newShareEdition);

fs.writeFileSync('components/PublicationDetail.tsx', content, 'utf8');
console.log('Patched PublicationDetail.tsx successfully');
