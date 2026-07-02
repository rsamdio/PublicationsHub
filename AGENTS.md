# PublicationsHub — persistent agent context

Use this file as the source of truth for where live product behavior lives.
The app is in the repository root. Treat `Dump/` and `newfolderOLD/` as archive/reference-only.

## Product surfaces

| File | Audience | Runtime path |
|------|----------|--------------|
| [`index.html`](index.html) | Public readers | [`js/main.js`](js/main.js) -> [`js/shelf.js`](js/shelf.js) -> RTDB public catalog + shared reader overlay |
| [`publication.html`](publication.html) | Public readers (one publication page) | [`js/series-detail.js`](js/series-detail.js) -> [`js/url-routes.js`](js/url-routes.js) + dynamic [`js/viewer.js`](js/viewer.js) |
| [`studio.html`](studio.html) | Publisher owners/editors | [`js/dashboard/main.js`](js/dashboard/main.js) -> [`js/db-publisher.js`](js/db-publisher.js) + [`js/storage.js`](js/storage.js) |
| [`admin.html`](admin.html) | Platform staff (`admin` and `manager` tiers) | [`js/admin/main.js`](js/admin/main.js) -> [`js/db-admin.js`](js/db-admin.js) + callables |

## Architecture in one paragraph

- Firestore is the system of record and all client writes go to Firestore/callables.
- Realtime Database is the read-optimized mirror for public, publisher, and admin UIs.
- Firestore trigger mirrors in [`functions/mirror.js`](functions/mirror.js) keep RTDB in sync.
- Firestore client reads for mirrored collections are denied by [`firestore.rules`](firestore.rules), so clients read RTDB (`js/db-public.js`, `js/db-publisher.js`, `js/db-admin.js`).

## URL contract (canonical + legacy)

Implemented in [`js/url-routes.js`](js/url-routes.js); hash writing comes from `formatReadLocationHash` in [`js/viewer.js`](js/viewer.js).

| Kind | Canonical shape | Legacy still parsed |
|------|------------------|---------------------|
| Publication page | `publication?s=<canonicalId>` | `?series=`, `?id=`, `/series.html` |
| Reader hash | `#/r/<editionRef>` | `#/read/<editionRef>`, `#read/<editionRef>` |
| Full deep link | `publication?s=<canonicalId>#/r/<editionRef>` | older query/hash combos still resolve |

Host routing is defined in [`_redirects`](_redirects): pretty routes for `/publication`, `/privacy`, `/terms`, and redirects from legacy pages including `/dashboard.html`.

## Data model and flows

### Firestore authoritative collections

- `publishers`, `series`, `editions`
- `users/{uid}/publisherMemberships/{publisherId}`
- `publishers/{publisherId}/invites`, `publishers/{publisherId}/roster`
- `platform_admins`, `platform_invites`
- `pdf_upload_sessions` (large-upload staging bookkeeping)
- legacy `publications` (migration/backfill compatibility)

### RTDB mirror paths used by clients

- Public: `public/catalog/editions`, `public/catalog/series`
- Publisher studio: `org/{publisherId}/profile|series|editions|invites|roster`, `userMemberships/{uid}`
- Platform: `platform/publishers`, `platform/staff`, `platform/staffInvites`, `platform/stats`, `platformAdmins/{uid}`

### Reader flow

- Home click in [`js/shelf.js`](js/shelf.js) builds canonical deep link with `buildEditionDeepLink`.
- `publication` page parses `s` + hash and opens reader through [`js/viewer.js`](js/viewer.js).
- Dashboard reader stays on `studio.html` and uses hash-based open behavior.

### Public home catalog (All Publications)

Implemented in [`js/shelf.js`](js/shelf.js) + `#shelf-grid` in [`index.html`](index.html).

- One-shot RTDB fetch (`fetchPublishedCatalog` + `fetchPublishedSeriesMap`); full catalog stays in memory for search.
- **Featured** row renders all featured editions; **All Publications** groups editions into series (`groupEditionsIntoSeries`) and renders incrementally.
- Initial batch: **12** series cards (`SHELF_PAGE_SIZE`); more load via **infinite scroll** (`IntersectionObserver` on `#shelf-scroll-sentinel`, ~480px root margin).
- Short viewports auto-fill batches until the sentinel leaves view or the list is exhausted.
- Search (`#shelf-search`) filters the in-memory series list and resets to the first batch; status line `#shelf-grid-status` shows “Showing X of Y”.
- Off-screen cards use `content-visibility: auto` + `contain-intrinsic-size` on `#shelf-grid > .edition-card` in `index.html` for cheaper layout/paint.

### Platform admin (`admin.html`)

Implemented in [`js/admin/main.js`](js/admin/main.js).

