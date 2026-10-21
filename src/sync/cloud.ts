// Google sign-in and sync with Firestore.
//
// Two places (see firestore.rules):
//   commons/{store~id}  the shared library. Everyone reads it, without an
//     account; writing needs one. A record document is { st, id, u, s, rev,
//     by, del?, j } and every write creates history/{store~id@rev} with the
//     same content in the same batch, so each change can be traced and undone.
//   users/{uid}/records/{store~id}  what stays private: reading positions,
//     preferences, private texts with their passages and calques, and API keys
//     only if the account chose to sync them. Big private records are split
//     into parts (the 1 MB document limit).
// u = record.updatedAt (newest wins), s = server time (pull cursor, immune to
// device clocks), j = the record as JSON text. Local changes are marked dirty
// and uploaded in small batches; live queries bring everyone else's changes.

import { create } from 'zustand';
import config from '../firebase-config.json';
import { convertLegacy } from '../data/legacy';
import { getMeta, setMeta } from '../data/db';
import { getRec, merge, onLocalChange, useStore } from '../data/store';
import { STORE_NAMES, type Rec, type StoreName } from '../model/types';

type FS = typeof import('firebase/firestore');
type Db = import('firebase/firestore').Firestore;
export interface Backend {
  fs: FS;
  db: Db;
}

export interface SyncUser {
  uid: string;
  name: string;
  email: string;
  photo?: string;
}

export interface SyncState {
  user: SyncUser | null;
  status: 'off' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'error';
  error?: string;
  pending: number;
  lastPull?: number;
  /** the shared library: live, or unavailable (e.g. the database rules are not set up) */
  commons: 'connecting' | 'live' | 'unavailable';
  commonsError?: string;
}

export const useSync = create<SyncState>(() => ({ user: null, status: 'off', pending: 0, commons: 'connecting' }));

export const ADMIN_EMAIL = 'gerksterr@gmail.com';
export const isAdmin = (u: SyncUser | null) => !!u && u.email.toLowerCase() === ADMIN_EMAIL;

/** Stores that may go to the shared library (everything else is personal). */
export const SHARED: StoreName[] = ['langs', 'texts', 'prompts', 'providers', 'models', 'translations', 'calques', 'lemmas'];
const COMMONS_BATCH = 8; // records per batch: the rules look up ~2 documents per record, 20 allowed per batch
const MAX_DOC = 900_000;
const SIGNED_IN = 'logosnovus.signedIn';

let backend: Promise<Backend> | null = null;
let authMod: { auth: typeof import('firebase/auth'); inst: import('firebase/auth').Auth } | null = null;
let dirty = new Set<string>(); // `${store}/${id}`
let revs = new Map<string, { rev: number; u: number; del?: boolean }>(); // commons key → last known server revision
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let unsubCommons: (() => void) | null = null;
let unsubPrivate: (() => void) | null = null;
let commonsReady: Promise<void> = Promise.resolve();
let started = false;

async function loadFirebase(): Promise<Backend> {
  const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(config);
  authMod = { auth, inst: auth.getAuth(app) };
  return { fs, db: fs.getFirestore(app, config.firestoreDatabaseId) };
}

/** The Firestore connection (tests pass their own). */
export function getBackend(): Promise<Backend> {
  backend ??= loadFirebase();
  return backend;
}
export function useBackend(b: Backend) {
  backend = Promise.resolve(b);
}

const commonsKey = (store: string, id: string) => `${store}~${id}`;
const splitKey = (key: string): [StoreName, string] => {
  const i = key.indexOf('/');
  return [key.slice(0, i) as StoreName, key.slice(i + 1)];
};
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** Where a record lives: the shared library, the account's private space, or only this device. */
export function route(store: StoreName, rec: Rec): 'commons' | 'private' | 'local' {
  if (store === 'secrets') return getRec('prefs', 'prefs')?.syncKeys ? 'private' : 'local';
  if (!SHARED.includes(store)) return 'private';
  if (rec.deleted) return revs.has(commonsKey(store, rec.id)) && !revs.get(commonsKey(store, rec.id))!.del ? 'commons' : 'private';
  const textId = store === 'texts' ? rec.id : store === 'calques' || (store === 'translations' && (rec as { kind?: string }).kind === 'passage') ? (rec as { textId?: string }).textId : undefined;
  const text = textId ? (store === 'texts' ? (rec as { private?: boolean; scratch?: boolean }) : getRec('texts', textId)) : undefined;
  if (text?.private || text?.scratch) return 'private';
  if (bytes(JSON.stringify(rec)) > MAX_DOC) return 'private'; // too big for one shared document
  return 'commons';
}

