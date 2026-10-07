// Library ordering. Custom order: texts moved by hand get a `rank` and sit
// above all never-moved texts (which stay newest-first). A new text therefore
// lands below the hand-ordered ones and above the untouched ones.

import type { LibrarySort } from '../app/settings';
import type { Text } from '../model/types';

export function sortTexts(texts: Text[], mode: LibrarySort, activity: (t: Text) => number): Text[] {
  const list = [...texts];
  switch (mode) {
    case 'added-asc':
      return list.sort((a, b) => a.createdAt - b.createdAt);
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    case 'recent':
      return list.sort((a, b) => activity(b) - activity(a));
    case 'custom':
      return list.sort((a, b) => (b.rank ?? -Infinity) - (a.rank ?? -Infinity) || b.createdAt - a.createdAt);
    default:
      return list.sort((a, b) => b.createdAt - a.createdAt);
  }
}

/**
 * New ranks after moving ordered[from] to index `to` (custom order).
 * Returns only the texts whose rank changes.
 */
export function moveRanks(ordered: Text[], from: number, to: number): { id: string; rank: number }[] {
  if (from === to) return [];
  const list = [...ordered];
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  const rankedAbove = list.slice(0, to).every((t) => t.rank != null);
  if (rankedAbove) {
    const prev = list[to - 1]?.rank;
    const next = list.slice(to + 1).find((t) => t.rank != null)?.rank ?? 0;
    const rank = prev == null ? next + 1 : (prev + next) / 2;
    if (prev == null || prev - next > 1e-6) return [{ id: item.id, rank }];
  }
  // Dropped below never-moved texts (or ranks got too dense): fix the order of everything above the drop point.
  const below = list.slice(to + 1).reduce((m, t) => Math.max(m, t.rank ?? 0), 0);
  return list.slice(0, to + 1).map((t, k) => ({ id: t.id, rank: below + (to - k + 1) })).filter((x, k) => list[k].rank !== x.rank);
}
