// Administration of the shared library: who changed what (history), undoing
// changes — one, or all of an account's — and blocking accounts. Undoing is
// itself a change: it writes the earlier content as a new revision, so it can
// be undone too.

import type { StoreName } from '../model/types';
import { getBackend, type SyncUser } from './cloud';

export interface HistoryEntry {
  hid: string; // `${key}@${rev}`
  key: string; // `${store}~${id}`
  st: StoreName;
  id: string;
  rev: number;
  by: string;
  name?: string;
  at: number; // ms
  u: number;
  del?: boolean;
  j?: string;
  revert?: string; // the entry this one undid
}

export interface Account {
  uid: string;
  name: string;
  email: string;
  first?: number;
  last?: number;
}

export interface RevertItem {
  key: string;
  st: StoreName;
  id: string;
  fromRev: number; // the latest revision now
  toRev: number; // whose content comes back; 0 = the record did not exist (it is removed)
  restore: { j?: string; del?: true };
  conflict: boolean; // others changed it after the account did; undoing also drops their later changes
  lastBy: string;
}

const toEntry = (hid: string, d: Record<string, any>): HistoryEntry => ({ ...(d as HistoryEntry), hid, at: d.at?.toMillis?.() ?? 0 });

/**
 * What undoing an account's changes to one record means: its latest run of
 * changes goes, the content from just before comes back. If others changed the
 * record afterwards, it is a conflict: going back to before the account's
 * first change would drop their work too.
 */
export function planRevert(uid: string, chain: HistoryEntry[]): RevertItem | null {
  const c = [...chain].sort((a, b) => a.rev - b.rev);
  const latest = c.at(-1);
  if (!latest || !c.some((e) => e.by === uid)) return null;
  let start: number;
  const conflict = latest.by !== uid;
  if (!conflict) {
    start = c.length - 1;
    while (start > 0 && c[start - 1].by === uid) start--;
  } else start = c.findIndex((e) => e.by === uid);
  const target = start > 0 ? c[start - 1] : null;
  const restore: RevertItem['restore'] = !target || target.del ? { del: true } : { j: target.j };
  if ((restore.del && latest.del) || (restore.j != null && restore.j === latest.j)) return null; // nothing would change
  return { key: latest.key, st: latest.st, id: latest.id, fromRev: latest.rev, toRev: target?.rev ?? 0, restore, conflict, lastBy: latest.by };
}

/** Undoing one particular change: its record goes back to the revision before it. */
export function planUndo(entry: HistoryEntry, chain: HistoryEntry[]): RevertItem | null {
  const c = [...chain].sort((a, b) => a.rev - b.rev);
  const latest = c.at(-1)!;
  const target = c.filter((e) => e.rev < entry.rev).at(-1) ?? null;
  const restore: RevertItem['restore'] = !target || target.del ? { del: true } : { j: target.j };
  if ((restore.del && latest.del) || (restore.j != null && restore.j === latest.j)) return null;
  return { key: entry.key, st: entry.st, id: entry.id, fromRev: latest.rev, toRev: target?.rev ?? 0, restore, conflict: latest.rev !== entry.rev, lastBy: latest.by };
}

/** A short name for what a history entry is about (title, word, name). */
export function entryLabel(e: Pick<HistoryEntry, 'j' | 'id' | 'st'>): string {
  if (!e.j) return e.id;
  try {
    const r = JSON.parse(e.j);
    return String(r.title ?? r.target ?? r.name ?? r.form ?? r.model ?? e.id).slice(0, 120);
  } catch {
    return e.id;
  }
}

/** Fields that differ between two versions of a record (for the activity list). */
export function changedFields(before?: string, after?: string): { field: string; from: string; to: string }[] {
  const parse = (s?: string): Record<string, unknown> => {
    try {
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  };
  const a = parse(before);
  const b = parse(after);
  const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 300);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => k !== 'updatedAt' && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => ({ field: k, from: show(a[k]), to: show(b[k]) }));
}

// ---------------------------------------------------------------- reading

export async function recentHistory(max = 500, beforeMs?: number): Promise<HistoryEntry[]> {
  const { fs, db } = await getBackend();
  const col = fs.collection(db, 'history');
  const q = beforeMs ? fs.query(col, fs.orderBy('at', 'desc'), fs.where('at', '<', fs.Timestamp.fromMillis(beforeMs)), fs.limit(max)) : fs.query(col, fs.orderBy('at', 'desc'), fs.limit(max));
  return (await fs.getDocs(q)).docs.map((d) => toEntry(d.id, d.data()));
}

export async function historyBy(uid: string): Promise<HistoryEntry[]> {
  const { fs, db } = await getBackend();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'history'), fs.where('by', '==', uid)));
  return snap.docs.map((d) => toEntry(d.id, d.data())).sort((a, b) => b.at - a.at);
}

export async function historyOf(key: string): Promise<HistoryEntry[]> {
  const { fs, db } = await getBackend();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'history'), fs.where('key', '==', key)));
  return snap.docs.map((d) => toEntry(d.id, d.data())).sort((a, b) => a.rev - b.rev);
}

export async function listAccounts(): Promise<Account[]> {
  const { fs, db } = await getBackend();
  const snap = await fs.getDocs(fs.collection(db, 'accounts'));
  return snap.docs.map((d) => {
    const x = d.data();
    return { uid: d.id, name: x.name ?? '', email: x.email ?? '', first: x.first?.toMillis?.(), last: x.last?.toMillis?.() };
  });
}

export async function listBanned(): Promise<Set<string>> {
  const { fs, db } = await getBackend();
  return new Set((await fs.getDocs(fs.collection(db, 'banned'))).docs.map((d) => d.id));
}

export async function setBanned(uid: string, banned: boolean, reason = '') {
  const { fs, db } = await getBackend();
  const ref = fs.doc(db, 'banned', uid);
  if (banned) await fs.setDoc(ref, { at: fs.serverTimestamp(), reason });
  else await fs.deleteDoc(ref);
}

/** Everything needed to undo an account's changes, record by record. */
export async function prepareRevertAccount(uid: string): Promise<RevertItem[]> {
  const keys = [...new Set((await historyBy(uid)).map((e) => e.key))];
  const out: RevertItem[] = [];
  for (const key of keys) {
    const item = planRevert(uid, await historyOf(key));
    if (item) out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------- writing

/** Writes the planned contents back as new revisions (8 records per batch). Returns how many records changed. */
export async function applyRevert(items: RevertItem[], admin: SyncUser, onProgress?: (done: number) => void): Promise<number> {
  const { fs, db } = await getBackend();
  let done = 0;
  for (let i = 0; i < items.length; i += 8) {
    const batch = fs.writeBatch(db);
    let n = 0;
    for (const it of items.slice(i, i + 8)) {
      const cur = (await fs.getDoc(fs.doc(db, 'commons', it.key))).data();
      if (!cur) continue;
      const rev = cur.rev + 1;
      const u = Math.max(Date.now(), cur.u + 1); // newer than what everyone has, so devices take it
      const content = it.restore.del ? { del: true } : { j: it.restore.j };
      batch.set(fs.doc(db, 'commons', it.key), { st: it.st, id: it.id, u, s: fs.serverTimestamp(), rev, by: admin.uid, ...content });
      batch.set(fs.doc(db, 'history', `${it.key}@${rev}`), {
        key: it.key, st: it.st, id: it.id, rev, by: admin.uid, name: admin.name, at: fs.serverTimestamp(), u, revert: `${it.key}@${it.fromRev}`, ...content,
      });
      n++;
    }
    if (n) await batch.commit();
    done += n;
    onProgress?.(done);
  }
  return done;
}
