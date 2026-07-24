'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';
import { getFunctions, type Functions } from 'firebase/functions';
import { firebaseConfig } from './config';

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _rtdb: Database | null = null;
let _functions: Functions | null = null;

function ensureFirebase() {
  if (_auth) return;
  const c = firebaseConfig;
  if (!c?.apiKey || !c?.projectId) {
    throw new Error('Set NEXT_PUBLIC_FIREBASE_* (apiKey, projectId, …)');
  }
  if (!c?.databaseURL) {
    throw new Error('Set NEXT_PUBLIC_FIREBASE_DATABASE_URL');
  }
  _app = getApps().length ? getApps()[0]! : initializeApp(c);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  _rtdb = getDatabase(_app);
}

export function fbAuth(): Auth {
  ensureFirebase();
  return _auth!;
}

export function fbDb(): Firestore {
  ensureFirebase();
  return _db!;
}

export function fbRtdb(): Database {
  ensureFirebase();
  return _rtdb!;
}

export function fbFunctions(): Functions {
  ensureFirebase();
  if (!_functions) {
    _functions = getFunctions(_app!, 'us-central1');
  }
  return _functions;
}
