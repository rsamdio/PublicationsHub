# Development Workflow

This document details the step-by-step workflow for frontend development, component creation, and bug fixes on **PublicationsHub**.

## 1. Local Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` in your browser.

## 2. Working on UI Components

When modifying or creating components in `components/`:
- **Styling**: Use Tailwind CSS utilities matching the theme tokens (`bg-background-light`, `text-slate-900`, `text-primary`, `#d81a6a`).
- **Icons**: Use icons from `lib/catalog/icons-public.js` or Google Material Symbols loaded via `MaterialIconsFont.tsx`.
- **Accessibility**: Ensure buttons have descriptive aria-labels and interactive elements have appropriate tabIndex and focus outlines.
- **Embed Safety**: If creating a link to a series or edition, ensure it checks `isEmbedded()` or uses standard anchor tags handled by `FramedDeepLinkEscape.tsx`.

## 3. Modifying the Catalog & Shelf

- Logic for grouping editions into series lives in `lib/catalog/catalog-series.js`.
- The shelf rendering and infinite scroll pagination live in `components/ShelfCatalog.tsx`.
- Public reads are initiated through `lib/firebase/db-public.js`.
- Any change to catalog shapes should be tested against mock RTDB responses or local fixtures.

## 4. Modifying the PDF Flipbook Reader

- The flipbook engine is configured in `lib/client/viewer.js`.
- Viewer controls, toolbar, and theme toggling live in `lib/client/reader-chrome.ts` and `components/ReaderChrome.tsx`.
- When modifying viewer behavior, test:
  1. Desktop two-page spread (`width >= 768px`)
  2. Mobile single-page layout (`width < 768px`)
  3. Short landscape viewport (`height <= 500px`)
  4. Light vs dark reader theme switching

## 5. Pre-Commit Validation

Before submitting changes, always run the full validation suite:
```bash
npm run validate:all
```
This runs:
1. Em dash check (`npm run validate:dashes`)
2. Harness and link validation (`npm run validate:harness`)
3. TypeScript typecheck (`npx tsc --noEmit`)
4. Next.js production build (`npm run build`)
