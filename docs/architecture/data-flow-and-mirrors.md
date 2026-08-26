# Architecture: Data Flow & RTDB Mirrors

This document explains the synchronization pipeline between Cloud Firestore (system of record) and Firebase Realtime Database (read-optimized mirror).

## 1. Core Architecture Principles

1. **Firestore as System of Record**: All writes from clients or admin callables go to Firestore. Firestore holds authoritative security rules, timestamps, and relations.
2. **RTDB as Read Mirror**: Public catalog reads and publisher dashboards query RTDB paths. RTDB reads are fast, cost-effective, and provide low-latency subscriptions.
3. **Automated Triggers**: Cloud Functions in `functions/mirror.js` listen to Firestore changes (`onDocumentWritten`) and mirror them to RTDB.
4. **Security Rules Segregation**:
   - `firestore.rules`: Blocks client reads on mirrored collections (e.g. `editions`, `series`, `publishers`). Allows authenticated writes from publishers/owners.
   - `database.rules.json`: Allows public unauthenticated reads on `public/catalog/*`. Allows authenticated publisher members to read `org/{publisherId}/*`. Disallows all client writes.

## 2. Data Flow Diagram

```
[Publisher / Admin Client]
         │
         │ (1) Write / Mutation
         ▼
[Cloud Firestore] ────(2) onDocumentWritten trigger────► [Cloud Functions (mirror.js)]
                                                                  │
                                                                  │ (3) Write Mirror
                                                                  ▼
[Public Readers / Dashboard] ◄───(4) Read Snapshot / Stream────── [Realtime Database (RTDB)]
```

## 3. RTDB Mirror Paths

| RTDB Path | Source Firestore Collection | Purpose | Read Access |
|---|---|---|---|
| `public/catalog/editions/{editionId}` | `editions/{editionId}` (status == 'published') | Anonymous catalog shelf and search | Public (no auth) |
| `public/catalog/series/{seriesId}` | `series/{seriesId}` | Series cover, title, description, and cadence | Public (no auth) |
| `org/{publisherId}/profile` | `publishers/{publisherId}` | Publisher name, slug, and status | Publisher members |
| `org/{publisherId}/series/{seriesId}` | `series/{seriesId}` | Full series record for publisher studio | Publisher members |
| `org/{publisherId}/editions/{editionId}` | `editions/{editionId}` | Full edition record (draft & published) | Publisher members |
| `org/{publisherId}/roster/{memberUid}` | `publishers/{publisherId}/roster/{uid}` | Publisher team member roster | Publisher members |
| `org/{publisherId}/invites/{inviteId}` | `publishers/{publisherId}/invites/{id}` | Pending publisher invitations | Publisher members |
| `userMemberships/{uid}/{publisherId}` | `users/{uid}/publisherMemberships/{pubId}` | User's active publisher memberships | Owner user only |
| `platformAdmins/{uid}` | `platform_admins/{uid}` | Boolean flag for platform admin status | Staff user only |
| `platform/publishers/{publisherId}` | `publishers/{publisherId}` | Full publisher record for platform staff | Platform staff only |

## 4. Backfill Operations

Platform administrators have access to callables for mirror repair:
- `backfillMirror`: Iterates through all Firestore documents and rebuilds RTDB mirror paths from scratch.
- `backfillCoverThumbs`: Generates smaller WebP thumbnails (~512px long edge) for editions and series in Cloudflare R2 and updates `cover_thumb_url`.
