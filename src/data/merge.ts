import { STORE_NAMES, type Id, type Rec, type StoreName, type Stores } from '../model/types';

/** Records from `incoming` that should replace or extend `current` (last writer wins). */
export function acceptIncoming(current: Record<Id, Rec>, incoming: Rec[]): Rec[] {
  const out: Rec[] = [];
  for (const r of incoming) {
    if (!r || typeof r.id !== 'string' || typeof r.updatedAt !== 'number') continue;
    const cur = current[r.id];
    if (!cur || r.updatedAt > cur.updatedAt) out.push(r);
  }
  return out;
}

export type Bundle = { [K in StoreName]?: Stores[K][] };

/** File format of exports and share links. */
export interface Backup {
  app: 'logosnovus';
  format: 3;
  exportedAt: string;
  records: Bundle;
}

export function makeBackup(records: Bundle): Backup {
  return { app: 'logosnovus', format: 3, exportedAt: new Date().toISOString(), records };
}

export function isBackup(x: unknown): x is Backup {
  const b = x as Backup;
  return !!b && b.app === 'logosnovus' && b.format === 3 && typeof b.records === 'object';
}

export function countBundle(b: Bundle): Partial<Record<StoreName, number>> {
  const out: Partial<Record<StoreName, number>> = {};
  for (const s of STORE_NAMES) if (b[s]?.length) out[s] = (b[s] as Rec[]).filter((r) => !r.deleted).length;
  return out;
}
