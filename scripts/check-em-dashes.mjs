#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const checkAll = args.includes('--all');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'vendor',
  'public/vendor',
  'Dump',
  'newfolderOLD',
]);

const IGNORED_FILES = new Set([
  'package-lock.json',
  'tsconfig.tsbuildinfo',
  '.DS_Store',
]);

const EXTENSIONS = new Set([
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.txt',
  '.sh',
  '.rules',
  '.toml',
]);

function scanDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      if (
        IGNORED_DIRS.has(entry.name) ||
        IGNORED_DIRS.has(relPath) ||
        relPath.startsWith('public/vendor') ||
        relPath.startsWith('functions/node_modules')
      ) {
        continue;
      }
      results.push(...scanDir(fullPath));
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const files = scanDir(rootDir);
let emDashOccurrences = 0;
let fixedFiles = 0;

console.log('=== Checking for Long Em Dashes (\u2014) ===\n');

for (const file of files) {
  const relPath = path.relative(rootDir, file);
  // If not --all, prioritize agent docs, harness, scripts, and new documentation
  const isAgentHarnessFile =
    relPath === 'AGENTS.md' ||
    relPath === 'index.md' ||
    relPath.startsWith('.agents/') ||
    relPath.startsWith('docs/architecture/') ||
    relPath.startsWith('docs/workflows/') ||
    relPath.startsWith('scripts/');

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  if (!content.includes('\u2014')) {
    continue;
  }

  const lines = content.split('\n');
  const fileMatches = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('\u2014')) {
      fileMatches.push({
        lineNum: i + 1,
        content: lines[i].trim(),
      });
      emDashOccurrences++;
    }
  }

  if (fileMatches.length > 0) {
    console.log(`\x1b[33m[FOUND]\x1b[0m ${relPath} (${fileMatches.length} occurrence${fileMatches.length > 1 ? 's' : ''}):`);
    for (const match of fileMatches) {
      console.log(`  Line ${match.lineNum}: ${match.content}`);
    }

    if (shouldFix && (checkAll || isAgentHarnessFile)) {
      // Replace em dash with hyphen or comma appropriately
      const fixedContent = content
        .replace(/\s*\u2014\s*/g, ' - ')
        .replace(/\u2014/g, ' - ');
      fs.writeFileSync(file, fixedContent, 'utf8');
      console.log(`  \x1b[32m[FIXED]\x1b[0m Replaced em dashes with hyphens.`);
      fixedFiles++;
    }
  }
}

console.log('\n==========================================');
if (emDashOccurrences === 0) {
  console.log('\x1b[32m[PASS] Zero em dashes found across verified files.\x1b[0m\n');
  process.exit(0);
} else {
  console.log(`Total em dash occurrences found: ${emDashOccurrences}`);
  if (shouldFix) {
    console.log(`\x1b[32mFixed ${fixedFiles} file(s).\x1b[0m\n`);
  }
  // If checking agent harness files only and we find violations, fail.
  // When running check-em-dashes in agent validation mode:
  const harnessViolations = files.filter((file) => {
    const rel = path.relative(rootDir, file);
    return (
      (rel === 'AGENTS.md' ||
        rel === 'index.md' ||
        rel.startsWith('.agents/') ||
        rel.startsWith('docs/architecture/') ||
        rel.startsWith('docs/workflows/')) &&
      fs.readFileSync(file, 'utf8').includes('\u2014')
    );
  });

  if (harnessViolations.length > 0) {
    console.error(`\x1b[31m[FAIL] Em dashes detected in ${harnessViolations.length} agent harness file(s). Em dashes are strictly prohibited in agent-generated content.\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log('\x1b[32m[PASS] All agent harness files are clean of em dashes.\x1b[0m\n');
    process.exit(0);
  }
}
