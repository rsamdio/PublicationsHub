/**
 * Firebase Authentication — Google sign-in, session, sign out.
 */
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { fbAuth } from './firebase-init.js';

function wrapError(e) {
  if (e && typeof e === 'object' && 'message' in e) {
    return { message: e.message, code: e.code };
  }
  return { message: String(e) };
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function getSession() {
  try {
    const auth = fbAuth();
    await auth.authStateReady();
    const user = auth.currentUser;
    return { data: { session: user }, error: null };
  } catch (e) {
    return { data: { session: null }, error: wrapError(e) };
  }
}

export async function signInWithGoogle() {
  try {
    const cred = await signInWithPopup(fbAuth(), googleProvider);
    return { data: { session: cred.user, user: cred.user }, error: null };
  } catch (e) {
    return { data: null, error: wrapError(e) };
  }
}

export async function signOut() {
  await firebaseSignOut(fbAuth());
}

export function onAuthStateChange(callback) {
  try {
    const auth = fbAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', user);
    });
    return { unsubscribe: () => unsub() };
  } catch (e) {
    console.warn('[auth]', e);
    return { unsubscribe: () => {} };
  }
}
