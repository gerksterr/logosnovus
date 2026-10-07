// IndexedDB persistence: one object store per record type plus a key/value
// `meta` store (sync cursor, unsynced-change queue). IndexedDB has no ~5 MB
// cap like localStorage and writes only the records that changed.

import { openDB, type IDBPDatabase } from 'idb';
import { STORE_NAMES, type Rec, type StoreName } from '../model/types';

const DB_NAME = 'logosnovus';
let handle: Promise<IDBPDatabase> | null = null;

function db() {
  handle ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      for (const s of STORE_NAMES) d.createObjectStore(s, { keyPath: 'id' });
      d.createObjectStore('meta');
    },
  });
  return handle;
}

export async function loadAll(): Promise<Record<StoreName, Rec[]>> {
  const d = await db();
  const tx = d.transaction(STORE_NAMES, 'readonly');
  const out = {} as Record<StoreName, Rec[]>;
  await Promise.all(STORE_NAMES.map(async (s) => (out[s] = await tx.objectStore(s).getAll())));
  return out;
}

export async function writeRecords(batch: Map<StoreName, Rec[]>): Promise<void> {
  if (!batch.size) return;
  const d = await db();
  const tx = d.transaction([...batch.keys()], 'readwrite');
  for (const [s, recs] of batch) for (const r of recs) tx.objectStore(s).put(r);
  await tx.done;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

export async function wipe(): Promise<void> {
  const d = await db();
  const tx = d.transaction([...STORE_NAMES, 'meta'], 'readwrite');
  await Promise.all([...STORE_NAMES, 'meta'].map((s) => tx.objectStore(s).clear()));
  await tx.done;
}
