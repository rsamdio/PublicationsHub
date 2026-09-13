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

function getOrInitApp(): FirebaseApp {
  if (_app) return _app;
  const c = firebaseConfig;
  if (!c?.apiKey || !c?.projectId) {
    throw new Error('Set NEXT_PUBLIC_FIREBASE_* (apiKey, projectId, …)');
  }
  _app = getApps().length ? getApps()[0]! : initializeApp(c);
  return _app;
}

export function fbAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getOrInitApp());
  }
  return _auth;
}

export function fbDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getOrInitApp());
  }
  return _db;
}

export function fbRtdb(): Database {
  if (!_rtdb) {
    const c = firebaseConfig;
    if (!c?.databaseURL) {
      throw new Error('Set NEXT_PUBLIC_FIREBASE_DATABASE_URL');
    }
    _rtdb = getDatabase(getOrInitApp());
  }
  return _rtdb;
}

export function fbFunctions(): Functions {
  if (!_functions) {
    _functions = getFunctions(getOrInitApp(), 'us-central1');
  }
  return _functions;
}
