# Agent Maintenance Workflow

This document defines how AI coding agents and developers must maintain the agent harness and keep documentation synchronized with codebase changes.

## 1. When to Run Maintenance

Run this maintenance workflow whenever:
- A new route is added under `app/`
- A new component is created under `components/`
- A new library helper is created under `lib/`
- Documentation files are added, renamed, or deleted
- Dependencies or npm scripts are updated in `package.json`

## 2. Step-by-Step Maintenance Procedure

### Step 1: Update `index.md`
1. If new routes or components were created, add them to the Directory Structure Map in [index.md](../../index.md).
2. If new feature areas or files were added, update the Feature and Concern Routing Map table in [index.md](../../index.md).

### Step 2: Validate Links and Coverage
Run the automated harness validator:
```bash
npm run validate:harness
```
This verifies:
- All relative markdown links in `AGENTS.md`, `index.md`, `docs/`, and `.agents/` resolve to real files on disk.
- All App Router routes in `app/` are indexed.
- All React components in `components/` are indexed.
- All agent skills have valid SKILL.md files and YAML frontmatter.

### Step 3: Enforce No Em Dashes
Run the em dash linter:
```bash
npm run validate:dashes
```
If violations are found in agent files, fix them by replacing em dashes with hyphens, colons, or parentheses.

### Step 4: Run Full Verification Suite
Execute the complete verification command:
```bash
npm run validate:all
```
Ensure that TypeScript type checking and the Next.js production build pass cleanly.

## 3. Detecting Documentation Drift

To prevent documentation drift over time:
- The CI pipeline should run `npm run validate:all` on all pull requests.
- Agents should run `npm run validate:harness` before concluding tasks that touch files or structure.
