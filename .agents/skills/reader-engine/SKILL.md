---
name: reader-engine
description: Technical guidelines and invariants for modifying the client-side PDF flipbook viewer and iframe isolation behavior.
---

# Reader Engine Skill

Use this skill when modifying the PDF flipbook viewer, page flipping interactions, viewer chrome, or embedded iframe behavior.

## Core Files
- `lib/client/viewer.js`: Flipbook runtime logic, PDF.js document loader, StPageFlip binding.
- `lib/client/reader-chrome.ts`: Reader toolbar, theme toggles, page indicators, keyboard shortcuts.
- `components/EditionReader.tsx`: React wrapper mounting the reader.
- `components/FramedDeepLinkEscape.tsx`: Intercepts framed navigation and escapes to a new tab.
- `lib/client/is-embedded.ts`: Utility to check if window is framed.

## Critical Invariants
1. **Zero External Reader CDNs**: All vendor files must load same-origin from `/vendor/pdfjs/` and `/vendor/page-flip/`.
2. **Iframe Isolation**: The viewer must never render inside an external iframe. If embedded, the page must escape to a new tab via `window.open(..., '_blank', 'noopener')` and reset the iframe to `/`.
3. **Reactive Spread Modes**:
   - Two-page spread: `(windowWidth >= 768) || (isLandscape && windowWidth >= 560)`
   - Single-page spread: Narrow or mobile viewports.
4. **Reader Theme**: Light mode by default; dark mode preference stored in `localStorage` (`pubhub-reader-theme`). Site chrome outside the reader remains light-only.
5. **PDF Range Prefetching**: Do not trigger full PDF downloads for catalog cards. Only use Range requests on hover or direct edition navigation via `warmReaderForEdition`.
