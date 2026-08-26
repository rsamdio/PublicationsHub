---
name: validate-repo
description: Runs the complete verification suite for PublicationsHub including TypeScript types, Next.js build, harness integrity, and em dash checks.
---

# Validate Repo Skill

Use this skill to verify repository health, build validity, and documentation integrity before concluding any task or submitting changes.

## When to Run
- After making code changes to any TypeScript/JavaScript/CSS files
- After modifying or adding routes in `app/`
- After adding or renaming components in `components/`
- After writing or updating documentation files

## Verification Procedure

Run the complete validation command:
```bash
npm run validate:all
```

This command runs in sequence:
1. `npm run validate:dashes`: Scans for forbidden em dashes (`\u2014`) in agent files.
2. `npm run validate:harness`: Checks all markdown links, route coverage, component indexing, and skill frontmatter.
3. `npx tsc --noEmit`: Typechecks the entire TypeScript codebase.
4. `npm run build`: Executes Next.js production build (`next build`).

## Troubleshooting Failures
- **Em dash detected**: Replace any forbidden em dashes with hyphens, commas, or parentheses.
- **Broken markdown link**: Check relative path in link target and ensure target file exists.
- **Missing route/component in index**: Add the new item to `index.md`.
- **TypeScript error**: Check types in `tsconfig.json` and component props.
- **Build failure**: Inspect Next.js build logs for SSR or static generation errors.