- **Publishers**: list search, CSV export (counts, owners/editors, pending invites), bulk CSV create (`publisher_name`, `owner_name`, `owner_email`, optional `internal_reference`), stepped drill-down (org → publications/team → editions), edit publisher name/reference.
- **Catalog**: all vs featured tables with search; CSV export (includes `uploaded_at`, cover/reader URLs); cover/reader link columns; edit series/edition metadata; feature toggle; delete edition.
- **Platform team**: invite/revoke staff, mirror rebuild (`backfillMirror`), cover-thumb backfill (`backfillCoverThumbs`) — full admins only for some ops (see `tier`).

### Publisher identity (slug)

- Public URLs use **series/edition IDs** (`publication?s=…`, `#/r/<editionRef>`), not publisher slugs.
- `createPublisher` requires `name`, `owner_name`, `owner_email`; optional `internal_reference` disambiguates same display names in admin. **No slug generation or uniqueness check** on create.
- Legacy `slug` may still exist on older publisher docs and in CSV export/mirror; it is not used for routing.

## Upload/storage flow

- Small PDFs (<= about 28 MB): HTTP `uploadPublicationPdf`.
- Large PDFs (up to 65 MB): callable `prepareEditionPdfUpload` -> signed Storage PUT -> callable `finalizeEditionPdfUpload` -> object moved to R2.
- Covers: `uploadPublicationCover` and `uploadSeriesCover` (WebP + optional thumb).
- Browser never uses Firebase Storage SDK directly for app uploads; Storage is a staging layer for large PDF flow only.
- R2 credentials are server-side only (functions params + secrets).

## Functions map (authoritative backend behavior)

- Main callable/http exports in [`functions/index.js`](functions/index.js) and [`functions/extra-exports.js`](functions/extra-exports.js).
- Key callables include:
  - publisher/platform invite lifecycle
  - publisher/platform staff management
  - `createPublisher`, `setEditionFeatured`
  - destructive ops: `deleteEditionAssets`, `deleteSeries`, `deletePublisher`
  - maintenance: `backfillMirror`, `backfillCoverThumbs`
- Firestore->RTDB mirror triggers live in [`functions/mirror.js`](functions/mirror.js).

## Security model

- RTDB: clients read allowed paths; all client writes denied in [`database.rules.json`](database.rules.json).
- Firestore: mirrored collections deny client reads; controlled writes for series/editions and membership-scoped docs.
- Storage: client reads/writes denied in [`storage.rules`](storage.rules); uploads happen via functions endpoints/signed URLs.

## Deployment and environment facts

- Functions region must stay `us-central1` (see [`js/firebase-init.js`](js/firebase-init.js)).
- This repo is currently project/domain pinned (`rsapublicationhub` + production redirect/canonical values). When cloning to a new environment, update:
  - [`js/config.js`](js/config.js)
  - [`.firebaserc`](.firebaserc)
  - [`_redirects`](_redirects)
  - HTML canonical/OG URLs
- Static host routing is driven by [`_redirects`](_redirects). [`netlify.toml`](netlify.toml) currently defines headers only (no explicit publish dir stanza).
- Non-fingerprinted assets under `js/*` and `css/*` are currently long cached in [`netlify.toml`](netlify.toml); keep this in mind during debugging stale frontend behavior (see Operational gotchas).

## Operational gotchas

- After mirror/rules/function changes, run `backfillMirror` once from admin or callable to repopulate RTDB.
- If first admin was bootstrapped directly in Firestore before mirror triggers were live, backfill ensures `platformAdmins/{uid}` appears in RTDB.
- Large upload signed URLs can fail if required Storage IAM/CORS is missing; use scripts/docs in `scripts/` and [`docs/STORAGE.md`](docs/STORAGE.md).
- **Local static servers** (Live Server, `npx serve`, Python `http.server`) do not apply [`_redirects`](_redirects); pretty paths like `/publication` 404 locally. Use `publication.html?…` or `netlify dev` for rewrite parity.
- **Stale frontend during debugging**: `js/*` and `css/*` are long-cached in [`netlify.toml`](netlify.toml); hard-refresh or cache-bust when verifying shelf/admin changes.

## Authoritative paths for product work

- Entry pages: `index.html`, `publication.html`, `studio.html`, `admin.html`
- Core frontend: `js/shelf.js`, `js/series-detail.js`, `js/viewer.js`, `js/url-routes.js`
- Data clients: `js/db-public.js`, `js/db-publisher.js`, `js/db-admin.js`
- Backend: `functions/index.js`, `functions/extra-exports.js`, `functions/mirror.js`
- Policy/config: `firestore.rules`, `database.rules.json`, `storage.rules`, `firebase.json`, `_redirects`
- Docs: `README.md`, `docs/FIRESTORE_SCHEMA.md`, `docs/MIGRATION.md`, `docs/STORAGE.md`

## Tooling/indexing hint

Prefer root `*.html`, `js/*`, `functions/*`, and rules/docs above. Ignore archive folders unless explicitly migrating old assets.
