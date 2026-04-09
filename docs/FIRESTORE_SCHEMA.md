# Firestore schema (PubHub multi-tenant)

## Entity diagram

```
platform_admins/{uid}                             tier: admin | manager (optional; default admin)
platform_invites/{inviteId}                       server-only; pending platform staff invites
publishers/{publisherId}
publishers/{publisherId}/invites/{inviteId}       pending | accepted | revoked; intended_role owner|editor
publishers/{publisherId}/roster/{memberUid}       denormalized active members (server-maintained)
users/{uid}/publisherMemberships/{publisherId}   role: owner | editor
series/{seriesId}                                 publisher_id, cover_url, …
editions/{editionId}                              publisher_id, series_id, issue_date, status: draft|published, …
publications/{id}                                 LEGACY — read-only after migration
```

## Collections

### `platform_admins/{uid}`

| Field | Type | Notes |
|-------|------|--------|
| `tier` | string | `admin` (full) or `manager` (publishers, catalog, featured — no backfill / staff invites). Omitted = admin. |
| `created_at` | timestamp | optional |

Created manually in Console, via `acceptPlatformInvite`, or break-glass `setPlatformAdmin` callable. **Clients** may **read their own** doc only (see `firestore.rules`) for tier-aware UI.

### `platform_invites/{inviteId}`

| Field | Type | Notes |
|-------|------|--------|
| `email_normalized` | string | |
| `invitee_name` | string | |
| `intended_tier` | string | `admin` \| `manager` |
| `status` | string | `pending` \| `accepted` \| `revoked` |
| `created_at` | timestamp | |
| `created_by_uid` | string | |

**Client read/write:** none (callables only).

### `publishers/{publisherId}`

| Field | Type | Notes |
|-------|------|--------|
| `name` | string | Display name (e.g. RI District 3191) |
| `slug` | string | URL-safe identifier |
| `status` | string | `active` \| `suspended` |
| `created_at` | timestamp | |

### `users/{uid}/publisherMemberships/{publisherId}`

| Field | Type | Notes |
|-------|------|--------|
| `role` | string | `owner` \| `editor` |
| `created_at` | timestamp | |

**Doc ID** = `publisherId` for O(1) rules checks.

### `publishers/{publisherId}/invites/{inviteId}`

| Field | Type | Notes |
|-------|------|--------|
| `email_normalized` | string | |
| `invitee_name` | string | |
| `intended_role` | string | `owner` (bootstrap via platform admin) or `editor` (owner invites) |
| `status` | string | `pending` \| `accepted` \| `revoked` |
| `created_at` | timestamp | |
| `created_by_uid` | string | |

**Client read:** publisher **owners** (and platform admins). **Write:** callables only.

### `publishers/{publisherId}/roster/{memberUid}`

| Field | Type | Notes |
|-------|------|--------|
| `email` | string | |
| `display_name` | string | |
| `role` | string | `owner` \| `editor` |
| `created_at` | timestamp | |
| `added_by_uid` | string | |

**Client read:** publisher members or platform admins. **Write:** callables only.

### `series/{seriesId}`

| Field | Type | Notes |
|-------|------|--------|
| `publisher_id` | string | |
| `title` | string | |
| `slug` | string | optional |
| `description` | string | optional |
| `frequency` | string | optional; publisher-defined cadence, e.g. `monthly`, `bimonthly`, `quarterly`, `half_yearly`, `one_time` |
| `cover_url` | string | optional; public URL after **`uploadSeriesCover`** (WebP in R2) |
| `cover_repo_path` | string | optional; e.g. `…/series/{seriesId}/series-cover.webp` |
| `created_at` | timestamp | |
| `created_by_uid` | string | |

### `editions/{editionId}`

| Field | Type | Notes |
|-------|------|--------|
| `publisher_id` | string | |
| `series_id` | string | |
| `title` | string | |
| `description` | string | optional |
| `pdf_url` | string | |
| `cover_url` | string | optional; auto from first PDF page (WebP/JPEG in R2) |
| `pdf_repo_path` | string | optional; object key of the PDF in R2 (same path shape as before; studio cover upload / regenerate) |
| `issue_date` | timestamp | optional; calendar issue date for reader + catalog |
| `status` | string | `draft` \| `published` |
| `publisher_name` | string | Denormalized for public catalog |
| `series_title` | string | Denormalized |
| `created_at` | timestamp | |
| `created_by_uid` | string | |

Public library queries: `status == 'published'`.

### Legacy `publications/{id}`

Pre-migration documents. **Client read and write are denied** in `firestore.rules` (use Admin SDK or Console for inspection / migration). Migrate with `scripts/migrate-publications.mjs`.

## Security summary (Firestore)

- **System of record:** all **writes** go to Firestore (clients + callables). After mirror deploy, **client reads** on mirrored paths are **denied** on Firestore; clients read the **Realtime Database mirror** instead.
- **Explore (anonymous):** RTDB `public/catalog/editions` (published card fields only).
- **Editors:** RTDB `org/{publisherId}/…` + `userMemberships/{uid}`; Firestore writes for `series` / `editions` unchanged.
- **Platform staff:** RTDB `platformAdmins/{uid}` (boolean mirror); Firestore `platform_admins/{uid}` for **tier**; callables enforce **full admin** vs **manager** where applicable.
- **One publisher per user:** enforced on `acceptPublisherInvite` and `addPublisherMember`.

---

## Realtime Database mirror (read-optimized)

Maintained by **Cloud Functions** (`onDocumentWritten` on Firestore). **Server-only writes** to RTDB. See [`database.rules.json`](../database.rules.json).

| Path | Purpose |
|------|---------|
| `public/catalog/editions/{editionId}` | Published editions for anonymous catalog; `created_at` / `issue_date` epoch **ms** |
| `public/catalog/series/{seriesId}` | Series card for Explore: `cover_url`, `title`, `description`, `slug`, `frequency`, `publisher_id`, `publisher_name`, … |
| `org/{publisherId}/editions/{editionId}` | Full edition row for members (includes `status`) |
| `org/{publisherId}/series/{seriesId}` | Series row (includes `cover_url`, `cover_repo_path` when set) |
| `org/{publisherId}/invites/{inviteId}` | Pending publisher invites (mirror; non-pending removed) |
| `org/{publisherId}/roster/{memberUid}` | Active members for Team tab |
| `org/{publisherId}/profile` | Publisher `name`, `slug`, `status`, `created_at` (ms) |
| `userMemberships/{uid}/{publisherId}` | `role`, `created_at` (ms) |
| `platformAdmins/{uid}` | `true` if platform staff (RTDB; tier lives in Firestore doc) |
| `platform/publishers/{publisherId}` | Full publisher doc for admin UI |
| `platform/stats/editionCount` | Total edition documents (approx; maintained by triggers + backfill) |

**Backfill:** callable `backfillMirror` (platform admin) rebuilds RTDB from Firestore + legacy `publications` into `public/catalog/editions` with ids `legacy_{docId}`.

### Legacy `publications/{id}`

Still in Firestore for migration reference; **not** mirrored by triggers. Included only in **`backfillMirror`** for `public/catalog/editions` until you remove them.
