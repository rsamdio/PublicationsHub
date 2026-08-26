#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let hasErrors = false;

function logError(msg) {
  console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`);
  hasErrors = true;
}

function logOk(msg) {
  console.log(`\x1b[32m[OK]\x1b[0m ${msg}`);
}

function logInfo(msg) {
  console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`);
}

// 1. Verify markdown link targets exist
function extractMarkdownLinks(filePath, content) {
  const links = [];
  // Match [text](target) - ignore external http(s) links, mailto, and in-page anchor only links (#anchor)
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const rawTarget = match[2].trim();
    if (
      rawTarget.startsWith('http://') ||
      rawTarget.startsWith('https://') ||
      rawTarget.startsWith('mailto:') ||
      rawTarget.startsWith('#')
    ) {
      continue;
    }

    // Strip anchor and query strings
    const cleanTarget = rawTarget.split('#')[0].split('?')[0];
    if (!cleanTarget) continue;

    links.push({
      text: match[1],
      target: cleanTarget,
      rawTarget,
      file: filePath,
    });
  }
  return links;
}

function getMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
        continue;
      }
      results.push(...getMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function checkLinks() {
  logInfo('Checking internal links in markdown files...');
  const mdFiles = [
    path.join(rootDir, 'AGENTS.md'),
    path.join(rootDir, 'index.md'),
    path.join(rootDir, 'README.md'),
    ...getMarkdownFiles(path.join(rootDir, 'docs')),
    ...getMarkdownFiles(path.join(rootDir, '.agents')),
  ].filter((f) => fs.existsSync(f));

  let totalLinks = 0;
  let brokenLinks = 0;

  for (const file of mdFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const links = extractMarkdownLinks(file, content);
    for (const item of links) {
      totalLinks++;
      let resolvedPath;
      if (item.target.startsWith('/')) {
        resolvedPath = path.join(rootDir, item.target);
      } else {
        resolvedPath = path.resolve(path.dirname(item.file), item.target);
      }

      if (!fs.existsSync(resolvedPath)) {
        logError(`Broken link in ${path.relative(rootDir, item.file)}: '${item.rawTarget}' does not exist.`);
        brokenLinks++;
      }
    }
  }

  if (brokenLinks === 0) {
    logOk(`All ${totalLinks} internal markdown links resolved successfully.`);
  }
}

// 2. Verify route coverage in index.md
function checkRouteCoverage() {
  logInfo('Verifying Next.js App Router coverage in index.md...');
  const indexFile = path.join(rootDir, 'index.md');
  if (!fs.existsSync(indexFile)) {
    logError('index.md does not exist at repository root.');
    return;
  }
  const indexContent = fs.readFileSync(indexFile, 'utf8');

  const appDir = path.join(rootDir, 'app');
  const expectedRoutes = [
    { route: '/', marker: 'app/page.tsx' },
    { route: '/about', marker: 'app/about' },
    { route: '/admin', marker: 'app/admin' },
    { route: '/studio', marker: 'app/studio' },
    { route: '/[seriesSlug]', marker: 'app/[seriesSlug]/page.tsx' },
    { route: '/[seriesSlug]/[editionSlug]', marker: 'app/[seriesSlug]/[editionSlug]/page.tsx' },
    { route: '/privacy', marker: 'app/privacy' },
    { route: '/terms', marker: 'app/terms' },
    { route: '/robots.txt', marker: 'app/robots.ts' },
    { route: '/sitemap.xml', marker: 'app/sitemap.ts' },
  ];

  for (const { route, marker } of expectedRoutes) {
    if (!indexContent.includes(marker) && !indexContent.includes(route)) {
      logError(`Route '${route}' (${marker}) is not documented in index.md.`);
    }
  }
  logOk('Route coverage verified in index.md.');
}

// 3. Verify component coverage in index.md
function checkComponentCoverage() {
  logInfo('Verifying component coverage in index.md...');
  const indexFile = path.join(rootDir, 'index.md');
  if (!fs.existsSync(indexFile)) return;
  const indexContent = fs.readFileSync(indexFile, 'utf8');

  const componentsDir = path.join(rootDir, 'components');
  if (!fs.existsSync(componentsDir)) return;
  const componentFiles = fs
    .readdirSync(componentsDir)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.jsx'));

  for (const comp of componentFiles) {
    if (!indexContent.includes(comp)) {
      logError(`Component 'components/${comp}' is missing from index.md.`);
    }
  }
  logOk(`All ${componentFiles.length} React components are indexed.`);
}

// 4. Verify skills existence
function checkSkills() {
  logInfo('Checking agent skills...');
  const skillsDir = path.join(rootDir, '.agents', 'skills');
  if (!fs.existsSync(skillsDir)) {
    logError('.agents/skills directory does not exist.');
    return;
  }
  const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const skill of skills) {
    const skillMd = path.join(skillsDir, skill.name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      logError(`Skill '${skill.name}' is missing SKILL.md.`);
    } else {
      const content = fs.readFileSync(skillMd, 'utf8');
      if (!content.startsWith('---') || !content.includes('name:') || !content.includes('description:')) {
        logError(`Skill '${skill.name}/SKILL.md' is missing YAML frontmatter (name, description).`);
      }
    }
  }
  logOk(`Validated ${skills.length} agent skills.`);
}

console.log('=== Running PublicationsHub Agent Harness Validator ===\n');
checkLinks();
checkRouteCoverage();
checkComponentCoverage();
checkSkills();

console.log('\n======================================================');
if (hasErrors) {
  console.error('\x1b[31m[FAIL] Harness validation failed. Fix the issues above.\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m[PASS] Agent harness is completely synchronized and valid.\x1b[0m\n');
  process.exit(0);
}
