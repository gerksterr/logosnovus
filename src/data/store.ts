// In-memory app state (zustand) with write-through to IndexedDB.
// All mutations go through put/patch/remove/merge so persistence, sync
// bookkeeping and UI updates can never drift apart.

import { create } from 'zustand';
import { DEFAULT_LANGS, DEFAULT_MODELS, DEFAULT_PROMPTS } from '../model/defaults';
import { STORE_NAMES, type Id, type Rec, type Records, type StoreName, type Stores } from '../model/types';
import { loadAll, writeRecords } from './db';
import { acceptIncoming, type Bundle } from './merge';

export interface State extends Records {
  ready: boolean;
  saveError: string | null;
}

const emptyRecords = () => Object.fromEntries(STORE_NAMES.map((s) => [s, {}])) as unknown as Records;

export const useStore = create<State>(() => ({ ...emptyRecords(), ready: false, saveError: null }));
const S = () => useStore.getState();

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---- write-behind queue: coalesces bursts (imports, streaming saves) into one IDB transaction
const pending = new Map<StoreName, Map<Id, Rec>>();
let flushing: ReturnType<typeof setTimeout> | null = null;

function queueWrite(store: StoreName, rec: Rec) {
  if (!pending.has(store)) pending.set(store, new Map());
  pending.get(store)!.set(rec.id, rec);
  flushing ??= setTimeout(flush, 0);
}

export async function flush(): Promise<void> {
  flushing = null;
  if (!pending.size) return;
  const batch = new Map<StoreName, Rec[]>();
  for (const [s, m] of pending) batch.set(s, [...m.values()]);
  pending.clear();
  try {
    await writeRecords(batch);
    if (S().saveError) useStore.setState({ saveError: null });
  } catch (e) {
    // Never fail silently: the UI shows this and the data stays in memory.
    useStore.setState({ saveError: `Saving failed: ${(e as Error).message || e}` });
    for (const [s, recs] of batch) for (const r of recs) if (!pending.get(s)?.has(r.id)) queueWrite(s, r);
  }
}

// ---- local change notifications (consumed by cloud sync)
export interface Change {
  store: StoreName;
  id: Id;
}
const listeners = new Set<(changes: Change[]) => void>();
export function onLocalChange(fn: (changes: Change[]) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function commit<K extends StoreName>(store: K, recs: Stores[K][], local: boolean) {
  useStore.setState((s) => {
    const next = { ...s[store] } as Record<Id, Stores[K]>;
    for (const r of recs) next[r.id] = r;
    return { [store]: next } as Partial<State>;
  });
  for (const r of recs) queueWrite(store, r);
  if (local) for (const fn of listeners) fn(recs.map((r) => ({ store, id: r.id })));
}

/** Insert or replace a record, stamping updatedAt. */
export function put<K extends StoreName>(store: K, rec: Stores[K]): Stores[K] {
  const prev = S()[store][rec.id]?.updatedAt ?? 0;
  const r = { ...rec, updatedAt: Math.max(Date.now(), prev + 1) };
  commit(store, [r], true);
  return r;
}

export function putMany<K extends StoreName>(store: K, recs: Stores[K][]): void {
  const now = Date.now();
  commit(
    store,
    recs.map((r) => ({ ...r, updatedAt: Math.max(now, (S()[store][r.id]?.updatedAt ?? 0) + 1) })),
    true,
  );
}

export function patch<K extends StoreName>(store: K, id: Id, changes: Partial<Stores[K]>): Stores[K] | undefined {
  const cur = S()[store][id];
  if (!cur) return undefined;
  return put(store, { ...cur, ...changes } as Stores[K]);
}

/** Deletes by tombstone so the deletion reaches other devices. */
export function remove(store: StoreName, id: Id): void {
  const cur = S()[store][id];
  if (!cur || cur.deleted) return;
  put(store, { id, updatedAt: 0, deleted: true } as never);
}

/**
 * Last-writer-wins merge of records from sync, an import or a share link.
 * Imported records are queued for upload; synced ones are not echoed back.
 */
export function merge(incoming: Bundle, origin: 'sync' | 'import'): number {
  let n = 0;
  for (const store of STORE_NAMES) {
    const list = incoming[store];
    if (!list?.length) continue;
    const accepted = acceptIncoming(S()[store], list as Rec[]);
    if (accepted.length) {
      commit(store, accepted as Stores[typeof store][], origin === 'import');
      n += accepted.length;
    }
  }
  return n;
}

export async function initStore(): Promise<void> {
  const all = await loadAll();
  const recs = emptyRecords();
  for (const s of STORE_NAMES) for (const r of all[s]) (recs[s] as Record<Id, Rec>)[r.id] = r;
  const seeds: [StoreName, Rec[]][] = [
    ['langs', DEFAULT_LANGS],
    ['prompts', DEFAULT_PROMPTS],
    ['models', DEFAULT_MODELS],
  ];
  // Seeds are added when missing; a deleted seed leaves a tombstone and stays deleted.
  for (const [s, list] of seeds)
    for (const r of list)
      if (!(recs[s] as Record<Id, Rec>)[r.id]) {
        (recs[s] as Record<Id, Rec>)[r.id] = r;
        queueWrite(s, r);
      }
  useStore.setState({ ...recs, ready: true });
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
}

export const alive = <T extends Rec>(m: Record<Id, T>): T[] => Object.values(m).filter((r) => !r.deleted);
export const getRec = <K extends StoreName>(store: K, id: Id | undefined): Stores[K] | undefined => {
  const r = (id ? S()[store][id] : undefined) as Stores[K] | undefined;
  return r && !r.deleted ? r : undefined;
};
