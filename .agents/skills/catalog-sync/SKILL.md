---
name: catalog-sync
description: Operating guidelines for working with the Realtime Database read mirror, catalog grouping logic, and infinite scroll shelf.
---

# Catalog Sync Skill

Use this skill when modifying the public shelf catalog, series aggregation, edition sorting, or RTDB queries.

## Core Files
- `components/ShelfCatalog.tsx`: Main catalog grid with 12 items/batch infinite scroll and in-memory search.
- `lib/catalog/catalog-series.js`: Groups flat edition records by `series_id`.
- `lib/catalog/edition-sort.js`: Sorts editions within series by `issue_date` descending.
- `lib/firebase/db-public.js`: Public unauthenticated RTDB catalog client.

## Critical Invariants
1. **Unauthenticated RTDB Reads**: Public catalog reads query `public/catalog/editions` and `public/catalog/series` in RTDB. Do not query Firestore directly from public components.
2. **Infinite Scroll Batching**: Shelf loads an initial batch of 12 series cards. The `IntersectionObserver` sentinel auto-loads subsequent batches as the user scrolls.
3. **In-Memory Search**: Search filters the full pre-fetched catalog snapshot in client memory and resets the visible slice to the first batch.
4. **Backend Trigger Sync**: RTDB data is maintained automatically by Cloud Function triggers in `functions/mirror.js`. Do not write to RTDB from the client.
