[![Netlify Status](https://api.netlify.com/api/v1/badges/193b8ce9-785e-49c7-ae1c-75724394558a/deploy-status)](https://app.netlify.com/projects/publicationshub/deploys)

# PubHub / PublicationsHub

Next.js frontend for a multi-tenant digital library. **Firebase Functions / Firestore / RTDB / Storage / R2 backend is frozen** — clients call the same endpoints as before.

- **Readers** open `/`: browse **published** editions from the **Realtime Database** mirror—**featured** plus **all publications** (series grouped by `series_id`). The main grid loads **12 series cards at a time** with **infinite scroll**; search filters the full in-memory catalog. Read flipbooks **without signing in**. Publication pages live at **`/[seriesSlug]`**; the reader at **`/[seriesSlug]/[editionSlug]`**.
- **Editors / owners** open **`/studio`**: Google sign-in, Publications + Team tabs (uploads, covers, invites). Prefer a full page load into `/studio` so the studio boot script binds cleanly.
- **Platform staff** open **`/admin`**: Publishers, Catalog, Platform team (mirror rebuild, cover-thumb backfill for full admins).

Reader stack: PDF.js + StPageFlip. UI: Inter, **Rotaract cranberry pink** primary (`#d81a6a`), cream light-only chrome; the flipbook **reader overlay stays dark**.

**URLs:** see [`AGENTS.md`](AGENTS.md). Canonical shapes only: `/`, `/[seriesSlug]`, `/[seriesSlug]/[editionSlug]`, `/studio`, `/admin`, `/privacy`, `/terms`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Production-like Netlify preview: connect the repo and use [`netlify.toml`](netlify.toml) (`@netlify/plugin-nextjs`, `npm run build`).

## Configuration

Defaults for the live Firebase web project and site URL are in [`lib/firebase/config.ts`](lib/firebase/config.ts). Override with `NEXT_PUBLIC_*` in Netlify or a local `.env.local` only if needed. **R2 keys never go in the frontend.**

### Firebase (Auth + Firestore + Functions)

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. **Project settings → Your apps → Web** — set `NEXT_PUBLIC_FIREBASE_*` (including **`NEXT_PUBLIC_FIREBASE_DATABASE_URL`**).
3. **Authentication → Sign-in method**: enable **Google**. Authorized domains: production host + `localhost`.
4. Deploy rules/indexes:

   ```bash
   firebase use rsapublicationhub
   firebase deploy --only firestore,database,storage
   ```

5. After Functions deploy, open **`/admin`** as a platform admin and run **Rebuild mirror (backfillMirror)** once.

6. **Cloud Functions** (region **`us-central1`** — must match [`lib/firebase/init.ts`](lib/firebase/init.ts)):

   ```bash
   cd functions && npm install && cp .env.example .env && cd ..
   # Edit functions/.env: R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL
   echo -n 'YOUR_R2_ACCESS_KEY_ID' | firebase functions:secrets:set R2_ACCESS_KEY_ID
   echo -n 'YOUR_R2_SECRET_ACCESS_KEY' | firebase functions:secrets:set R2_SECRET_ACCESS_KEY
   firebase deploy --only functions
   ```

   See [`docs/STORAGE.md`](docs/STORAGE.md) for R2 CORS and public URL setup.

7. **Data model** — [`docs/FIRESTORE_SCHEMA.md`](docs/FIRESTORE_SCHEMA.md).
8. **SEO** — titles, OG/Twitter, sitemap/robots: [`docs/SEO.md`](docs/SEO.md).

### Bootstrap the first platform admin

Create Firestore `platform_admins/{uid}` with `tier: "admin"` for your Firebase Auth UID (Console one-time). Then sign in at **`/admin`**. Invite more staff from **Platform team**. Run **backfillMirror** so `platformAdmins/{uid}` exists in RTDB.

### Cloudflare R2 / troubleshooting

See [`docs/STORAGE.md`](docs/STORAGE.md). For invite index issues: `firebase deploy --only firestore:indexes`.

## Production checklist

1. `NEXT_PUBLIC_FIREBASE_*` / [`lib/firebase/config.ts`](lib/firebase/config.ts) match production; Auth authorized domains include the live hostname.
2. Canonical/OG via Next `metadata` (`NEXT_PUBLIC_SITE_URL`).
3. Deploy Functions + rules; run **backfillMirror** once.
4. Netlify builds with Next plugin ([`netlify.toml`](netlify.toml)); confirm `publicationshub.netlify.app` 301s to `publications.rsamdio.org`.

## Project structure

```
app/                 # Next.js App Router pages (+ robots.ts / sitemap.ts)
components/          # React UI (shelf, publication, studio/admin shells)
lib/
  urls.ts            # Canonical URL helpers
  firebase/          # Auth, RTDB/Firestore clients, uploads
  catalog/           # Series grouping, covers, icons
  client/            # Viewer + studio/admin imperative UIs
public/              # images, fonts, vendor (pdf.js / page-flip), st-page-flip.css
functions/           # Frozen Cloud Functions + mirrors
netlify.toml         # Next plugin + 301 netlify.app → canonical host
docs/
AGENTS.md            # Persistent agent / architecture context
```

## Tech stack

- Next.js 15 (App Router), React 19, TypeScript, Tailwind 3
- Firebase Auth, Firestore, RTDB, 2nd gen Functions (`us-central1`)
- Cloudflare R2 for PDFs/covers (server-side only)
- PDF.js 3.11.174, StPageFlip 2.0.7 (same-origin under `public/vendor/`)

## New-project checklist

When cloning to a new environment, update together:

- `NEXT_PUBLIC_FIREBASE_*` / [`lib/firebase/config.ts`](lib/firebase/config.ts)
- [`.firebaserc`](.firebaserc)
- `NEXT_PUBLIC_SITE_URL` and metadata
- Functions `.env` / R2 secrets for that GCP project
