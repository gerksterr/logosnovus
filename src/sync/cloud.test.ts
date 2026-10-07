// Sync protocol against an in-memory fake of the Firestore/Auth APIs we use:
// local edits upload as per-record documents, remote changes arrive through
// the live query, tombstones delete, older remote copies lose, and records
// over the document limit are split into parts and reassembled.

import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// ---- environment shims (node has no window/localStorage/online flag)
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
(globalThis as any).addEventListener ??= () => {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

// ---- fake Firestore
const SENTINEL = { serverTimestamp: true };
const store = new Map<string, any>();
let clock = 1_000;
type Listener = { prefix: string; after: number; next: (snap: any) => void };
const listeners: Listener[] = [];
const ts = (ms: number) => ({ toMillis: () => ms });
const snapOf = (changes: [string, any][]) => ({
  docChanges: () => changes.map(([path, data]) => ({ type: 'modified', doc: { id: path.split('/').at(-1), data: () => data, metadata: { hasPendingWrites: false } } })),
});
function commitDocs(writes: [string, any][]) {
  const stamped: [string, any][] = writes.map(([p, d]) => [p, Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === SENTINEL ? ts(++clock) : v]))]);
  for (const [p, d] of stamped) store.set(p, d);
  for (const l of listeners) {
    const hit = stamped.filter(([p, d]) => p.startsWith(l.prefix) && d.s.toMillis() > l.after);
    if (hit.length) l.next(snapOf(hit));
  }
}
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  query: (col: { path: string }, w?: { value: { toMillis(): number } }) => ({ prefix: col.path + '/', after: w ? w.value.toMillis() : 0 }),
  where: (_f: string, _op: string, value: unknown) => ({ value }),
  Timestamp: { fromMillis: ts },
  serverTimestamp: () => SENTINEL,
  writeBatch: () => {
    const ops: [string, any][] = [];
    return { set: (ref: { path: string }, data: any) => ops.push([ref.path, data]), commit: async () => commitDocs(ops) };
  },
  onSnapshot: (q: { prefix: string; after: number }, next: (s: any) => void) => {
    listeners.push({ ...q, next });
    const existing = [...store].filter(([p, d]) => p.startsWith(q.prefix) && d.s.toMillis() > q.after);
    queueMicrotask(() => next(snapOf(existing)));
    return () => {};
  },
  getDoc: async (ref: { path: string }) => ({ data: () => store.get(ref.path), exists: () => store.has(ref.path) }),
  getDocs: async (col: { path: string }) => ({ docs: [...store].filter(([p]) => p.startsWith(col.path + '/') && p.split('/').length === col.path.split('/').length + 1).map(([p, d]) => ({ id: p.split('/').at(-1), data: () => d })) }),
}));
// like Firebase: listeners get the current user on registration and on every change
const auth = { user: null as unknown, listeners: [] as ((u: unknown) => void)[] };
const setUser = (u: unknown) => ((auth.user = u), auth.listeners.forEach((cb) => cb(u)));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  getRedirectResult: async () => null,
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    auth.listeners.push(cb);
    queueMicrotask(() => cb(auth.user));
  },
  GoogleAuthProvider: class {},
  signInWithPopup: async () => setUser({ uid: 'u1', displayName: 'Reader', email: 'r@example.com' }),
  signOut: async () => setUser(null),
}));

const { initStore, put, remove, useStore } = await import('../data/store');
const { startSync, signIn, syncNow, useSync, importLegacyCloud } = await import('./cloud');
const recPath = (store: string, id: string) => `users/u1/records/${store}~${id}`;

beforeAll(async () => {
  await initStore();
  startSync();
  put('texts', { id: 'before-signin', title: 'Local text', lang: '', content: 'x', createdAt: 1, updatedAt: 0 });
  await signIn();
  await vi.waitFor(() => expect(useSync.getState().user?.uid).toBe('u1'));
});

