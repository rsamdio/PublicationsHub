#!/usr/bin/env node
/**
 * Live RTDB audit: list series/edition slugs that fail public policy.
 * Run after renames: npm run validate:slugs:live
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const runner = path.join(root, 'scripts', 'audit-public-slugs-runner.ts');

const result = spawnSync(
  process.execPath,
  ['--experimental-strip-types', runner],
  {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' }
  }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status == null ? 1 : result.status);
