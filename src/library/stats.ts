// Cheap per-text figures for the library and the reader header (no full
// document parse: the library may hold whole books).

import { translationIndex } from '../data/selectors';
import type { Id, Reading, Text, Translation } from '../model/types';
import { parseMarkup } from '../text/markup';

const cache = new Map<string, { words: number; chars: number }>();

/** Word count and plain length (markup stripped) of a text's content. */
export function measure(content: string): { words: number; chars: number } {
  let m = cache.get(content);
  if (!m) {
    const { plain } = parseMarkup(content);
    m = { words: plain.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)?.length ?? 0, chars: plain.length };
    if (cache.size > 200) cache.clear();
    cache.set(content, m);
  }
  return m;
}

/** Reading progress 0..1 from the saved position (offset of the top line). */
export function progress(text: Text, reading: Reading | undefined): number {
  if (!reading?.pos) return 0;
  const { chars } = measure(text.content);
  return chars ? Math.min(1, reading.pos / chars) : 0;
}

export interface TextStats {
  translations: number; // all saved versions made in this text
  words: number; // distinct words looked up in this text
  passages: number; // distinct passages
  last: number; // newest translation time
}

let memo: { src: Record<Id, Translation> | null; out: Map<Id, TextStats> } = { src: null, out: new Map() };

export function textStats(map: Record<Id, Translation>): Map<Id, TextStats> {
  if (memo.src === map) return memo.out;
  const out = new Map<Id, TextStats>();
  for (const [id, list] of translationIndex(map).byText) {
    const words = new Set<string>();
    const passages = new Set<string>();
    let last = 0;
    for (const t of list) {
      (t.kind === 'word' ? words : passages).add(t.target.toLowerCase());
      last = Math.max(last, t.createdAt);
    }
    out.set(id, { translations: list.length, words: words.size, passages: passages.size, last });
  }
  memo = { src: map, out };
  return out;
}

export function ago(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}
