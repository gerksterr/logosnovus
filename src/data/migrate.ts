// One-time moves of data between record types.

import type { Reading } from '../model/types';
import { alive, put, useStore } from './store';

/**
 * Per-text model choices and the custom library order became personal
 * (Reading) when texts became shared: move them off the text records.
 */
export function migratePersonalFields() {
  const s = useStore.getState();
  for (const t of alive(s.texts)) {
    if (t.rank == null && !t.wordModelId && !t.passageModelId) continue;
    const r = s.readings[t.id];
    const reading: Reading = { ...(r && !r.deleted ? r : {}), id: t.id, updatedAt: 0 };
    if (t.rank != null && reading.rank == null) reading.rank = t.rank;
    if (t.wordModelId && !reading.wordModelId) reading.wordModelId = t.wordModelId;
    if (t.passageModelId && !reading.passageModelId) reading.passageModelId = t.passageModelId;
    put('readings', reading);
    const { rank: _r, wordModelId: _w, passageModelId: _p, ...rest } = t;
    put('texts', { ...rest, updatedAt: 0 });
  }
}

/** Changes fields of a text's personal record (creating it if needed). */
export function patchReading(textId: string, changes: Partial<Reading>) {
  const r = useStore.getState().readings[textId];
  put('readings', { ...(r && !r.deleted ? r : {}), ...changes, id: textId, updatedAt: 0 });
}
