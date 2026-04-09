# PubHub / PublicationsHub

A no-build web app for a multi-tenant digital library.

- **Readers** open [`index.html`](index.html): browse **published** editions from the **Realtime Database** mirror—**featured** plus **all publications** (series grouped by `series_id`)—and read flipbooks **without signing in**. **`publication?s=…`** (pretty URL; source file [`publication.html`](publication.html)) is the **publication (series) detail** page with editions and the same reader (legacy `?series=` / `?id=` and `/publication.html` still work). Old `publications.html` bookmarks redirect to the home page ([`_redirects`](_redirects)).
- **Editors / owners** open [`studio.html`](studio.html): Google sign-in, **Library** tab (publications → editions; **covers**, **issue dates**, uploads, deletes) and **Team** tab (owners invite by name+email; **one publisher per user**).
- **Platform staff** open [`admin.html`](admin.html): **Publishers** (new publisher, edit name, stepped browse: org → publications/team → editions), **Catalog** (*all* vs *featured*), **Platform team** (invite staff, pending invites + revoke, current staff + remove, RTDB mirror rebuild for full admins). **Managers** have a narrower callable surface than full **admins** (see `tier` on `platform_admins`).

Reader stack: PDF.js + StPageFlip. UI: Inter, blue primary, dark surfaces.

**URLs (static deployment):** see **Public URL contract** in [`AGENTS.md`](AGENTS.md). New links use **`publication?s=<canonicalId>#/r/<ref>`** (short query + hash); **`?series=`** and **`#/read/`** remain supported for old bookmarks. Publisher **dashboard** still embeds the reader on the same page with a hash.

## Run locally

Serve the **project root** over HTTP (required for ES modules). Examples:

- **VS Code / Cursor**: Live Server on **`index.html`**, **`studio.html`**, or **`admin.html`**.
- **Node**: `npx serve .` then open the printed URL.
- **Python**: `python3 -m http.server 8080` then open `http://localhost:8080`.

Do not open HTML as `file://` — ES modules and Firebase will not work.

## Configuration

Edit **`js/config.js`** with your Firebase web app config only. **R2 keys never go in the frontend** — PDFs and covers upload through **`uploadPublicationPdf`** / callables, which use **`R2_ACCESS_KEY_ID`** / **`R2_SECRET_ACCESS_KEY`** in **Secret Manager** and **`R2_*`** params from **`functions/.env`** (see [`docs/STORAGE.md`](docs/STORAGE.md)).

### Firebase (Auth + Firestore + Functions)

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. **Project settings → Your apps → Web** — copy config into `config.firebase`, including **`databaseURL`** from **Build → Realtime Database** (create default DB if needed). The URL is usually `https://<PROJECT_ID>-default-rtdb.firebaseio.com` or a regional `*.firebasedatabase.app` host.
3. **Authentication → Sign-in method**: enable **Google**. **Settings → Authorized domains**: production host + `localhost`.
4. **Firestore**: create a database. Deploy rules and indexes from this repo:

   ```bash
   npm install -g firebase-tools   # if needed
   firebase login
   firebase use --add               # select your project
   firebase deploy --only firestore,database
   ```

   Ensure **`firestore.indexes.json`** is deployed (included in `firestore`) so **collection-group** queries work for `listMyPendingInvites` and **`platform_invites`**.

   Deploy **Storage** rules so PDFs **over ~28 MB** can stage in the default bucket before **`finalizeEditionPdfUpload`** streams them to **R2**: `firebase deploy --only storage`, then set bucket **CORS** as in [`docs/STORAGE.md`](docs/STORAGE.md). (Smaller PDFs still use multipart **`uploadPublicationPdf`** only.)

5. **Realtime Database mirror** — Clients read catalog, org data, and admin lists from **RTDB**; **Firestore** is the write path and system of record. Deploy [`database.rules.json`](database.rules.json) with the command above. After deploying **Functions** (step 6), open **admin.html** as a platform admin and use **Rebuild mirror (backfillMirror)** once (or invoke the `backfillMirror` callable) so RTDB is populated. If `platform_admins` existed before mirror triggers were deployed, run backfill so `platformAdmins/{uid}` exists in RTDB.

