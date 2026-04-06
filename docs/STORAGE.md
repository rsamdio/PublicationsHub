# Storage: PDF uploads

**Firebase Storage (the product)** is **not** used for edition PDFs in this app. There is no `firebase/storage` client import; `storageBucket` in `config.js` is only part of the default Firebase web config object. PDF binaries go to **GitHub** via **`uploadPublicationPdf`**. This repo does not ship Storage rules or a `firebase.json` **storage** block because uploads do not use the default bucket.

## Current production path

**Publisher studio** sends each PDF as **multipart form data** to the Cloud Function **`uploadPublicationPdf`** (`us-central1`). The function:

1. Verifies the Firebase **ID token** and **`users/{uid}/publisherMemberships/{publisherId}`**.
2. Confirms the **publisher** is `active` and the **series** belongs to that publisher.
3. Uses **`GITHUB_TOKEN`** from **Secret Manager** plus **`GITHUB_OWNER`**, **`GITHUB_REPO`**, **`GITHUB_BRANCH`** (function params / `functions/.env`) to call the GitHub Contents API.
4. Writes files under the repo path:

   `publications/publishers/{publisherId}/series/{seriesId}/{timestamp}-{safe-filename}.pdf`

The browser never sees the PAT. Configure the client only with `config.firebase` and optional `config.uploadPublicationPdfUrl` for the Functions emulator.

## Limits

- **~30 MB** per PDF (function + busboy limit). Raise `MAX_PDF_BYTES` in `functions/index.js` if your platform allows larger HTTP bodies.

## Future: Firebase Storage

To remove GitHub from the hot path entirely:

1. Upload to **Firebase Storage** with rules keyed off publisher membership (or signed URLs from a callable).
2. Store `pdf_url` as a **download URL** or serve via **Firebase Hosting rewrites** / CDN.

If you enable Storage later, add rules in the Firebase Console or introduce `storage.rules` and a `storage` entry in `firebase.json`, then deploy with `firebase deploy --only storage`.