const persistRevs = (() => {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    t ??= setTimeout(() => {
      t = null;
      void setMeta('commonsRevs', [...revs]);
    }, 500);
  };
})();

/** Called once at startup: reads the shared library and, if this device signed in before, the account. */
export function startSync() {
  if (started) return;
  started = true;
  const loaded = Promise.all([getMeta<string[]>('dirty'), getMeta<[string, { rev: number; u: number; del?: boolean }][]>('commonsRevs')]).then(([d, r]) => {
    for (const k of d ?? []) dirty.add(k);
    revs = new Map(r ?? []);
    useSync.setState({ pending: dirty.size });
  });
  onLocalChange((changes) => {
    for (const c of changes) dirty.add(`${c.store}/${c.id}`);
    useSync.setState({ pending: dirty.size });
    void setMeta('dirty', [...dirty]);
    schedulePush();
  });
  addEventListener('online', () => schedulePush(500));
  commonsReady = loaded.then(() => listenCommons());
  if (localStorage.getItem(SIGNED_IN)) void loaded.then(() => watchAuth());
}

// ---------------------------------------------------------------- account

let watching: Promise<void> | null = null;
function watchAuth(): Promise<void> {
  watching ??= (async () => {
    useSync.setState({ status: 'connecting' });
    try {
      await getBackend();
      if (!authMod) return; // tests sign in through setUser()
      const { auth, inst } = authMod;
      await auth.getRedirectResult(inst).catch(() => null);
      auth.onAuthStateChanged(inst, (u) =>
        void setUser(u ? { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL ?? undefined } : null),
      );
    } catch (e) {
      useSync.setState({ status: 'error', error: (e as Error).message });
    }
  })();
  return watching;
}

/** The signed-in account changed (also used by tests). */
export async function setUser(user: SyncUser | null) {
  unsubPrivate?.();
  unsubPrivate = null;
  if (!user) {
    useSync.setState({ user: null, status: 'off' });
    return;
  }
  localStorage.setItem(SIGNED_IN, '1');
  useSync.setState({ user, status: 'syncing', error: undefined });
  void recordAccount(user);
  await firstSync(user.uid);
  await listenPrivate(user.uid);
  schedulePush(0);
}

async function recordAccount(user: SyncUser) {
  try {
    const { fs, db } = await getBackend();
    const ref = fs.doc(db, 'accounts', user.uid);
    const known = await fs.getDoc(ref).catch(() => null);
    await fs.setDoc(ref, { name: user.name, email: user.email, ...(user.photo ? { photo: user.photo } : {}), last: fs.serverTimestamp(), ...(known?.exists() ? {} : { first: fs.serverTimestamp() }) }, { merge: true });
  } catch {
    /* the account list is a convenience for the admin */
  }
}

export async function signIn() {
  await getBackend();
  await watchAuth();
  if (!authMod) return;
  const { auth, inst } = authMod;
  const provider = new auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(inst, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') return auth.signInWithRedirect(inst, provider);
    if (code === 'auth/unauthorized-domain')
      throw new Error(`This address (${location.hostname}) is not authorized for Google sign-in. Add it in the Firebase console → Authentication → Settings → Authorized domains.`);
    throw e;
  }
}

export async function signOut() {
  localStorage.removeItem(SIGNED_IN);
  if (authMod) await authMod.auth.signOut(authMod.inst);
  else await setUser(null);
}

/**
 * The first sign-in of an account on this device uploads what this device has
 * that the shared library and the account do not: records changed here.
 */
async function firstSync(uid: string) {
  if ((await getMeta<string>('syncedUid')) === uid) return;
  await commonsReady;
  const s = useStore.getState();
  for (const st of STORE_NAMES)
    for (const r of Object.values(s[st]) as Rec[]) {
      if (r.updatedAt <= 2) continue; // built-in seeds
      const known = revs.get(commonsKey(st, r.id));
      if (known && known.u >= r.updatedAt) continue; // it came from the shared library
      dirty.add(`${st}/${r.id}`);
    }
  await setMeta('syncedUid', uid);
  await setMeta('cursor', 0);
  await setMeta('dirty', [...dirty]);
  useSync.setState({ pending: dirty.size });
}

// ---------------------------------------------------------------- pulling

