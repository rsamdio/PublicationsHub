/**
 * One-time migration: flat `publications` → `editions` + default `publishers` + `series`.
 *
 * Prerequisites:
 *   npm install
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   (or run in Cloud Shell with Application Default Credentials)
 *
 *   npm run migrate
 */
import admin from 'firebase-admin';

const LEGACY_PUBLISHER_ID = 'legacy';
const LEGACY_SERIES_ID = 'legacy-general';

admin.initializeApp();
const db = admin.firestore();

async function ensureLegacyPublisherAndSeries() {
  const pubRef = db.collection('publishers').doc(LEGACY_PUBLISHER_ID);
  const pubSnap = await pubRef.get();
  if (!pubSnap.exists) {
    await pubRef.set({
      name: 'Legacy publications',
      slug: 'legacy',
      status: 'active',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Created publishers/', LEGACY_PUBLISHER_ID);
  }
  const serRef = db.collection('series').doc(LEGACY_SERIES_ID);
  const serSnap = await serRef.get();
  if (!serSnap.exists) {
    await serRef.set({
      publisher_id: LEGACY_PUBLISHER_ID,
      title: 'General',
      slug: 'general',
      description: 'Migrated from flat publications collection',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by_uid: 'migration'
    });
    console.log('Created series/', LEGACY_SERIES_ID);
  }
}

async function migrate() {
  await ensureLegacyPublisherAndSeries();
  const snap = await db.collection('publications').get();
  if (snap.empty) {
    console.log('No documents in publications — nothing to migrate.');
    return;
  }
  let n = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const editionRef = db.collection('editions').doc();
    await editionRef.set({
      publisher_id: LEGACY_PUBLISHER_ID,
      series_id: LEGACY_SERIES_ID,
      title: d.title || 'Untitled',
      description: d.description ?? null,
      pdf_url: d.pdf_url,
      cover_url: d.cover_url ?? null,
      status: 'published',
      publisher_name: 'Legacy publications',
      series_title: 'General',
      created_at: d.created_at || admin.firestore.FieldValue.serverTimestamp(),
      created_by_uid: 'migration',
      migrated_from_publication_id: doc.id
    });
    n += 1;
  }
  console.log(`Migrated ${n} publication(s) into editions/.`);
}

migrate().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
