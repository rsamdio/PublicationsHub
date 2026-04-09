# Storage: PDF and cover uploads

**Final PDFs and WebP covers** are stored in **Cloudflare R2** (S3-compatible). The browser never receives R2 credentials: uploads go through **HTTPS** (`uploadPublicationPdf`, `uploadPublicationCover`, `uploadSeriesCover`) and **callables** (`prepareEditionPdfUpload` → Firebase Storage staging → `finalizeEditionPdfUpload` → R2). **`storageBucket`** in `js/config.js` is still required for the **large-file staging** path only.

## R2 setup

1. In **Cloudflare → R2**, create a bucket.
2. Create an **API token** with **Object Read & Write** for that bucket (or account-scoped with bucket access).
3. Expose public reads for the reader / PDF.js:
   - **R2.dev subdomain** (quick test), or  
   - **Custom domain** (production) under the bucket’s **Public access** settings.
4. Set **`R2_PUBLIC_BASE_URL`** to that public origin **without** a trailing slash, e.g. `https://pub-xxxxx.r2.dev` or `https://cdn.yourdomain.com`.
5. Deploy params (from `functions/.env` or Firebase params UI): **`R2_ACCOUNT_ID`**, **`R2_BUCKET_NAME`**, **`R2_PUBLIC_BASE_URL`**.
6. Deploy secrets:
   ```bash
   echo -n 'YOUR_R2_ACCESS_KEY_ID' | firebase functions:secrets:set R2_ACCESS_KEY_ID
   echo -n 'YOUR_R2_SECRET_ACCESS_KEY' | firebase functions:secrets:set R2_SECRET_ACCESS_KEY
   ```
7. **CORS** on the public R2 endpoint (Cloudflare dashboard → bucket → **CORS Policy** JSON): allow **GET** and **HEAD** from every origin where the reader runs; set **`AllowedHeaders`** to include **`Range`** (and optionally **`If-Range`**, **`If-None-Match`**) so **PDF.js** range/stream loads work. Use **`ExposeHeaders`** for **`Content-Length`**, **`Content-Range`**, **`ETag`**, etc., as needed. Do **not** list **`OPTIONS`** in **`AllowedMethods`** if the dashboard rejects it—R2 still answers preflights. After changes on a **custom domain**, [purge cache](https://developers.cloudflare.com/r2/buckets/cors/#use-cors-with-a-custom-domain) if CORS headers look stale. See [Configure CORS (R2)](https://developers.cloudflare.com/r2/buckets/cors/).

## Object keys (same as before)

Paths are unchanged for compatibility with Firestore `pdf_repo_path`:

- Editions: `publications/publishers/{publisherId}/series/{seriesId}/{timestamp}-{filename}.pdf`
- Edition cover: `…/{base}-cover.webp` next to the PDF key
- Series cover: `publications/publishers/{publisherId}/series/{seriesId}/series-cover.webp`

`pdf_url` on editions is the **public HTTPS URL** built from `R2_PUBLIC_BASE_URL` + key.

## Multipart path (smaller PDFs, ≤ ~28 MB)

**Publisher studio** POSTs multipart form data to **`uploadPublicationPdf`**. The function verifies auth and membership, then **`PutObject`**s to R2.

## Large PDFs (up to 75 MB)

Same as before: **`prepareEditionPdfUpload`** returns a signed **Firebase Storage** PUT URL; the client uploads the file; **`finalizeEditionPdfUpload`** streams the object from Storage to R2 and deletes the temp file. Deploy **`storage.rules`** and bucket **CORS** for PUT (see below).

## Limits

- **Up to 75 MB** per PDF (`MAX_PDF_BYTES` in `functions/index.js`).
- **Direct multipart POST** stays under the Gen2 HTTP body limit (~32 MiB); larger files use Storage + finalize.

### One-time Firebase Storage setup (large PDFs)

1. Enable **Firebase Storage** (Blaze) and deploy rules: `firebase deploy --only storage`.
2. **IAM for signed PUT URLs** — see previous sections in repo history or `README.md`: Cloud Functions runtime SA needs **Service Account Token Creator** on itself for `getSignedUrl`.
3. **CORS** on the default bucket for browser PUT — use [`scripts/storage-cors.json`](../scripts/storage-cors.json) and `gsutil cors set …`.

## Migrating from GitHub

Existing editions with **`pdf_url`** pointing at `raw.githubusercontent.com` keep working until you re-upload or run a separate migration. New uploads use R2. Remove old **`GITHUB_*`** secrets from the Firebase project when no longer needed.