async function decode(d: Record<string, any>, partsOf?: (i: number) => Promise<string>): Promise<Rec | null> {
  try {
    if (d.del) return { id: d.id, updatedAt: d.u, deleted: true };
    let json: string = d.j ?? '';
    if (d.parts && partsOf) json = (await Promise.all(Array.from({ length: d.parts }, (_, i) => partsOf(i)))).join('');
    const rec = JSON.parse(json) as Rec;
    if (rec.id !== d.id) return null;
    return rec.updatedAt === d.u ? rec : { ...rec, updatedAt: d.u };
  } catch {
    return null; // a half-written record is fetched again on its next change
  }
}

async function listenCommons() {
  let first = true;
  let resolveFirst: () => void = () => {};
  const firstSnap = new Promise<void>((r) => (resolveFirst = r));
  try {
    const { fs, db } = await getBackend();
    const cursor = (await getMeta<number>('commonsCursor')) ?? 0;
    const col = fs.collection(db, 'commons');
    const q = cursor ? fs.query(col, fs.where('s', '>', fs.Timestamp.fromMillis(cursor))) : fs.query(col);
    unsubCommons = fs.onSnapshot(
      q,
      { includeMetadataChanges: true }, // so the switch from cached to server data is heard
      async (snap) => {
        const bundle: Partial<Record<StoreName, Rec[]>> = {};
        let max = (await getMeta<number>('commonsCursor')) ?? 0;
        for (const ch of snap.docChanges()) {
          // our own writes show up here before the server accepts them, and vanish again if it refuses:
          // only server-confirmed revisions count
          if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) continue;
          const d = ch.doc.data();
          if (!SHARED.includes(d.st)) continue;
          const ts = d.s?.toMillis?.();
          if (ts) max = Math.max(max, ts);
          const key = commonsKey(d.st, d.id);
          if (!revs.has(key) || revs.get(key)!.rev <= d.rev) revs.set(key, { rev: d.rev, u: d.u, del: d.del || undefined });
          const rec = await decode(d);
          if (rec) (bundle[d.st as StoreName] ??= []).push(rec);
        }
        persistRevs();
        if (Object.keys(bundle).length) merge(bundle as never, 'sync');
        await setMeta('commonsCursor', max);
        // data from this device's cache only: not connected yet (offline, or the server is unreachable)
        if (snap.metadata.fromCache) useSync.setState({ commons: 'connecting' });
        else useSync.setState({ commons: 'live', commonsError: undefined, lastPull: Date.now() });
        if (first) (first = false), resolveFirst();
      },
      (err) => {
        useSync.setState({ commons: 'unavailable', commonsError: err.message });
        resolveFirst();
      },
    );
  } catch (e) {
    useSync.setState({ commons: 'unavailable', commonsError: (e as Error).message });
    resolveFirst();
  }
  await firstSnap;
}

async function listenPrivate(uid: string) {
  const { fs, db } = await getBackend();
  const cursor = (await getMeta<number>('cursor')) ?? 0;
  const col = fs.collection(db, 'users', uid, 'records');
  const q = cursor ? fs.query(col, fs.where('s', '>', fs.Timestamp.fromMillis(cursor))) : fs.query(col);
  unsubPrivate = fs.onSnapshot(
    q,
    async (snap) => {
      const bundle: Partial<Record<StoreName, Rec[]>> = {};
      let max = (await getMeta<number>('cursor')) ?? 0;
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed') continue;
        const d = ch.doc.data();
        if (d.st === 'part' || !STORE_NAMES.includes(d.st)) continue;
        const ts = d.s?.toMillis?.();
        if (ts && !ch.doc.metadata.hasPendingWrites) max = Math.max(max, ts);
        const rec = await decode(d, async (i) => (await fs.getDoc(fs.doc(db, 'users', uid, 'records', `${ch.doc.id}~p${i}`))).data()?.j ?? '');
        if (rec) (bundle[d.st as StoreName] ??= []).push(rec);
      }
      if (Object.keys(bundle).length) merge(bundle as never, 'sync');
      await setMeta('cursor', max);
      useSync.setState({ status: dirty.size ? 'syncing' : 'synced', lastPull: Date.now(), error: undefined });
    },
    (err) => useSync.setState({ status: navigator.onLine ? 'error' : 'offline', error: err.message }),
  );
}

// ---------------------------------------------------------------- pushing

function schedulePush(delay = 2500) {
  if (!useSync.getState().user) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), delay);
}

export const syncNow = () => schedulePush(0);

