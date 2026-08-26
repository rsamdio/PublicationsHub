const fs = require('fs');
let content = fs.readFileSync('lib/client/studio-body.ts', 'utf8');

// There are four extra closing divs after the newly inserted slug inputs.
// Look for this pattern:
const pattern = /<\/p>\n\s*<\/div>\n\s*<\/div>\n\s*<div>\n\s*<label/g;
let replacedContent = content.replace(pattern, (match) => {
  return match.replace(/<\/div>\n\s*<\/div>/, '</div>');
});

// Let's verify how many were replaced
let diffCount = (content.match(/<\/div>\n\s*<\/div>\n\s*<div>\n\s*<label/g) || []).length;
console.log(`Found ${diffCount} extra divs to remove.`);

fs.writeFileSync('lib/client/studio-body.ts', replacedContent, 'utf8');
