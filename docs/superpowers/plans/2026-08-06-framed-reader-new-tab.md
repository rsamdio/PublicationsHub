# Framed reader → new tab (Option A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Publications Hub runs inside any third-party iframe, never mount the fullscreen in-page reader; open edition URLs in a new top-level tab instead, while leaving unframed (normal tab) reader UX unchanged.

**Architecture:** Detect framing with existing `isEmbeddedFrame()` (`window.self !== window.top`). Centralize “if framed → `window.open(..., '_blank', 'noopener,noreferrer')`” in one helper. Wire every public “open edition” entry point through it, and add a defense-in-depth redirect in `EditionReader` for direct `/p/.../e/...` loads inside an iframe. Remove the incomplete Option B embed CSS / attrs path so framed visits no longer apply `overflow:hidden` / fixed shell hacks.

**Tech Stack:** Next.js App Router, client components, existing `lib/urls.ts` + `lib/client/is-embedded.ts`, no new dependencies. No unit-test runner in repo — verify with `npm run build` and manual iframe smoke.

## Global Constraints

- Backend frozen: do not change `functions/`, Firestore/RTDB/Storage rules, or R2 for this work.
- Universal framing only: `window.self !== window.top` (or catch on `window.top`) — no RSAMDIO-only API, no `?embed=` flag, no `postMessage`.
- Unframed reader UX must stay identical (same route, same fullscreen flipbook).
- Studio in-page hash reader (`#/r/…`) is out of scope; do not change studio overlay behavior for this plan.
- Keep CSP `frame-ancestors` allowlist in `netlify.toml` so Home / About / Series remain frameable.
- Do not recreate legacy HTML redirects; only canonical `/p/…` and `/p/…/e/…` paths.
- Prefer one shared helper over duplicating `window.open` logic in each component.

---

## File map

| File | Role |
|------|------|
| `lib/client/is-embedded.ts` | Keep `isEmbeddedFrame()`; add `openEditionIfEmbedded(path)`; remove or stop exporting unused Option B attr helpers after Task 4. |
| `components/PublicationDetail.tsx` | Series page: “Read latest”, edition cards, Read buttons — break out when framed. |
| `components/ShelfCatalog.tsx` | Featured edition cards link to `/e/…` — break out when framed. |
| `components/EditionReader.tsx` | Defense: if framed on mount, open same URL in new tab + `router.replace` to series; never call `openReader`. |
| `app/globals.css` | Delete `data-reader-embed` CSS block (Option B leftover). |
| `lib/client/viewer.js` | Remove embed-only branches that only served Option B (attrs sync, embed ResizeObserver gate, skip-scroll-lock-only-for-embed). Prefer simplifying back to top-level page-mode behavior; keep any container sizing that still helps top-level if already shared. |
| `AGENTS.md` | Document Option A behavior + smoke checklist. |

Optional (only if crawl links are clickable in-frame and reachable): `components/PublicationCrawlSummary.tsx` — same helper on edition `Link`s. Prefer defense-in-depth in `EditionReader` over chasing every SEO link.

---

### Task 1: Shared framed navigation helper

**Files:**
- Modify: `lib/client/is-embedded.ts`
- Verify: `npx tsc --noEmit` (or `npm run build` if tsc not scripted)

**Interfaces:**
- Consumes: existing `isEmbeddedFrame()`, `absoluteUrl` from `@/lib/urls`
- Produces:
  - `isEmbeddedFrame(): boolean` (unchanged)
  - `openEditionIfEmbedded(path: string, event?: { preventDefault(): void }): boolean` — returns `true` if it handled navigation (caller must not `router.push` / follow link)

- [ ] **Step 1: Implement helper in `lib/client/is-embedded.ts`**

Keep `isEmbeddedFrame` as-is. Add:

```ts
import { absoluteUrl } from '@/lib/urls';

/**
 * When running inside an iframe, open the edition (or any same-origin path)
 * in a new top-level tab and return true. Otherwise return false so the
 * caller can use normal in-app navigation.
 */
export function openEditionIfEmbedded(
  path: string,
  event?: { preventDefault(): void }
): boolean {
  if (!isEmbeddedFrame()) return false;
  event?.preventDefault();
  const href = absoluteUrl(path);
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}
```

Leave `applyReaderEmbedAttrs` / `clearReaderEmbedAttrs` in place for now (removed in Task 4) so Task 1 alone does not break current `EditionReader` imports mid-migration.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: exit 0 (no new errors from this file).

- [ ] **Step 3: Commit**

