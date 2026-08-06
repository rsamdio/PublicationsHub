# PublicationsHub — persistent agent context

Use this file as the source of truth for live product behavior.
The app is a **Next.js App Router** frontend at the repository root (Netlify).
**Backend is frozen**: [`functions/`](functions/), Firestore / RTDB / Storage rules, and R2 stay as-is — do not change them for frontend-only URL or UI work.

If folders named `Dump/` or `newfolderOLD/` appear locally, treat them as archive-only and never wire them into the app.

## Canonical hosts

| Host | Role |
|------|------|
| `https://publications.rsamdio.org` | Production canonical (`NEXT_PUBLIC_SITE_URL`) |
| `https://publicationshub.netlify.app` | Netlify default subdomain — **301** forced redirect to canonical ([`netlify.toml`](netlify.toml)) |

## Product surfaces

| Route | Audience | Implementation |
|------|----------|----------------|
| [`/`](app/page.tsx) | Public readers | [`components/ShelfCatalog.tsx`](components/ShelfCatalog.tsx) → RTDB public catalog |
| [`/p/[seriesId]`](app/p/[seriesId]/page.tsx) | Public readers | [`components/PublicationDetail.tsx`](components/PublicationDetail.tsx) |
| [`/p/[seriesId]/e/[editionId]`](app/p/[seriesId]/e/[editionId]/page.tsx) | Public readers (reader) | Same publication shell + [`lib/client/viewer.js`](lib/client/viewer.js) |
| [`/studio`](app/studio/page.tsx) | Publisher owners/editors | [`components/StudioApp.tsx`](components/StudioApp.tsx) → [`lib/client/dashboard/main.js`](lib/client/dashboard/main.js) |
| [`/admin`](app/admin/page.tsx) | Platform staff | [`components/AdminApp.tsx`](components/AdminApp.tsx) → [`lib/client/admin/main.js`](lib/client/admin/main.js) |
| [`/privacy`](app/privacy/page.tsx), [`/terms`](app/terms/page.tsx) | Legal | Static policy HTML via [`lib/client/privacy-main.ts`](lib/client/privacy-main.ts) / [`terms-main.ts`](lib/client/terms-main.ts) |

## UI theme

- Product chrome is **light only**. Page background `background-light` (`#f6f3ed`); nav/footer `#fffcf8`. Accent/`primary` is Rotaract cranberry pink (`#d81a6a`).
- The **PDF reader** (`#reader-view`) is themed separately: **light by default**, with an in-reader toggle to dark. Preference is stored in `localStorage` (`pubhub-reader-theme`). Site chrome stays light-only.
- Reader layout is **reactive**: single-page vs two-page spread follows `(width ≥ 768) || (landscape && width ≥ 560)` and rebuilds on orientation/width class change. Compact toolbar (one row) applies below 768px width or short landscape (`max-height: 500px`).
- Reader open is **progressive / zero-cost**: cover image as page-1 stand-in; intent warm via `warmReaderForEdition` (vendor + Range prefetch); first-spread priority queue. No page-raster pipeline or paid CDN.
- **Iframe embed** (e.g. `rsamdio.org` framing this site): when `window.self !== window.top`, edition reader sets `data-reader-embed` and uses container-sized layout (no `fixed`/`100dvh` tab chrome). Standalone top-level visits are unchanged. Framing allowlist: CSP `frame-ancestors` in [`netlify.toml`](netlify.toml) (`'self'` + `rsamdio.org`).

### Embed smoke checklist

- Top-level `/p/.../e/...`: full-viewport reader, scroll lock, spread rules unchanged.
- Iframed from `rsamdio.org`: Home → series → Read; flipbook fits the frame; resize iframe triggers relayout; Back returns to series inside the frame.
- Response headers: `Content-Security-Policy: frame-ancestors …` present; no `X-Frame-Options: SAMEORIGIN`.

## Architecture

- **Next.js on Netlify** (`@netlify/plugin-nextjs`) is the only frontend.
- Firestore is the system of record; client writes go to Firestore / callables.
- Realtime Database is the read-optimized mirror. Triggers in [`functions/mirror.js`](functions/mirror.js) keep RTDB in sync.
- Clients read RTDB via [`lib/firebase/db-public.js`](lib/firebase/db-public.js), [`db-publisher.js`](lib/firebase/db-publisher.js), [`db-admin.js`](lib/firebase/db-admin.js). Firestore client reads for mirrored collections stay denied.

## Canonical URL schema

Implemented in [`lib/urls.ts`](lib/urls.ts).

| Surface | URL |
|---------|-----|
| Home / catalog | `/` |
| Publication | `/p/[seriesId]` |
| Read edition | `/p/[seriesId]/e/[editionId]` |
| Studio / Admin | `/studio`, `/admin` |
| Legal | `/privacy`, `/terms` |

**Edge cases:** `/p` and `/p/` → **308** to `/`. `/p/[seriesId]/e` (no edition) → **308** to `/p/[seriesId]`. Unknown series → not-found UI. Studio may still use hash `#/r/…` for its **in-page** reader overlay only.

No public legacy URL compatibility (no `.html` redirects, no `/publication?s=` bridge). Canonical paths only.