describe('cloud sync', () => {
  it('uploads existing local records on first sign-in', async () => {
    await vi.waitFor(() => expect(store.has(recPath('texts', 'before-signin'))).toBe(true), { timeout: 4000 });
    const doc = store.get(recPath('texts', 'before-signin'));
    expect(JSON.parse(doc.j).title).toBe('Local text');
    expect(typeof doc.u).toBe('number');
  });

  it('uploads each local change as its own small document', async () => {
    put('translations', { id: 'tr1', kind: 'word', lang: 'de', textId: 't', target: 'Volk', createdAt: 1, updatedAt: 0, prompt: 'p', content: 'people' });
    syncNow();
    await vi.waitFor(() => expect(store.has(recPath('translations', 'tr1'))).toBe(true));
    await vi.waitFor(() => expect(useSync.getState().pending).toBe(0));
  });

  it('receives remote changes and keeps newer local copies', async () => {
    const now = Date.now();
    commitDocs([
      [recPath('texts', 'remote'), { st: 'texts', id: 'remote', u: now, s: SENTINEL, j: JSON.stringify({ id: 'remote', title: 'From phone', lang: '', content: 'y', createdAt: 1, updatedAt: now }) }],
      [recPath('texts', 'before-signin'), { st: 'texts', id: 'before-signin', u: 5, s: SENTINEL, j: JSON.stringify({ id: 'before-signin', title: 'Stale', lang: '', content: 'x', createdAt: 1, updatedAt: 5 }) }],
    ]);
    await vi.waitFor(() => expect(useStore.getState().texts.remote?.title).toBe('From phone'));
    expect(useStore.getState().texts['before-signin'].title).toBe('Local text');
  });

  it('propagates deletions as tombstones in both directions', async () => {
    remove('translations', 'tr1');
    syncNow();
    await vi.waitFor(() => expect(store.get(recPath('translations', 'tr1')).del).toBe(true));
    commitDocs([[recPath('texts', 'remote'), { st: 'texts', id: 'remote', u: Date.now() + 10, s: SENTINEL, del: true }]]);
    await vi.waitFor(() => expect(useStore.getState().texts.remote.deleted).toBe(true));
  });

  it('splits records over the Firestore size limit and reassembles them', async () => {
    const content = 'שָׁלוֹם '.repeat(150_000); // ~2.4 MB as UTF-8
    put('texts', { id: 'huge', title: 'Huge', lang: '', content, createdAt: 1, updatedAt: 0 });
    syncNow();
    await vi.waitFor(() => expect(store.get(recPath('texts', 'huge'))?.parts).toBeGreaterThan(2));
    const parts = [...store.keys()].filter((k) => k.startsWith(recPath('texts', 'huge') + '~p'));
    for (const p of parts) expect(new TextEncoder().encode(store.get(p).j).length).toBeLessThan(1_000_000);
    // another device edits it: the reassembled record arrives intact
    const edited = { id: 'huge', title: 'Huge (edited)', lang: '', content, createdAt: 1, updatedAt: Date.now() + 100 };
    const json = JSON.stringify(edited);
    const size = 300_000;
    const n = Math.ceil(json.length / size);
    commitDocs([
      ...Array.from({ length: n }, (_, i) => [`${recPath('texts', 'huge')}~p${i}`, { st: 'part', s: SENTINEL, j: json.slice(i * size, (i + 1) * size) }] as [string, any]),
      [recPath('texts', 'huge'), { st: 'texts', id: 'huge', u: edited.updatedAt, s: SENTINEL, parts: n }],
    ]);
    await vi.waitFor(() => expect(useStore.getState().texts.huge.title).toBe('Huge (edited)'));
    expect(useStore.getState().texts.huge.content.length).toBe(content.length);
  });

  it('does not upload API keys unless key sync is on', async () => {
    put('secrets', { id: 'openrouter', key: 'sk-or-secret', updatedAt: 0 });
    syncNow();
    await new Promise((r) => setTimeout(r, 200));
    expect(store.has(recPath('secrets', 'openrouter'))).toBe(false);
    put('prefs', { id: 'prefs', syncKeys: true, updatedAt: 0 });
    put('secrets', { id: 'openrouter', key: 'sk-or-secret', updatedAt: 0 });
    syncNow();
    await vi.waitFor(() => expect(store.has(recPath('secrets', 'openrouter'))).toBe(true));
  });

  it('imports data saved by the previous app version (old Firestore layout)', async () => {
    store.set('users/u1/texts/text-old', { id: 'text-old', title: 'Alt', language: 'German', content: 'Er gab nach.', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' });
    store.set('users/u1/annotations/ann-old', { id: 'ann-old', textId: 'text-old', type: 'word', target: 'gab', result: 'gave', queryUsed: 'q', createdAt: '2026-08-02T00:00:00.000Z' });
    store.set('users/u1/mirrors/text-old', { textId: 'text-old', rawCalqueText: 'He gave[1:yielded] after[1].', updatedAt: '2026-08-03T00:00:00.000Z' });
    store.set('users/u1/settings/config', { decipherChats: { 'ann_ann-old': [{ role: 'user', content: 'why?', createdAt: '2026-08-02T01:00:00.000Z' }] } });
    const r = await importLegacyCloud(false);
    expect(r.merged).toBeGreaterThan(2);
    const s = useStore.getState();
    expect(s.texts['text-old'].title).toBe('Alt');
    expect(s.translations['ann-old'].chat?.[0].content).toBe('why?');
    expect(s.calques[s.texts['text-old'].calqueId!].slots).toEqual(['He', 'gave[1:yielded]', 'after[1].']);
  });
});
