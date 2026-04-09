/**
 * PublicationHub configuration — Firebase (auth + metadata).
 *
 * PDFs: multipart **uploadPublicationPdf** or, for large files, Storage-signed URL via **prepareEditionPdfUpload** / **finalizeEditionPdfUpload** (then R2). Covers: **uploadPublicationCover**. R2 credentials live in **Secrets / params**, not here.
 *
 * No `firebase/storage` **SDK** in the browser (no getStorage / uploadBytes). `storageBucket` is standard web config; large PDFs use signed HTTPS PUT from callables.
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
