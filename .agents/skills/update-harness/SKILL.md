---
name: update-harness
description: Guidance on synchronizing index.md and agent architecture documentation when files, routes, or components are modified.
---

# Update Harness Skill

Use this skill when modifying the structure of the PublicationsHub codebase to ensure that the primary navigation layer (`index.md`) and documentation stay synchronized.

## Synchronization Steps

1. **Identify Changes**:
   - Check if any new routes were added to `app/`.
   - Check if any new components were added to `components/`.
   - Check if any new library modules were added to `lib/`.
   - Check if any files were moved or deleted.

2. **Update `index.md`**:
   - Open `index.md`.
   - Add new files/routes to the Directory Structure Map.
   - If a new feature area was created, update the Feature and Concern Routing Map.

3. **Verify Integrity**:
   - Run `npm run validate:harness` to verify link validity and full coverage.
   - Run `npm run validate:dashes` to ensure no em dashes were introduced.

4. **Verify Build**:
   - Run `npx tsc --noEmit` and `npm run build` to confirm zero compilation errors.
