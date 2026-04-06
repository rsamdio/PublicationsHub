/**
 * Lazy Firebase app init (Auth + Firestore). Throws when config is missing on first use.
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { config } from './config.js';

let _app = null;
let _auth = null;
let _db = null;
let _rtdb = null;
let _functions = null;

function ensureFirebase() {
  if (_auth) return;
  const c = config.firebase;
  if (!c?.apiKey || !c?.projectId) {
    throw new Error('Set config.firebase (apiKey, projectId, authDomain, …) in config.js');
  }
  if (!c?.databaseURL) {
    throw new Error('Set config.firebase.databaseURL (Realtime Database) in config.js');
  }
  _app = getApps().length ? getApps()[0] : initializeApp(c);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  _rtdb = getDatabase(_app);
}

export function fbAuth() {
  ensureFirebase();
  return _auth;
}

export function fbDb() {
  ensureFirebase();
  return _db;
}

export function fbRtdb() {
  ensureFirebase();
  return _rtdb;
}

/** Same region as Cloud Functions deployment. */
export function fbFunctions() {
  ensureFirebase();
  if (!_functions) {
    _functions = getFunctions(_app, 'us-central1');
  }
  return _functions;
}