6. **Cloud Functions** (region **`us-central1`** — must match `js/firebase-init.js`):

   ```bash
   cd functions && npm install && cp .env.example .env && cd ..
   # Edit functions/.env: R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL
   echo -n 'YOUR_R2_ACCESS_KEY_ID' | firebase functions:secrets:set R2_ACCESS_KEY_ID
   echo -n 'YOUR_R2_SECRET_ACCESS_KEY' | firebase functions:secrets:set R2_SECRET_ACCESS_KEY
   firebase deploy --only functions
   ```

   This deploys callables, **`uploadPublicationPdf`**, **`uploadPublicationCover`**, HTTPS **`uploadSeriesCover`** (multipart image → **sharp** → WebP at `…/series/{seriesId}/series-cover.webp`), **delete**/**invite** callables (see `functions/extra-exports.js`), and **Firestore→RTDB mirror** triggers plus **`backfillMirror`**.

   The **`uploadPublicationPdf`** function writes PDFs to  
   `publications/publishers/{publisherId}/series/{seriesId}/{timestamp}-{filename}.pdf`  
   in **R2**. **`uploadPublicationCover`** writes `…-cover.webp` beside that object key. Both check the caller’s Firebase ID token and **publisher membership** before writing to R2.

   **Suggested deploy order:** `functions` (installs `sharp` in `functions/`) → **`firestore:rules`** + **`firestore:indexes`** → **`database`** rules → **publish the static site** (repo root to Netlify or your CDN; not Firebase Hosting unless you add it).

   Configure **R2 public access** (custom domain or `*.r2.dev`) and **CORS** on the bucket so **PDF.js** can **GET** PDFs from your site origin (see [`docs/STORAGE.md`](docs/STORAGE.md)).

7. **Data model** — see [`docs/FIRESTORE_SCHEMA.md`](docs/FIRESTORE_SCHEMA.md) (Firestore + RTDB mirror map). **Firestore client reads** on mirrored paths are **denied** by [`firestore.rules`](firestore.rules); use RTDB for reads.

### Bootstrap the first platform admin

Cloud Functions treat you as a platform admin only if a Firestore document exists at **`platform_admins/{uid}`** where **`uid`** is your Firebase Auth user ID. Callables such as **`setPlatformAdmin`** check that document server-side, so the **first** admin must be created **once** outside the app (Console or a script). After that, signed-in admins can grant others from **`admin.html`**.

#### 1. Prerequisites

- **Authentication → Sign-in method**: **Google** enabled; **Settings → Authorized domains** includes the domain where you serve the static HTML (production) and `localhost` if you test locally.
- **Firestore** database created and **`firestore.rules`** from this repo deployed. Clients may **read their own** `platform_admins/{uid}` document (for **tier**); writes remain server-only.
- **Cloud Functions** deployed (so **`setPlatformAdmin`**, **`createPublisher`**, etc. exist).

#### 2. Get your Firebase Auth UID

1. Open [Firebase console](https://console.firebase.google.com/) → your project → **Build → Authentication**.
2. **Users** tab: if your Google account is not listed, sign in once through your hosted **`admin.html`** / **`studio.html`** (or add a user from the Console if you use another method).
3. Click the user row and copy **User UID** (a long string like `xYz9…`). That value is the document ID in the next step.

#### 3. Create the Firestore document (one-time)

1. **Build → Firestore Database** → **Data**.
2. **Start collection** (or add to existing **`platform_admins`** collection):
   - **Collection ID**: `platform_admins`
   - **Document ID**: paste the **User UID** exactly (do not auto-generate).
3. **Fields** (recommended):
   - `tier` → string → **`admin`** (full access) or omit (treated as admin).
   - `created_at` → timestamp → optional.
4. **Save**.

#### 4. Use the admin UI

1. Open **`admin.html`** on your site (or local server), **Sign in with Google** using the same account whose UID you used.
2. You should see the platform admin tools (not the “not listed in `platform_admins`” message).
3. After mirror triggers are live, use **Rebuild mirror (backfillMirror)** once so **Realtime Database** gets **`platformAdmins/{uid}`** for the admin UI’s RTDB reads (see step 5 in Firebase setup above).

#### 5. Add more platform staff (recommended)

- In **`admin.html` → Platform team**, use **Invite platform staff** (name + email). The invitee signs in with **Google on that email** and accepts from the **access denied** screen if they are not staff yet.
- Pending invites can be **revoked** from the same tab. The **`setPlatformAdmin`** callable still exists for emergency Console/scripts if a user already exists in Auth but has no invite flow.

**Publisher members:** use **owner/editor invites** from **studio** (**Team** tab) or **admin** (publisher **Team** → **New team member**), or **`createPublisher`** with **`owner_name` / `owner_email`**. The **`addPublisherMember`** callable remains available for tooling only (requires an existing Auth user by email).

### Legacy `publications` → `editions`

If you have the old flat `publications` collection, run the Admin migration (see [`docs/MIGRATION.md`](docs/MIGRATION.md)).

### Cloudflare R2 (PDF + cover storage)

See **[`docs/STORAGE.md`](docs/STORAGE.md)** for bucket creation, API token, public URL (`R2_PUBLIC_BASE_URL`), secrets, and CORS.

### Troubleshooting: `listMyPendingInvites` 500 / pending invites never appear

The callable runs a **collection group** query on `publishers/{id}/invites` filtered by `email_normalized` and `status`. Firestore **requires** the composite index defined in [`firestore.indexes.json`](firestore.indexes.json) (collection group **`invites`**: `email_normalized` + `status`). Deploy it and wait until it finishes building:

```bash
firebase deploy --only firestore:indexes
```

In the Firebase console, **Build → Firestore Database → Indexes**, wait until that index shows **Enabled** (not “Building”). Until then, invitees may see a generic error or “No organization access” with no Accept button.

### Troubleshooting: R2 upload failures

Check Cloud Function logs. Typical issues: wrong **`R2_ACCOUNT_ID`**, bucket name, or **public URL**; API token missing **Object Read & Write**; **`R2_PUBLIC_BASE_URL`** not matching how the bucket is exposed. Ensure both R2 secrets are set and the deploy picked up **`functions/.env`** params.

### CORS for PDFs

`pdf_url` must be reachable from the browser (public R2 URL). Add your **site origins** to the R2 bucket **CORS** policy so PDF.js can fetch the file.

## Production checklist (before go-live)

1. **`js/config.js`** — Firebase web config and **`databaseURL`** match the production project; **Authentication → Authorized domains** includes your live hostname (and `localhost` only if you still test there).
2. **SEO / links** — Canonical and Open Graph URLs in `index.html`, `studio.html`, the publication page (`/publication` in meta; file `publication.html`), and `admin.html` use your real site origin (currently `https://publications.rsamdio.org`). Update if the primary domain differs.
3. **`robots.txt`** — Uses path rules only; if you add a **sitemap**, reference it here.
4. **`_redirects`** — Netlify: confirm primary-domain redirect rules match production (see file comments).
5. **Cloud Functions + rules** — Deployed (`firebase deploy --only functions,firestore:rules,firestore:indexes,database` as needed). **Secrets**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; **`functions/.env`** params for R2 — never commit `.env`.
6. **RTDB mirror** — Run **Rebuild mirror** from **admin** once after first deploy so catalog/org paths exist.
7. **Netlify** — [`netlify.toml`](netlify.toml) sets `publish = "."` (repo root). No build step is required.

## Static site (not Firebase Hosting)

This repo is plain static HTML/JS. **Firebase Hosting is not configured** in [`firebase.json`](firebase.json). Serve the project root from any static host (S3 + CloudFront, Netlify, Vercel static, nginx, etc.) or locally with Live Server / `npx serve .` as in [Run locally](#run-locally). Firebase is used for **Auth, Firestore, RTDB, Functions** only.

## Project structure

```
index.html           # Public explore + reader
studio.html       # Publisher studio
admin.html           # Platform admin
js/
  config.js
  firebase-init.js   # Auth, Firestore, Realtime Database, Functions (us-central1)
  auth.js
  storage.js         # PDF/cover uploads via HTTPS Functions → R2 (multipart or Storage staging for large PDFs)
  db-public.js       # Published catalog reads (RTDB)
  db-publisher.js    # RTDB reads; Firestore writes for series/editions
  db-admin.js        # Admin reads (RTDB)
  db.js              # Re-exports db-public
  main.js            # index.html only
  shelf.js, viewer.js
  dashboard/main.js
  admin/main.js
_redirects          # Netlify redirects (see file)
netlify.toml        # Netlify publish dir + security headers
robots.txt
functions/
  index.js           # callables + upload + mirror triggers
  mirror.js          # Firestore → RTDB onDocumentWritten + backfillMirror
database.rules.json
firestore.rules
firestore.indexes.json
docs/
  FIRESTORE_SCHEMA.md
  MIGRATION.md
  STORAGE.md
AGENTS.md
```

## Tech stack

- HTML, vanilla JS (ES modules), Tailwind CDN
- Firebase Auth, Firestore, **2nd gen** Callable + HTTPS Functions (`firebase-functions` v7; v10 modular web SDK from `gstatic`)
- Cloudflare R2 (S3 API) for PDFs and covers (server-side only, via Functions)
- PDF.js 3.11.174, StPageFlip 2.0.7 (CDN)

No bundler is required for the static app; Cloud Functions use Node.js 22 (`functions/package.json` `engines`).
