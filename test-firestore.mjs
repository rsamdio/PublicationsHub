import admin from 'firebase-admin';

try {
  admin.initializeApp();
  const db = admin.firestore();
  
  db.collection('editions').limit(1).get().then(snap => {
    console.log('Success, doc count:', snap.size);
    process.exit(0);
  }).catch(e => {
    console.error('Firestore error:', e.message);
    process.exit(1);
  });
} catch (e) {
  console.error('Init error:', e.message);
  process.exit(1);
}
