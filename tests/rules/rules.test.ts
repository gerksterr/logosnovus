// The shared library's security rules: who may write what, and that every
// change leaves a faithful, numbered history entry.

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeEach, describe, it } from 'vitest';
import { ADMIN, client, setup, teardown } from './env';

beforeEach(setup);
afterAll(teardown);

const alice = { uid: 'alice', email: 'alice@example.com' };
const bob = { uid: 'bob', email: 'bob@example.com' };

interface W {
  rev: number;
  by?: string;
  u?: number;
  j?: string | null;
  del?: boolean;
  history?: false | Record<string, unknown>; // false: no history entry; object: overrides
  key?: string;
}
/** One record write as the app does it: the record and its history entry in one batch. */
function write(db: Firestore, uid: string, st: string, id: string, w: W) {
  const key = w.key ?? `${st}~${id}`;
  const u = w.u ?? Date.now();
  const content = w.del ? { del: true } : { j: w.j ?? JSON.stringify({ id, updatedAt: u, title: 'x' }) };
  const b = writeBatch(db);
  b.set(doc(db, 'commons', key), { st, id, u, s: serverTimestamp(), rev: w.rev, by: w.by ?? uid, ...content });
  if (w.history !== false) b.set(doc(db, 'history', `${key}@${w.rev}`), { key, st, id, rev: w.rev, by: w.by ?? uid, at: serverTimestamp(), u, name: 'A', ...content, ...(w.history ?? {}) });
  return b.commit();
}

describe('reading', () => {
  it('anyone may read the library and its history, nobody else’s private data', async () => {
    await assertSucceeds(write(client(alice), 'alice', 'texts', 't1', { rev: 1 }));
    const anon = client();
    await assertSucceeds(getDoc(doc(anon, 'commons', 'texts~t1')));
    await assertSucceeds(getDocs(collection(anon, 'history')));
    await assertSucceeds(setDoc(doc(client(alice), 'users/alice/records/readings~t1'), { j: '{}' }));
    await assertFails(getDoc(doc(client(bob), 'users/alice/records/readings~t1')));
    await assertFails(getDoc(doc(anon, 'users/alice/records/readings~t1')));
  });
});

describe('writing the library', () => {
  it('needs an account', async () => {
    await assertFails(write(client(), 'nobody', 'texts', 't1', { rev: 1 }));
  });

  it('a signed-in account writes rev 1, then rev 2', async () => {
    await assertSucceeds(write(client(alice), 'alice', 'texts', 't1', { rev: 1 }));
    await assertSucceeds(write(client(bob), 'bob', 'texts', 't1', { rev: 2 }));
  });

  it('every write needs its own faithful history entry', async () => {
    const db = client(alice);
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1, history: false }));
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1, history: { j: '{"id":"t1","title":"something else"}' } }));
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1, history: { by: 'bob' } }));
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1, history: { u: 1 } }));
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1, history: { rev: 2 } }));
    await assertSucceeds(write(db, 'alice', 'texts', 't1', { rev: 1 }));
  });

  it('revisions go up one at a time; history is never rewritten', async () => {
    const db = client(alice);
    await assertSucceeds(write(db, 'alice', 'texts', 't1', { rev: 1 }));
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1 })); // would overwrite rev 1's history
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 3 }));
    await assertFails(setDoc(doc(db, 'history', 'texts~t1@1'), { key: 'texts~t1', st: 'texts', id: 't1', rev: 1, by: 'alice', at: serverTimestamp(), u: 1, j: 'forged' }));
    await assertFails(deleteDoc(doc(db, 'history', 'texts~t1@1')));
    await assertFails(deleteDoc(doc(db, 'commons', 'texts~t1')));
  });

  it('no writing in someone else’s name, no far-future clocks, no foreign stores or fields', async () => {
    const db = client(alice);
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1, by: 'bob' }));
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1, u: Date.now() + 86400000 }));
    await assertFails(write(db, 'alice', 'secrets', 'openrouter', { rev: 1 }));
    await assertFails(write(db, 'alice', 'readings', 't1', { rev: 1 }));
    await assertFails(write(db, 'alice', 'texts', 't1', { rev: 1, key: 'texts~t2' }));
  });

  it('deletions are tombstones with history', async () => {
    const db = client(alice);
    await assertSucceeds(write(db, 'alice', 'translations', 'x', { rev: 1 }));
    await assertSucceeds(write(client(bob), 'bob', 'translations', 'x', { rev: 2, del: true }));
  });

  it('several records in one batch', async () => {
    const db = client(alice);
    const b = writeBatch(db);
    for (let i = 0; i < 10; i++) {
      const key = `translations~r${i}`;
      const j = JSON.stringify({ id: `r${i}`, updatedAt: 5 });
      b.set(doc(db, 'commons', key), { st: 'translations', id: `r${i}`, u: 5, s: serverTimestamp(), rev: 1, by: 'alice', j });
      b.set(doc(db, 'history', `${key}@1`), { key, st: 'translations', id: `r${i}`, rev: 1, by: 'alice', at: serverTimestamp(), u: 5, j });
    }
    await assertSucceeds(b.commit());
  });
});

describe('the admin', () => {
  it('can ban; a banned account cannot write; others cannot ban', async () => {
    await assertFails(setDoc(doc(client(bob), 'banned', 'alice'), { at: 1 }));
    await assertFails(setDoc(doc(client({ uid: 'x', email: ADMIN.email, verified: false }), 'banned', 'alice'), { at: 1 }));
    await assertSucceeds(setDoc(doc(client(ADMIN), 'banned', 'alice'), { at: 1 }));
    await assertFails(write(client(alice), 'alice', 'texts', 't1', { rev: 1 }));
    await assertSucceeds(write(client(bob), 'bob', 'texts', 't1', { rev: 1 }));
  });

  it('reverts by writing the earlier content as a new revision', async () => {
    await assertSucceeds(write(client(alice), 'alice', 'texts', 't1', { rev: 1, j: '{"id":"t1","updatedAt":1,"title":"good"}', u: 1 }));
    await assertSucceeds(write(client(bob), 'bob', 'texts', 't1', { rev: 2, j: '{"id":"t1","updatedAt":2,"title":"vandalized"}', u: 2 }));
    await assertSucceeds(write(client(ADMIN), ADMIN.uid, 'texts', 't1', { rev: 3, j: '{"id":"t1","updatedAt":1,"title":"good"}', history: { revert: 'texts~t1@2' } }));
  });

  it('reads the account list; accounts read only themselves', async () => {
    await assertSucceeds(setDoc(doc(client(alice), 'accounts', 'alice'), { name: 'Alice', email: alice.email, first: 1, last: 1 }));
    await assertFails(setDoc(doc(client(alice), 'accounts', 'alice'), { name: 'Alice', email: 'admin@x.com', first: 1, last: 1 }));
    await assertFails(setDoc(doc(client(alice), 'accounts', 'bob'), { name: 'Bob', email: bob.email }));
    await assertFails(getDocs(collection(client(bob), 'accounts')));
    await assertSucceeds(getDocs(collection(client(ADMIN), 'accounts')));
    await assertSucceeds(getDoc(doc(client(alice), 'accounts', 'alice')));
  });

  it('may delete history entries; nobody else may', async () => {
    await assertSucceeds(write(client(alice), 'alice', 'texts', 't1', { rev: 1 }));
    await assertFails(deleteDoc(doc(client(bob), 'history', 'texts~t1@1')));
    await assertSucceeds(deleteDoc(doc(client(ADMIN), 'history', 'texts~t1@1')));
  });
});
