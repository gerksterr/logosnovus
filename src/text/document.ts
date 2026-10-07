// One canonical parse of a text. Every feature (rendering, lookups, passages,
// calque alignment, copy, scroll memory, minimap) addresses the text through
// offsets into `plain`, so they can never disagree about where a word is.
//
//   paragraph = run of non-blank lines (single newlines render as line breaks)
//   chunk     = whitespace-delimited segment; one calque slot per chunk
//   word      = clickable letter run inside a chunk ("Stern“—so" holds 2 words)

import { parseMarkup, type Run } from './markup';

export interface Word {
  start: number;
  end: number;
  text: string;
  chunk: number;
  letters: boolean; // false for pure numbers (verse numbers etc.): not clickable
}
export interface Chunk {
  start: number;
  end: number;
  para: number;
  w0: number; // words [w0, w1)
  w1: number;
}
export interface Para {
  start: number;
  end: number;
  c0: number; // chunks [c0, c1)
  c1: number;
  gap: number; // blank lines before this paragraph
}
export interface Doc {
  plain: string;
  runs: Run[];
  paras: Para[];
  chunks: Chunk[];
  words: Word[];
  rtl: boolean;
}

const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’ʼ׳״\-‐‑][\p{L}\p{M}\p{N}]+)*/gu;
const LETTER_RE = /\p{L}/u;

export function buildDoc(content: string, rtl?: boolean): Doc {
  const { plain, runs } = parseMarkup(content.replace(/\r\n?/g, '\n'));
  const paras: Para[] = [];
  const chunks: Chunk[] = [];
  const words: Word[] = [];

  let gap = 0;
  let paraStart = -1;
  let paraEnd = -1;
  const flush = () => {
    if (paraStart < 0) return;
    const p: Para = { start: paraStart, end: paraEnd, c0: chunks.length, c1: chunks.length, gap };
    const pi = paras.length;
    for (const m of plain.slice(paraStart, paraEnd).matchAll(/\S+/g)) {
      const cs = paraStart + m.index!;
      const c: Chunk = { start: cs, end: cs + m[0].length, para: pi, w0: words.length, w1: words.length };
      for (const w of m[0].matchAll(WORD_RE)) {
        const ws = cs + w.index!;
        words.push({ start: ws, end: ws + w[0].length, text: w[0], chunk: chunks.length, letters: LETTER_RE.test(w[0]) });
      }
      c.w1 = words.length;
      chunks.push(c);
    }
    p.c1 = chunks.length;
    paras.push(p);
    paraStart = -1;
    gap = 0;
  };

  let at = 0;
  for (const line of plain.split('\n')) {
    const end = at + line.length;
    if (line.trim() === '') {
      flush();
      if (paras.length) gap++;
    } else {
      if (paraStart < 0) paraStart = at;
      paraEnd = end;
    }
    at = end + 1;
  }
  flush();

  return { plain, runs, paras, chunks, words, rtl: rtl ?? detectRtl(plain) };
}

export function detectRtl(text: string): boolean {
  const sample = text.slice(0, 4000);
  const rtl = (sample.match(/[֐-ࣿיִ-﷿ﹰ-﻿]/g) || []).length;
  const ltr = (sample.match(/[A-Za-zÀ-ɏͰ-Ͽἀ-῿Ѐ-ӿ]/g) || []).length;
  return rtl > ltr;
}

/** Index of the item whose [start,end) contains offset, else the nearest following one (or -1). */
function search<T extends { start: number; end: number }>(items: T[], offset: number): number {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].end <= offset) lo = mid + 1;
    else if (items[mid].start > offset) hi = mid - 1;
    else return mid;
  }
  return lo < items.length ? lo : -1;
}
export const wordAtOrAfter = (doc: Doc, offset: number) => search(doc.words, offset);
export const chunkAtOrAfter = (doc: Doc, offset: number) => search(doc.chunks, offset);
export function wordAt(doc: Doc, offset: number): number {
  const i = search(doc.words, offset);
  return i >= 0 && doc.words[i].start <= offset ? i : -1;
}

/** Normalized key for matching words across texts of one language. */
export const wordKey = (w: string) => w.normalize('NFC').toLowerCase();

/** Normalized key for exact passage matching (case- and whitespace-insensitive). */
export const passageKey = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Finds `needle` in `hay` ignoring whitespace differences and case; returns
 * offsets into `hay`. Used to anchor passages saved as plain strings.
 */
export function findLoose(hay: string, needle: string, from = 0): { start: number; end: number } | null {
  const target = passageKey(needle);
  if (!target) return null;
  // Build a collapsed copy of hay with an index map back to the original.
  let collapsed = '';
  const map: number[] = [];
  let prevSpace = true;
  for (let i = from; i < hay.length; i++) {
    const ch = hay[i];
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        collapsed += ' ';
        map.push(i);
      }
      prevSpace = true;
    } else {
      collapsed += ch;
      map.push(i);
      prevSpace = false;
    }
  }
  const folded = collapsed.normalize('NFC').toLowerCase();
  const idx = folded.indexOf(target);
  // NFC/lowercase can change lengths in rare scripts; fall back to exact search then.
  if (idx < 0 || folded.length !== collapsed.length) {
    const j = hay.indexOf(needle.trim(), from);
    return j < 0 ? null : { start: j, end: j + needle.trim().length };
  }
  return { start: map[idx], end: map[idx + target.length - 1] + 1 };
}

/** Plain text of [start,end) with whitespace preserved (what copy/queries use). */
export const slice = (doc: Doc, start: number, end: number) => doc.plain.slice(start, end);
