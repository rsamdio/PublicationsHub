# Migrating legacy `publications` → `editions`

1. Deploy updated [`firestore.rules`](../firestore.rules) and [`firestore.indexes.json`](../firestore.indexes.json) (`firebase deploy --only firestore`).
2. Install Admin tooling: from repo root, `npm install`.
3. Download a Firebase **service account** JSON (Project settings → Service accounts).
4. Run:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
npm run migrate
```

This creates:

- `publishers/legacy` (active)
- `series/legacy-general`
- One `editions/{newId}` per old `publications/{id}` with `status: published`

After verifying the public library reads editions, you can delete old `publications` documents in the Console (optional).

**Membership:** Add yourself as an editor/owner so the dashboard can upload new editions:

- Console → `users/{yourAuthUid}/publisherMemberships/legacy` with `{ "role": "owner", "created_at": <timestamp> }`

Or use the **`addPublisherMember`** callable (deploy [`functions/`](../functions)) from [`admin.html`](../admin.html) once you are a platform admin.
