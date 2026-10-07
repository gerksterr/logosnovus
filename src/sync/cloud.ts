// Google sign-in + incremental Firestore sync.
//
// Layout: users/{uid}/records/{store}~{id} = { st, id, u, s, del?, j }
//   u = record.updatedAt (last-writer-wins), s = server timestamp (pull cursor,
//   immune to device clock skew), j = the record as JSON text (no Firestore
//   quirks with undefined/nested arrays). Records over ~900 KB are split into
//   part documents, so the 1 MB document limit can't block a save again.
// Every local change marks its record dirty; dirty records are pushed in
// small batches a few seconds later. A live query pulls other devices' changes.

import { create } from 'zustand';
import config from '../firebase-config.json';
import { convertLegacy } from '../data/legacy';
import { getMeta, setMeta } from '../data/db';
import { merge, onLocalChange, useStore } from '../data/store';
import { STORE_NAMES, type Rec, type StoreName } from '../model/types';

type FB = Awaited<ReturnType<typeof loadFirebase>>;

export interface SyncState {
  user: { uid: string; name: string; email: string } | null;
  status: 'off' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'error';
  error?: string;
  pending: number;
  lastPull?: number;
}

export const useSync = create<SyncState>(() => ({ user: null, status: 'off', pending: 0 }));

const SIGNED_IN = 'logosnovus.signedIn';
const MAX_DOC = 900_000;
let fb: FB | null = null;
let dirty = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

async function loadFirebase() {
  const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(config);
  return { auth, fs, authInst: auth.getAuth(app), db: fs.getFirestore(app, config.firestoreDatabaseId) };
}

async function firebase(): Promise<FB> {
  fb ??= await loadFirebase();
  return fb;
}

const docId = (store: string, id: string) => `${store}~${id}`;

/** Called once at startup. Firebase is only loaded if this device signed in before. */
export function startSync() {
  void getMeta<string[]>('dirty').then((d) => {
    for (const k of d ?? []) dirty.add(k);
    useSync.setState({ pending: dirty.size });
  });
  onLocalChange((changes) => {
    for (const c of changes) dirty.add(`${c.store}/${c.id}`);
    useSync.setState({ pending: dirty.size });
    void setMeta('dirty', [...dirty]);
    schedulePush();
  });
  addEventListener('online', () => schedulePush(500));
  if (localStorage.getItem(SIGNED_IN)) void connect();
}

async function connect() {
  useSync.setState({ status: 'connecting' });
  try {
    const f = await firebase();
    await f.auth.getRedirectResult(f.authInst).catch(() => null);
    f.auth.onAuthStateChanged(f.authInst, (u) => {
      unsubscribe?.();
      unsubscribe = null;
      if (!u) {
        useSync.setState({ user: null, status: 'off' });
        return;
      }
      localStorage.setItem(SIGNED_IN, '1');
      useSync.setState({ user: { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '' }, status: 'syncing', error: undefined });
      void firstSync(u.uid).then(() => listen(u.uid));
    });
  } catch (e) {
    useSync.setState({ status: 'error', error: (e as Error).message });
  }
}

export async function signIn() {
  const f = await firebase();
  if (!unsubscribe && !useSync.getState().user) void connect();
  const provider = new f.auth.GoogleAuthProvider();
  try {
    await f.auth.signInWithPopup(f.authInst, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') return f.auth.signInWithRedirect(f.authInst, provider);
    if (code === 'auth/unauthorized-domain')
      throw new Error(`This address (${location.hostname}) is not authorized for Google sign-in. Add it in the Firebase console → Authentication → Settings → Authorized domains.`);
    throw e;
  }
}

export async function signOut() {
  const f = await firebase();
  unsubscribe?.();
  unsubscribe = null;
  localStorage.removeItem(SIGNED_IN);
  await f.auth.signOut(f.authInst);
}

/** On a device's first sign-in to an account, upload everything it has. */
async function firstSync(uid: string) {
  if ((await getMeta<string>('syncedUid')) === uid) return;
  const s = useStore.getState();
  for (const st of STORE_NAMES) for (const r of Object.values(s[st]) as Rec[]) if (r.updatedAt > 2) dirty.add(`${st}/${r.id}`);
  await setMeta('syncedUid', uid);
  await setMeta('cursor', 0);
  useSync.setState({ pending: dirty.size });
  schedulePush(0);
}

async function listen(uid: string) {
  const { fs, db } = await firebase();
  const cursor = (await getMeta<number>('cursor')) ?? 0;
  const col = fs.collection(db, 'users', uid, 'records');
  const q = cursor ? fs.query(col, fs.where('s', '>', fs.Timestamp.fromMillis(cursor))) : fs.query(col);
  unsubscribe = fs.onSnapshot(
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
        const rec = await decode(uid, ch.doc.id, d);
        if (rec) (bundle[d.st as StoreName] ??= []).push(rec);
      }
      if (d0(bundle)) merge(bundle as never, 'sync');
      await setMeta('cursor', max);
      useSync.setState({ status: dirty.size ? 'syncing' : 'synced', lastPull: Date.now(), error: undefined });
    },
    (err) => useSync.setState({ status: navigator.onLine ? 'error' : 'offline', error: err.message }),
  );
}