Standalone editions (no `series_id`) use `/p/[editionId]/e/[editionId]`.

## Data model and flows

### Firestore authoritative collections

- `publishers`, `series`, `editions`
- `users/{uid}/publisherMemberships/{publisherId}`
- `publishers/{publisherId}/invites`, `publishers/{publisherId}/roster`
- `platform_admins`, `platform_invites`
- `pdf_upload_sessions`
- legacy `publications` (migration / backfill compatibility only — see [`docs/MIGRATION.md`](docs/MIGRATION.md))

### RTDB mirror paths used by clients

- Public: `public/catalog/editions`, `public/catalog/series`
- Publisher studio: `org/{publisherId}/profile|series|editions|invites|roster`, `userMemberships/{uid}`
- Platform: `platform/publishers`, `platform/staff`, `platform/staffInvites`, `platform/stats`, `platformAdmins/{uid}`

### Reader flow

- Catalog cards link to `/p/…` or `/p/…/e/…` via [`lib/urls.ts`](lib/urls.ts).
- Edition route opens flipbook through [`lib/client/viewer.js`](lib/client/viewer.js) using **same-origin** assets under [`public/vendor/`](public/vendor/) (PDF.js `3.11.174`, StPageFlip `2.0.7`) plus [`public/st-page-flip.css`](public/st-page-flip.css).
- Closing the public reader navigates back to `/p/[seriesId]`.

### Public home catalog (All Publications)

[`components/ShelfCatalog.tsx`](components/ShelfCatalog.tsx):

- One-shot RTDB fetch; full catalog in memory for search.
- **Featured** row + **All Publications** series groups (`groupEditionsIntoSeries`).
- Initial batch **12**; infinite scroll (~480px root margin); short viewports auto-fill.
- Search resets to first batch; “Showing X of Y”.
- Off-screen cards: `content-visibility` on `#shelf-grid > .edition-card` in [`app/globals.css`](app/globals.css).

### Platform admin (`/admin`)

- **Publishers**: search, CSV export, bulk CSV create, drill-down, edit name/reference.
- **Catalog**: search, CSV export, feature toggle, edit/delete.
- **Platform team**: invite/revoke, `backfillMirror`, `backfillCoverThumbs` (tier-gated).

### Publisher identity

- Public URLs use **series/edition IDs**, not publisher slugs.
- `createPublisher` takes `name`, `owner_name`, `owner_email`; optional `internal_reference`. No slug generation.

## Upload / storage flow

Unchanged and backend-owned: small PDF multipart `uploadPublicationPdf`; large PDF signed Storage PUT + finalize → R2; covers via upload HTTP endpoints. R2 secrets stay server-side only ([`lib/firebase/storage.js`](lib/firebase/storage.js), [`docs/STORAGE.md`](docs/STORAGE.md)).

## Functions map (authoritative backend — frozen)

- [`functions/index.js`](functions/index.js), [`functions/extra-exports.js`](functions/extra-exports.js), [`functions/mirror.js`](functions/mirror.js).
- Region **`us-central1`** ([`lib/firebase/init.ts`](lib/firebase/init.ts)).

## Security model

Unchanged: RTDB client read / no client write; Firestore mirrored reads denied; Storage client denied.

## Deployment and environment

- **Frontend:** Netlify + `@netlify/plugin-nextjs` ([`netlify.toml`](netlify.toml)). Build: `npm run build` → `next build`.
- **Canonical redirect:** `publicationshub.netlify.app/*` → `publications.rsamdio.org/:splat` (**301**, `force = true`).
- **Backend:** `firebase deploy --only functions` (and rules) — separate from Netlify.
- **Env (frontend):** defaults live in [`lib/firebase/config.ts`](lib/firebase/config.ts). Optional Netlify / `.env.local` overrides via `NEXT_PUBLIC_*` if you ever need them. Never commit `.env` / `.env.local`.
- **Env (functions):** copy [`functions/.env.example`](functions/.env.example) → `functions/.env` locally; R2 access secrets via Firebase secrets. Never commit `functions/.env`.
- **Static assets:** [`public/images`](public/images), [`public/fonts`](public/fonts), [`public/vendor`](public/vendor).

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Routes match production (`/p/…`, `/studio`, `/admin`).

## Authoritative paths for product work

| Area | Path |
|------|------|
| App Router | `app/` |
| React UI | `components/` |
| URLs | `lib/urls.ts` |
| SEO | `lib/seo/`, checklist [`docs/SEO.md`](docs/SEO.md) |
| Firebase clients | `lib/firebase/` |
| Imperative studio / admin / viewer | `lib/client/` |
| Catalog helpers | `lib/catalog/` |
| Backend (frozen) | `functions/` |
| Policy | `firestore.rules`, `database.rules.json`, `storage.rules` |
| One-time data migrate | `scripts/migrate-publications.mjs` + [`docs/MIGRATION.md`](docs/MIGRATION.md) |

## Do not reintroduce

The pre-Next static site is gone. Do not recreate top-level `*.html`, `js/`, `css/`, or public legacy redirects — use App Router + `public/` and the canonical `/p/…` URL schema only.