```bash
git add lib/client/is-embedded.ts
git commit -m "$(cat <<'EOF'
Add openEditionIfEmbedded helper for iframe break-out.

EOF
)"
```

---

### Task 2: Series page + catalog entry points

**Files:**
- Modify: `components/PublicationDetail.tsx`
- Modify: `components/ShelfCatalog.tsx`
- Verify: manual iframe smoke (see Step 4)

**Interfaces:**
- Consumes: `openEditionIfEmbedded`, `editionPath`, `absoluteUrl` (already used where needed)
- Produces: framed clicks on Read / edition cards open new tab; unframed behavior unchanged

- [ ] **Step 1: Update `openEdition` in `PublicationDetail.tsx`**

Replace:

```ts
const openEdition = (ed: any) => {
  router.push(editionPath(seriesId, ed.id));
};
```

with:

```ts
const openEdition = (ed: any) => {
  const path = editionPath(seriesId, ed.id);
  if (openEditionIfEmbedded(path)) return;
  router.push(path);
};
```

Import `openEditionIfEmbedded` from `@/lib/client/is-embedded`.

- [ ] **Step 2: Gate the “Read latest edition” `Link`**

On the existing latest-edition `Link`, add:

```tsx
onClick={(e) => {
  openEditionIfEmbedded(editionPath(seriesId, group.latestEdition.id), e);
}}
```

(Do not set `target="_blank"` unconditionally — only framed visits should break out; SSR cannot know framing.)

- [ ] **Step 3: Gate Featured edition cards in `ShelfCatalog.tsx`**

On `FeaturedCard`’s overlay `Link` (`href={editionPath(...)}`), add:

```tsx
onClick={(e) => {
  openEditionIfEmbedded(href, e);
}}
```

Import `openEditionIfEmbedded` from `@/lib/client/is-embedded`.

Series cards that use `publicationPath` only (no `/e/`) must **not** break out — leave them as normal in-iframe navigation.

- [ ] **Step 4: Manual smoke (local)**

1. `npm run dev`
2. Open a minimal host page (or browser console on another origin is harder locally — use a local HTML file):

```html
<iframe
  src="http://localhost:3000/"
  style="width:1440px;height:900px;transform:scale(0.4);transform-origin:top left;border:0"
></iframe>
```

3. Framed: Home → series → **Read latest** → new tab opens reader; iframe stays on series (or does not mount fullscreen reader).
4. Framed: Featured card (if present) → same new-tab behavior.
5. Top-level `http://localhost:3000/` → Read still opens in-page reader as today.

- [ ] **Step 5: Commit**

```bash
git add components/PublicationDetail.tsx components/ShelfCatalog.tsx
git commit -m "$(cat <<'EOF'
Break out to a new tab for framed edition navigation.

EOF
)"
```

---

### Task 3: EditionReader defense-in-depth (direct `/e/` in iframe)

**Files:**
- Modify: `components/EditionReader.tsx`
- Verify: iframe load of `/p/{seriesId}/e/{editionId}` opens new tab + leaves series in frame

**Interfaces:**
- Consumes: `isEmbeddedFrame`, `openEditionIfEmbedded` (or `window.open` + `absoluteUrl` + `editionPath`), `publicationPath`, `useRouter`
- Produces: when framed, never calls viewer `openReader`; replaces route to series page

- [ ] **Step 1: Early framed escape before chrome / openReader**

At the top of the component body (after hooks that are always safe), track framed state and short-circuit open:

```tsx
const [framedEscape, setFramedEscape] = useState(false);

useEffect(() => {
  if (!isEmbeddedFrame()) return;
  setFramedEscape(true);
  const path = editionPath(seriesId, editionId);
  openEditionIfEmbedded(path);
  router.replace(publicationPath(seriesId));
}, [seriesId, editionId, router]);
```

Import `editionPath`, `isEmbeddedFrame`, `openEditionIfEmbedded`.

Important ordering:

1. Do **not** call `applyReaderEmbedAttrs` on this path.
2. Do **not** dynamically import / call `openReader` when `framedEscape` is true or when `isEmbeddedFrame()` is true on the open effect.
3. Show a minimal placeholder while escaping (optional one line: “Opening reader…”) so the iframe does not flash fullscreen chrome.

Refactor the existing open effect to:

```ts
useEffect(() => {
  if (isEmbeddedFrame()) return;
  // …existing openReader logic…
}, [/* same deps */]);
```

- [ ] **Step 2: Smoke direct URL**

In the same scaled iframe, set `src` to a known edition URL:

`http://localhost:3000/p/{seriesId}/e/{editionId}`

