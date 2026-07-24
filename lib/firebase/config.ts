export const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    'AIzaSyDe9JwT6oeb4bszhmhmfUpzFGJ9vGxXkJk',
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'rsapublicationhub.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'rsapublicationhub',
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'rsapublicationhub.firebasestorage.app',
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '633418622169',
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    '1:633418622169:web:6b67485b9824bf56d7cac8',
  databaseURL:
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
    'https://rsapublicationhub-default-rtdb.asia-southeast1.firebasedatabase.app'
};

/** Optional emulator overrides (same as legacy config.js). */
export const uploadOverrides = {
  uploadPublicationPdfUrl: process.env.NEXT_PUBLIC_UPLOAD_PDF_URL || null,
  uploadPublicationCoverUrl: process.env.NEXT_PUBLIC_UPLOAD_COVER_URL || null,
  uploadSeriesCoverUrl: process.env.NEXT_PUBLIC_UPLOAD_SERIES_COVER_URL || null
};

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://publications.rsamdio.org';

/** Legacy-shaped config object for ported storage.js */
export const config = {
  firebase: firebaseConfig,
  ...uploadOverrides
};