const d0 = (b: object) => Object.keys(b).length > 0;

async function decode(uid: string, id: string, d: Record<string, any>): Promise<Rec | null> {
  try {
    if (d.del) return { id: d.id, updatedAt: d.u, deleted: true };
    let json: string = d.j ?? '';
    if (d.parts) {
      const { fs, db } = await firebase();
      const parts = await Promise.all(Array.from({ length: d.parts }, (_, i) => fs.getDoc(fs.doc(db, 'users', uid, 'records', `${id}~p${i}`))));
      json = parts.map((p) => p.data()?.j ?? '').join('');
    }
    const rec = JSON.parse(json) as Rec;
    return rec.updatedAt === d.u ? rec : { ...rec, updatedAt: d.u };
  } catch {
    return null; // a half-written record is fetched again on its next change
  }
}

function schedulePush(delay = 2500) {
  if (!useSync.getState().user) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), delay);
}

async function push() {
  pushTimer = null;
  const user = useSync.getState().user;
  if (!user || !dirty.size) return;
  if (!navigator.onLine) return useSync.setState({ status: 'offline' });
  const { fs, db } = await firebase();
  const s = useStore.getState();
  const syncKeys = !!s.prefs.prefs?.syncKeys;
  const keys = [...dirty].slice(0, 300);
  const batch = fs.writeBatch(db);
  let ops = 0;
  const sent: [string, number][] = [];
  for (const key of keys) {
    const [store, ...rest] = key.split('/');
    const id = rest.join('/');
    const rec = (s[store as StoreName] as Record<string, Rec> | undefined)?.[id];
    if (!rec || (store === 'secrets' && !syncKeys)) {
      dirty.delete(key);
      continue;
    }
    const ref = fs.doc(db, 'users', user.uid, 'records', docId(store, id));
    const base = { st: store, id, u: rec.updatedAt, s: fs.serverTimestamp() };
    if (rec.deleted) batch.set(ref, { ...base, del: true });
    else {
      const json = JSON.stringify(rec);
      const bytes = new TextEncoder().encode(json).length;
      if (bytes <= MAX_DOC) batch.set(ref, { ...base, j: json });
      else {
        // split by characters so each part stays under the limit even for 3-byte scripts
        const size = Math.floor(MAX_DOC / 3);
        const parts = Math.ceil(json.length / size);
        for (let i = 0; i < parts; i++) batch.set(fs.doc(db, 'users', user.uid, 'records', `${docId(store, id)}~p${i}`), { st: 'part', s: fs.serverTimestamp(), j: json.slice(i * size, (i + 1) * size) });
        batch.set(ref, { ...base, parts });
        ops += parts;
      }
    }
    sent.push([key, rec.updatedAt]);
    if (++ops >= 400) break;
  }
  useSync.setState({ status: 'syncing' });
  try {
    await batch.commit();
    const now = useStore.getState();
    for (const [key, at] of sent) {
      const [store, ...rest] = key.split('/');
      // only clear if not changed again while uploading
      if ((now[store as StoreName] as Record<string, Rec>)[rest.join('/')]?.updatedAt === at) dirty.delete(key);
    }
    await setMeta('dirty', [...dirty]);
    useSync.setState({ pending: dirty.size, status: dirty.size ? 'syncing' : 'synced', error: undefined });
    if (dirty.size) schedulePush(300);
  } catch (e) {
    useSync.setState({ status: navigator.onLine ? 'error' : 'offline', error: (e as Error).message });
    schedulePush(15000);
  }
}

export const syncNow = () => schedulePush(0);

/** One-time import of data saved by the previous app version (old Firestore layout). */
export async function importLegacyCloud(includeKeys: boolean) {
  const user = useSync.getState().user;
  if (!user) throw new Error('Sign in first.');
  const { fs, db } = await firebase();
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
