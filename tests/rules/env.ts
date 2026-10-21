// Test helpers for the Firestore emulator: one app per account (mock auth
// tokens), the rules loaded from firestore.rules, a clean database per test.

import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

export const PROJECT = 'demo-logosnovus';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
export const ADMIN = { uid: 'admin-uid', email: 'gerksterr@gmail.com' };

let env: RulesTestEnvironment | null = null;
const apps: FirebaseApp[] = [];
let n = 0;

export async function setup() {
  env ??= await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: HOST, port: +PORT } });
  await env.clearFirestore();
}

export async function teardown() {
  await Promise.all(apps.splice(0).map((a) => deleteApp(a)));
}

/** A Firestore client signed in as `uid` (or anonymous). */
export function client(user?: { uid: string; email?: string; verified?: boolean }): Firestore {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'test' }, `app${n++}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, +PORT, user ? { mockUserToken: { sub: user.uid, user_id: user.uid, email: user.email ?? `${user.uid}@example.com`, email_verified: user.verified ?? true } } : undefined);
  return db;
}