async function push() {
  pushTimer = null;
  const user = useSync.getState().user;
  if (!user || !dirty.size) return;
  if (pushing) return schedulePush(800); // changes made during an upload go in the next one
  if (!navigator.onLine) return useSync.setState({ status: 'offline' });
  pushing = true;
  useSync.setState({ status: 'syncing' });
  try {
    await commonsReady;
    const s = useStore.getState();
    const toCommons: string[] = [];
    const toPrivate: string[] = [];
    for (const key of dirty) {
      const [store, id] = splitKey(key);
      const rec = (s[store] as Record<string, Rec> | undefined)?.[id];
      if (!rec) {
        dirty.delete(key);
        continue;
      }
      const where = route(store, rec);
      if (where === 'local') dirty.delete(key);
      else if (where === 'commons') toCommons.push(key);
      else toPrivate.push(key);
      // a shared record that became private (a private text, its passages and calques) leaves the shared library
      const shared = revs.get(commonsKey(store, id));
      if (where === 'private' && SHARED.includes(store) && shared && !shared.del) toCommons.push(`${key}#tombstone`);
    }
    if (toPrivate.length) await pushPrivate(user.uid, toPrivate);
    let refused: string | null = null;
    if (useSync.getState().commons !== 'unavailable')
      for (let i = 0; i < toCommons.length && !refused; i += COMMONS_BATCH) refused = await pushCommons(user, toCommons.slice(i, i + COMMONS_BATCH));
    await setMeta('dirty', [...dirty]);
    if (refused) {
      useSync.setState({ pending: dirty.size, status: 'error', error: refused });
      schedulePush(60000);
    } else {
      useSync.setState({ pending: dirty.size, status: dirty.size ? 'syncing' : 'synced', error: undefined });
      if (dirty.size) schedulePush(1000);
    }
  } catch (e) {
    useSync.setState({ status: navigator.onLine ? 'error' : 'offline', error: (e as Error).message });
    schedulePush(30000);
  } finally {
    pushing = false;
  }
}

/** Clears a dirty mark unless the record changed again while it was uploading. */
function sent(key: string, at: number) {
  const [store, id] = splitKey(key);
  if ((useStore.getState()[store] as Record<string, Rec>)[id]?.updatedAt === at) dirty.delete(key);
}

async function pushPrivate(uid: string, keys: string[]) {
  const { fs, db } = await getBackend();
  for (let i = 0; i < keys.length; ) {
    const batch = fs.writeBatch(db);
    let ops = 0;
    const done: [string, number][] = [];
    for (; i < keys.length && ops < 400; i++) {
      const [store, id] = splitKey(keys[i]);
      const rec = (useStore.getState()[store] as Record<string, Rec>)[id];
      if (!rec) continue;
      const ref = fs.doc(db, 'users', uid, 'records', commonsKey(store, id));
      const base = { st: store, id, u: rec.updatedAt, s: fs.serverTimestamp() };
      if (rec.deleted) batch.set(ref, { ...base, del: true });
      else {
        const json = JSON.stringify(rec);
        if (bytes(json) <= MAX_DOC) batch.set(ref, { ...base, j: json });
        else {
          // split by characters so each part stays under the limit even for 3-byte scripts
          const size = Math.floor(MAX_DOC / 3);
          const parts = Math.ceil(json.length / size);
          for (let p = 0; p < parts; p++) batch.set(fs.doc(db, 'users', uid, 'records', `${commonsKey(store, id)}~p${p}`), { st: 'part', s: fs.serverTimestamp(), j: json.slice(p * size, (p + 1) * size) });
          batch.set(ref, { ...base, parts });
          ops += parts;
        }
      }
      ops++;
      done.push([keys[i], rec.updatedAt]);
    }
    await batch.commit();
    for (const [k, at] of done) sent(k, at);
  }
}

