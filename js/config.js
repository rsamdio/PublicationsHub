/**
 * PublicationHub configuration — Firebase (auth + metadata).
 *
 * PDFs and WebP covers upload through **uploadPublicationPdf** / **uploadPublicationCover** (us-central1).
 * GitHub credentials live in **Firebase Secrets / function params**, not here.
 *
 * We do **not** use the Firebase Storage SDK or bucket for edition PDFs (no getStorage / uploadBytes).
 * `storageBucket` is only part of the standard Firebase web app object; PDFs live in GitHub + URLs in Firestore.
 */
export const config = {
  firebase: {
    apiKey: 'AIzaSyDe9JwT6oeb4bszhmhmfUpzFGJ9vGxXkJk',
    authDomain: 'rsapublicationhub.firebaseapp.com',
    projectId: 'rsapublicationhub',
    storageBucket: 'rsapublicationhub.firebasestorage.app',
    messagingSenderId: '633418622169',
    appId: '1:633418622169:web:6b67485b9824bf56d7cac8',
    // Realtime Database URL — must match region shown in Firebase console (this project uses asia-southeast1).
    databaseURL: 'https://rsapublicationhub-default-rtdb.asia-southeast1.firebasedatabase.app'
  },
  /**
   * Optional. Set when using the Functions emulator, e.g.
   * `http://127.0.0.1:5001/rsapublicationhub/us-central1/uploadPublicationPdf`
   */
  uploadPublicationPdfUrl: null,
  /** Optional emulator URL for `uploadPublicationCover`. */
  uploadPublicationCoverUrl: null,
  /** Optional emulator URL for `uploadSeriesCover`. */
  uploadSeriesCoverUrl: null
};
