// The sync engine (src/sync/cloud.ts) against the Firestore emulator with the
// real security rules: reading the shared library without an account,
// uploading with revisions and history, conflicts with other writers,
// private texts, API keys, blocked accounts, big private records, and the
// previous app's cloud layout.

import 'fake-indexeddb/auto';
import * as fs from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ADMIN, client, setup, teardown } from './env';

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
(globalThis as any).addEventListener ??= () => {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const { initStore, put, remove, useStore } = await import('../../src/data/store');
const { startSync, setUser, syncNow, useBackend, useSync, importLegacyCloud } = await import('../../src/sync/cloud');

const alice = { uid: 'alice', name: 'Alice', email: 'alice@example.com' };
let other: fs.Firestore; // another person's device

/** Another account writes a record the way the app does. */
async function writeAs(db: fs.Firestore, uid: string, store: string, rec: Record<string, any>, rev: number) {
  const key = `${store}~${rec.id}`;
  const content = rec.deleted ? { del: true } : { j: JSON.stringify(rec) };
  const b = fs.writeBatch(db);
  b.set(fs.doc(db, 'commons', key), { st: store, id: rec.id, u: rec.updatedAt, s: fs.serverTimestamp(), rev, by: uid, ...content });
  b.set(fs.doc(db, 'history', `${key}@${rev}`), { key, st: store, id: rec.id, rev, by: uid, at: fs.serverTimestamp(), u: rec.updatedAt, ...content });
  await b.commit();
}
const commonsDoc = async (key: string) => (await fs.getDoc(fs.doc(other, 'commons', key))).data();
const historyDocs = async (key: string) => (await fs.getDocs(fs.query(fs.collection(other, 'history'), fs.where('key', '==', key)))).docs.map((d) => d.data());

beforeAll(async () => {
  await setup();
  other = client({ uid: 'bob', email: 'bob@example.com' });
  await writeAs(other, 'bob', 'texts', { id: 'shared1', title: 'From Bob', lang: '', content: 'Bobs Text', createdAt: 1, updatedAt: Date.now() }, 1);
  useBackend({ fs, db: client({ uid: alice.uid, email: alice.email }) });
  await initStore();
  put('texts', { id: 'mine', title: 'Written before signing in', lang: '', content: 'x', createdAt: 1, updatedAt: 0 });
  startSync();
});
afterAll(teardown);

describe('without an account', () => {
  it('reads the shared library', async () => {
    await vi.waitFor(() => expect(useStore.getState().texts.shared1?.title).toBe('From Bob'), { timeout: 8000 });
    expect(useSync.getState().commons).toBe('live');
  });

  it('keeps own changes on the device until signing in', async () => {
    syncNow();
    await new Promise((r) => setTimeout(r, 300));
    expect(await commonsDoc('texts~mine')).toBeUndefined();
  });
});

describe('signed in', () => {
  beforeAll(async () => {
    put('readings', { id: 'shared1', pos: 42, updatedAt: 0 });
    await setUser(alice);
  });

  it('uploads changes made before signing in, with revision 1 and history', async () => {
    await vi.waitFor(async () => expect((await commonsDoc('texts~mine'))?.rev).toBe(1), { timeout: 8000 });
    const h = await historyDocs('texts~mine');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ by: 'alice', name: 'Alice', rev: 1 });
    expect(JSON.parse(h[0].j).title).toBe('Written before signing in');
  });

  it('does not re-upload what came from the shared library', async () => {
    expect((await commonsDoc('texts~shared1'))?.rev).toBe(1);
  });

  it('keeps reading positions private', async () => {
    await vi.waitFor(async () => expect((await fs.getDoc(fs.doc(client({ uid: 'alice' }), 'users/alice/records/readings~shared1'))).exists()).toBe(true), { timeout: 8000 });
    expect(await commonsDoc('readings~shared1')).toBeUndefined();
  });

  it('each later change is the next revision', async () => {
    const t = useStore.getState().texts.mine;
    put('texts', { ...t, title: 'Edited' });
    syncNow();
    await vi.waitFor(async () => expect((await commonsDoc('texts~mine'))?.rev).toBe(2), { timeout: 8000 });
    expect(await historyDocs('texts~mine')).toHaveLength(2);
  });

  it('another writer in between: newest wins, the revision chain stays intact', async () => {
    const t = useStore.getState().texts.shared1;
    // Bob edits first (rev 2, an older edit time), Alice's device has not seen it yet
    await writeAs(other, 'bob', 'texts', { ...t, title: 'Bob again', updatedAt: t.updatedAt + 1 }, 2);
    put('texts', { ...t, title: 'Alice’s version' });
    syncNow();
    await vi.waitFor(async () => expect((await commonsDoc('texts~shared1'))?.rev).toBe(3), { timeout: 8000 });
    expect(JSON.parse((await commonsDoc('texts~shared1'))!.j).title).toBe('Alice’s version');
    expect((await historyDocs('texts~shared1')).map((h) => h.by).sort()).toEqual(['alice', 'bob', 'bob']);
  });

  it('receives other people’s changes', async () => {
    const t = useStore.getState().texts.mine;
    await writeAs(other, 'bob', 'texts', { ...t, title: 'Bob fixed a typo', updatedAt: Date.now() + 1000 }, 3);
    await vi.waitFor(() => expect(useStore.getState().texts.mine.title).toBe('Bob fixed a typo'), { timeout: 8000 });
  });

  it('private texts and their passages stay out of the shared library; making a text private removes it', async () => {
    put('texts', { id: 'diary', title: 'Private', lang: '', content: 'secret', createdAt: 1, updatedAt: 0, private: true });
    put('translations', { id: 'pass1', kind: 'passage', lang: '', textId: 'diary', target: 'secret', createdAt: 1, updatedAt: 0, prompt: 'p', content: 'c' });
    put('translations', { id: 'word1', kind: 'word', lang: '', textId: 'diary', target: 'secret', createdAt: 1, updatedAt: 0, prompt: 'p', content: 'c' });
    syncNow();
    await vi.waitFor(async () => expect((await commonsDoc('translations~word1'))?.rev).toBe(1), { timeout: 8000 }); // words belong to the language
    expect(await commonsDoc('texts~diary')).toBeUndefined();
    expect(await commonsDoc('translations~pass1')).toBeUndefined();
    const t = useStore.getState().texts.mine;
    put('texts', { ...t, private: true });
    syncNow();
    await vi.waitFor(async () => expect((await commonsDoc('texts~mine'))?.del).toBe(true), { timeout: 8000 });
  });

  it('never shares API keys; syncs them privately only when asked', async () => {
    put('secrets', { id: 'openrouter', key: 'sk-or-secret', updatedAt: 0 });
    syncNow();
    await new Promise((r) => setTimeout(r, 800));
    const priv = client({ uid: 'alice' });
    expect((await fs.getDoc(fs.doc(priv, 'users/alice/records/secrets~openrouter'))).exists()).toBe(false);
    put('prefs', { id: 'prefs', syncKeys: true, updatedAt: 0 });
    put('secrets', { id: 'openrouter', key: 'sk-or-secret', updatedAt: 0 });
    syncNow();
    await vi.waitFor(async () => expect((await fs.getDoc(fs.doc(priv, 'users/alice/records/secrets~openrouter'))).exists()).toBe(true), { timeout: 8000 });
    expect(await commonsDoc('secrets~openrouter')).toBeUndefined();
  });

  it('splits big private records and reassembles them', async () => {
    const content = 'שָׁלוֹם '.repeat(150_000); // ~2.4 MB as UTF-8: too big to share, kept private
    put('texts', { id: 'huge', title: 'Huge', lang: '', content, createdAt: 1, updatedAt: 0 });
    syncNow();
    const priv = client({ uid: 'alice' });
    await vi.waitFor(async () => expect((await fs.getDoc(fs.doc(priv, 'users/alice/records/texts~huge'))).data()?.parts).toBeGreaterThan(2), { timeout: 15000 });
    expect(await commonsDoc('texts~huge')).toBeUndefined();
  });

  it('a blocked account cannot change the shared library', async () => {
    await fs.setDoc(fs.doc(client(ADMIN), 'banned', 'alice'), { at: 1 });
    put('translations', { id: 'spam', kind: 'word', lang: '', textId: 'x', target: 'spam', createdAt: 1, updatedAt: 0, prompt: 'p', content: 'spam' });
    syncNow();
    await vi.waitFor(() => expect(useSync.getState().error).toMatch(/refused/), { timeout: 8000 });
    expect(await commonsDoc('translations~spam')).toBeUndefined();
    await fs.deleteDoc(fs.doc(client(ADMIN), 'banned', 'alice'));
  });

  it('imports the previous app’s cloud save', async () => {
    const priv = client({ uid: 'alice' });
    await fs.setDoc(fs.doc(priv, 'users/alice/texts/text-old'), { id: 'text-old', title: 'Alt', language: 'German', content: 'Er gab nach.', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' });
    await fs.setDoc(fs.doc(priv, 'users/alice/annotations/ann-old'), { id: 'ann-old', textId: 'text-old', type: 'word', target: 'gab', result: 'gave', queryUsed: 'q', createdAt: '2026-08-02T00:00:00.000Z' });
    await fs.setDoc(fs.doc(priv, 'users/alice/mirrors/text-old'), { textId: 'text-old', rawCalqueText: 'He gave[1:yielded] after[1].', updatedAt: '2026-08-03T00:00:00.000Z' });
    await fs.setDoc(fs.doc(priv, 'users/alice/settings/config'), { decipherChats: { 'ann_ann-old': [{ role: 'user', content: 'why?', createdAt: '2026-08-02T01:00:00.000Z' }] } });
    const r = await importLegacyCloud(false);
    expect(r.merged).toBeGreaterThan(2);
    const s = useStore.getState();
    expect(s.texts['text-old'].title).toBe('Alt');
    expect(s.translations['ann-old'].chat?.[0].content).toBe('why?');
    expect(s.calques[s.texts['text-old'].calqueId!].slots).toEqual(['He', 'gave[1:yielded]', 'after[1].']);
  });

  it('after being unblocked, waiting changes go up; deletions as tombstones', async () => {
    remove('translations', 'word1');
    syncNow();
    await vi.waitFor(async () => expect((await commonsDoc('translations~word1'))?.del).toBe(true), { timeout: 8000 });
    expect((await commonsDoc('translations~spam'))?.rev).toBe(1); // refused attempts did not use up revision numbers
    expect(useSync.getState().error).toBeUndefined();
  });
});
