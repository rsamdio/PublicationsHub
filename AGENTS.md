# PublicationsHub — agent context

Use this file as the **source of truth** for which paths matter. The app lives at the **repository root**; older copies and design dumps may live under `Dump/` (reference only).

## Entry HTML (reader surfaces)

| File | Audience | Scripts / data |
|------|----------|----------------|
| [`index.html`](index.html) | **Public readers** — featured + **all publications** (series grid) + flipbook. No auth. | [`js/main.js`](js/main.js) → [`js/shelf.js`](js/shelf.js) + [`js/catalog-series.js`](js/catalog-series.js) → [`js/db-public.js`](js/db-public.js) (**Realtime DB** mirror). |
| [`publication.html`](publication.html) | **Publication (series) detail** — hero + editions grid + reader (same as index). | [`js/series-detail.js`](js/series-detail.js) → [`js/viewer.js`](js/viewer.js) + catalog grouping. |
| [`studio.html`](studio.html) | **Publishers / editors** — Google sign-in, series, editions, GitHub PDF upload. | [`js/dashboard/main.js`](js/dashboard/main.js) → [`js/db-publisher.js`](js/db-publisher.js): **RTDB reads**, **Firestore writes**; [`js/storage.js`](js/storage.js), [`js/viewer.js`](js/viewer.js). |
| [`admin.html`](admin.html) | **Platform super admins** — org list from RTDB; callables + **backfillMirror**. | [`js/admin/main.js`](js/admin/main.js) → [`js/db-admin.js`](js/db-admin.js) (**RTDB**), `httpsCallable`. |

**Hybrid data:** **Firestore** = system of record + all client **writes** (and server/callables). **Realtime Database** = read-optimized **mirror** maintained by [`functions/mirror.js`](functions/mirror.js). **Firestore client reads** on mirrored collections are **denied** ([`firestore.rules`](firestore.rules)); clients read RTDB ([`database.rules.json`](database.rules.json)).

## Public URL contract (standardized)

Implementations live in [`js/url-routes.js`](js/url-routes.js); [`js/viewer.js`](js/viewer.js) writes the reader hash via `formatReadLocationHash`.

| Kind | Shape | Notes |
|------|--------|--------|
| **Reader** | `#/r/<editionRef>` | Short hash. **Legacy:** `#/read/<editionRef>` (still parsed). `editionRef` = URL-encoded edition **id** or optional mirrored **slug**. Alternate: `#read/…` (no slash after `#`). |
| **Publication page** | `publication?s=<canonicalId>` (pretty path; file [`publication.html`](publication.html)) | Short query key **`s`**. **Legacy:** `?series=` and `?id=`, and `/publication.html` → 301 to `/publication` ([`_redirects`](_redirects)). **Old path:** `series.html` → 301 to `/publication`. |
| **Library home** | `index.html` (`#all-publications` for the series grid) | Featured + all publications + reader overlay. Edition opens **redirect** to `publication?s=…#/r/…` via [`js/shelf.js`](js/shelf.js) (`buildEditionDeepLink` + `getSeriesCanonicalIdForPublication`). |
| **Canonical read URL** | `publication?s=<canonicalId>#/r/<editionRef>` | Same for home grid, shares, and bookmarks (standalone editions use `s=<editionId>`). Publisher **dashboard** still opens the reader on `studio.html` with hash only. |

**Local static servers:** `publication?…` may 404 unless the host maps it to `publication.html` (Netlify does via [`_redirects`](_redirects)). For local testing without that rewrite, open **`publication.html?…`** directly or use **Netlify Dev**.

## Authoritative paths (product work)

| Path | Role |
|------|------|
| `index.html` | Public library shell — featured + all publications (series grid) + reader overlay. |
| `publication.html` | One series + editions + reader overlay. |
| `js/catalog-series.js` | Group flat editions by `series_id` (or single edition key). |
| `js/url-routes.js` | **Canonical URL builders + `series` / `id` query parsing.** |
| `js/series-detail.js` | `publication?s=` hero + grid + reader wiring. |
| `studio.html` | Publisher studio shell + upload modal + reader overlay. |
| `admin.html` | Platform admin UI. |
| `js/main.js` | Explore-only: nav, shelf bootstrap, reader controls. |
| `js/dashboard/main.js` | Studio: auth, membership-based publisher context, publications → editions flow, series CRUD, upload, reader. |
| `js/admin/main.js` | Admin gate, publisher table, callables. |
| `js/shelf.js` | Featured + publication series grid + reader; `fetchPublishedCatalog` + `groupEditionsIntoSeries` + reader. |
| `js/viewer.js` | PDF.js + StPageFlip. |
| `js/auth.js` | Google sign-in, sign-out, `onAuthStateChange`. |
| `js/db-public.js` | Public catalog from RTDB `public/catalog/editions`. |
| `js/db-publisher.js` | RTDB reads (`userMemberships`, `org/...`); Firestore `addDoc` for series/editions. |
| `js/db-admin.js` | RTDB: `platformAdmins`, `platform/publishers`, `platform/stats`. |
| `js/db.js` | Re-exports `db-public` for backward compatibility. |
| `js/firebase-init.js` | `initializeApp`, Auth, Firestore, **Realtime Database** (`databaseURL`), **Functions (`us-central1`)**. |
| `js/storage.js` | `uploadEditionPdf` → HTTPS `uploadPublicationPdf` (no GitHub token client-side). |
| `js/config.js` | Firebase web config only; optional `uploadPublicationPdfUrl` for emulator. |
| `database.rules.json` | RTDB security; deploy with `firebase deploy --only database`. |
| `firestore.rules` / `firestore.indexes.json` | Writes allowed where needed; **reads denied** on mirrored docs. |
| `functions/index.js` | **2nd gen** callables + `uploadPublicationPdf`; re-exports [`functions/mirror.js`](functions/mirror.js). |
| `functions/mirror.js` | Firestore `onDocumentWritten` → RTDB; `backfillMirror` callable. |
| `docs/FIRESTORE_SCHEMA.md` | Collection map and fields. |
| `docs/MIGRATION.md` | Legacy `publications` → `editions`. |
| `docs/STORAGE.md` | Why PDFs use GitHub Functions, not Firebase Storage. |
| `README.md` | Human setup, bootstrap first admin, deploy. |

## Dependency flow (high level)

```
index.html → main.js → shelf.js → db-public.js → fbRtdb ← firebase-init.js ← config.js
                              → viewer.js

studio.html → dashboard/main.js → db-publisher.js (RTDB read + Firestore write), storage.js → uploadPublicationPdf, viewer.js

admin.html → admin/main.js → db-admin.js (RTDB), httpsCallable (incl. backfillMirror)
```

## Archive / non-authoritative

- **`Dump/`**, **`newfolderOLD/`** — snapshots; do not treat as the live app.

## Conventions

- **No build step** for the static app: serve the repo root over HTTP.
- **Functions region** must stay **`us-central1`** to match `getFunctions` in `firebase-init.js`.

## Indexing hint for tools

Prefer editing root `*.html` and `js/*`. Exclude `Dump/` unless migrating assets.