Expected:

- New tab opens that edition (top-level reader works).
- Iframe navigates to `/p/{seriesId}` (series UI), no `#reader-view` fullscreen takeover.

Top-level same URL: unchanged in-page reader.

- [ ] **Step 3: Commit**

```bash
git add components/EditionReader.tsx
git commit -m "$(cat <<'EOF'
Escape framed edition routes to a new tab before opening the reader.

EOF
)"
```

---

### Task 4: Remove incomplete Option B embed path

**Files:**
- Modify: `app/globals.css` (delete `data-reader-embed` block ~lines 440–484)
- Modify: `components/EditionReader.tsx` (remove `applyReaderEmbedAttrs` / `clearReaderEmbedAttrs` usage)
- Modify: `lib/client/is-embedded.ts` (remove `applyReaderEmbedAttrs` / `clearReaderEmbedAttrs` if unused)
- Modify: `lib/client/viewer.js` (remove embed-only attr sync + embed-only ResizeObserver / scroll-lock branching that only existed for Option B)
- Modify: `AGENTS.md` (document Option A)
- Verify: `npm run build`

**Interfaces:**
- Consumes: none new
- Produces: no `data-reader-embed` styling; viewer page-mode again assumes top-level tab only for public `/e/` routes

- [ ] **Step 1: Delete embed CSS**

Remove the entire block starting at the comment `Iframe embed (rsamdio.org):` through the `html[data-reader-embed='true'].reader-page-active` rules. Keep the normal `html.reader-page-active` and `#reader-view.reader-page` rules for top-level.

- [ ] **Step 2: Strip attrs from EditionReader**

Remove imports and calls of `applyReaderEmbedAttrs` / `clearReaderEmbedAttrs`. Keep the Task 3 framed escape.

- [ ] **Step 3: Clean `is-embedded.ts`**

File should export only:

- `isEmbeddedFrame`
- `openEditionIfEmbedded`

Delete attr helpers.

- [ ] **Step 4: Simplify `viewer.js` embed branches**

Remove:

- reads of `dataset.readerEmbed`
- post-inject code that sets `data-reader-embed`
- embed-only `ResizeObserver` / “skip scroll lock only when embed” forks **if** they exist solely for Option B

Restore page-mode scroll-lock (`reader-page-active`) for normal top-level opens. Do **not** change studio hash-overlay behavior.

If a shared wrapper-based resize path also helps top-level, leave that shared path; only delete frame-gated dead code.

- [ ] **Step 5: Update `AGENTS.md`**

Replace the current iframe bullet (container-sized layout) with:

- Iframe embed (any host): when `window.self !== window.top`, edition “Read” / `/e/…` opens in a **new tab** (`noopener`); catalog and series stay in the frame. Top-level reader UX unchanged. Framing allowlist remains CSP `frame-ancestors` in `netlify.toml`.

Smoke checklist:

- Framed Home + About: OK
- Framed Series: OK (no preview chrome break)
- Framed Read / Featured edition / direct `/e/`: new tab; iframe stays on catalog or series
- Unframed `/e/`: fullscreen reader unchanged

- [ ] **Step 6: Build**

Run: `npm run build`

Expected: success.

- [ ] **Step 7: Final iframe + top-level smoke**

Repeat Task 2 / Task 3 checks after cleanup.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/EditionReader.tsx lib/client/is-embedded.ts lib/client/viewer.js AGENTS.md
git commit -m "$(cat <<'EOF'
Remove iframe embed reader layout; rely on new-tab break-out.

EOF
)"
```

---

## Acceptance criteria (partner contract)

1. Framed Home + About still work.
2. Framed navigation to Series does not break the parent preview chrome.
3. Opening Reader while framed opens cleanly in a **new tab** (Option A); catalog/series remain in the iframe.
4. Unframed (normal tab) reader UX stays unchanged.

## Out of scope

- Option B (true in-iframe container reader).
- Host-side changes on `rsamdio.org`.
- `postMessage` height protocol.
- Featured grid truncation / cover backlog.

## Self-review

| Spec item | Task |
|-----------|------|
| `isFramed` detection | Task 1 (`isEmbeddedFrame`) |
| Framed Read → new tab | Tasks 2–3 |
| Series stays in frame | Tasks 2–3 |
| Direct `/e/` while framed | Task 3 |
| Unframed unchanged | Tasks 2–4 smoke |
| Universal (not RSAMDIO-only) | Global constraints + helper |
| Remove broken Option B leftovers | Task 4 |
| Keep frame-ancestors for Home/About | Global constraints (no change required) |