/** One batch of shared records, each with the next revision and its history entry. Returns why it was refused, if it was. */
async function pushCommons(user: SyncUser, keys: string[], retried = false): Promise<string | null> {
  const { fs, db } = await getBackend();
  const s = useStore.getState();
  const batch = fs.writeBatch(db);
  const done: { key: string; ck: string; rev: number; u: number; at: number; del: boolean }[] = [];
  for (const raw of keys) {
    const tomb = raw.endsWith('#tombstone');
    const key = tomb ? raw.slice(0, -10) : raw;
    const [store, id] = splitKey(key);
    const rec = (s[store] as Record<string, Rec>)[id];
    if (!rec) continue;
    const ck = commonsKey(store, id);
    const prev = revs.get(ck);
    const rev = (prev?.rev ?? 0) + 1;
    // each revision is newer than the last one, even from a device whose clock is behind
    const u = Math.max(rec.updatedAt, (prev?.u ?? 0) + 1);
    const content: { del: true } | { j: string } = tomb || rec.deleted ? { del: true } : { j: JSON.stringify(rec) };
    batch.set(fs.doc(db, 'commons', ck), { st: store, id, u, s: fs.serverTimestamp(), rev, by: user.uid, ...content });
    batch.set(fs.doc(db, 'history', `${ck}@${rev}`), { key: ck, st: store, id, rev, by: user.uid, name: user.name, at: fs.serverTimestamp(), u, ...content });
    done.push({ key: raw, ck, rev, u, at: rec.updatedAt, del: 'del' in content });
  }
  if (!done.length) return null;
  try {
    await batch.commit();
    for (const d of done) {
      revs.set(d.ck, { rev: d.rev, u: d.u, del: d.del || undefined });
      if (d.key.endsWith('#tombstone')) continue;
      sent(d.key, d.at);
    }
    persistRevs();
    return null;
  } catch (e) {
    if (retried)
      return (e as { code?: string }).code === 'permission-denied'
        ? 'The shared library refused the change: this account may be blocked, or the database rules are not set up yet (Settings → Shared library).'
        : (e as Error).message;
    // someone else wrote in between: learn the current revisions, let newer versions win, try once more
    for (const d of done) {
      const snap = await fs.getDoc(fs.doc(db, 'commons', d.ck)).catch(() => null);
      const data = snap?.exists() ? snap.data() : null;
      if (!data) {
        if (snap) revs.delete(d.ck); // the server has no such record: start from revision 1
        continue;
      }
      revs.set(d.ck, { rev: data.rev, u: data.u, del: data.del || undefined });
      if (data.u >= d.at && !d.key.endsWith('#tombstone')) {
        const rec = await decode(data);
        if (rec) merge({ [data.st]: [rec] } as never, 'sync');
        dirty.delete(d.key);
      }
    }
    persistRevs();
    const again = done.map((d) => d.key).filter((k) => k.endsWith('#tombstone') || dirty.has(k));
    return again.length ? pushCommons(user, again, true) : null;
  }
}

/** Records this account still has to upload, and how many of them go to the shared library. */
export function pendingCounts(): { total: number; shared: number } {
  const s = useStore.getState();
  let shared = 0;
  for (const key of dirty) {
    const [store, id] = splitKey(key);
    const rec = (s[store] as Record<string, Rec> | undefined)?.[id];
    if (rec && route(store, rec) === 'commons') shared++;
  }
  return { total: dirty.size, shared };
}

/** Marks every record changed on this device for upload (e.g. after the database rules were set up). */
export function republishAll() {
  const s = useStore.getState();
  for (const st of STORE_NAMES)
    for (const r of Object.values(s[st]) as Rec[]) {
      if (r.updatedAt <= 2) continue;
      const known = revs.get(commonsKey(st, r.id));
      if (!known || known.u < r.updatedAt) dirty.add(`${st}/${r.id}`);
    }
  useSync.setState({ pending: dirty.size, error: undefined });
  void setMeta('dirty', [...dirty]);
  schedulePush(0);
}

/** Restarts reading the shared library (after the rules were set up). */
export function reconnectCommons() {
  unsubCommons?.();
  useSync.setState({ commons: 'connecting', commonsError: undefined });
  commonsReady = listenCommons();
}

/** One-time import of data saved by the previous app version (old Firestore layout). */
export async function importLegacyCloud(includeKeys: boolean) {
  const user = useSync.getState().user;
  if (!user) throw new Error('Sign in first.');
  const { fs, db } = await getBackend();
  const all = async (name: string) => (await fs.getDocs(fs.collection(db, 'users', user.uid, name))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const [texts, blueprints, annotations, mirrorsRaw, config] = await Promise.all([
    all('texts'),
    all('blueprints'),
    all('annotations'),
    all('mirrors'),
    fs.getDoc(fs.doc(db, 'users', user.uid, 'settings', 'config')),
  ]);
  const mirrors: Record<string, any> = {};
  for (const m of mirrorsRaw as any[]) if (!m.id.includes('_chunk_') && m.rawCalqueText) mirrors[m.textId ?? m.id] = m;
  const cfg = config.data() ?? {};
  const old = { texts, blueprints, annotations, mirrorTranslations: mirrors, llmConfig: cfg.llmConfig, decipherChats: cfg.decipherChats };
  if (!texts.length && !annotations.length) throw new Error('No data from the previous version was found in this account.');
  const result = convertLegacy(old, { includeKeys });
  const n = merge(result.bundle, 'import');
  return { ...result, merged: n };
}
