// Composite groups (separable verbs, tmesis): "es zeichnet sie aus" →
// "it draws[1:distinguishes] them out[1]". Group numbers restart per sentence,
// so the same [1] in two sentences of one paragraph are different groups.

import type { Doc } from '../text/document';
import { parseSlot } from './notation';

export interface Composite {
  gid: number; // unique within the document
  label: string; // number as written in the calque
  part: number; // 0 = head
  size: number;
  meaning: string;
  members: number[]; // chunk indices in reading order
}

const ABBR = new Set(['z.b.', 'd.h.', 'u.a.', 'bzw.', 'usw.', 'vgl.', 'ca.', 'etc.', 'dr.', 'st.', 'nr.', 's.', 'v.', 'vv.', 'cf.', 'ff.']);
const END_RE = /[.!?;…׃;][\p{Pf}\p{Pe}"'“”„«»‹›‘’]*$/u;

export function endsSentence(chunk: string): boolean {
  if (!END_RE.test(chunk)) return false;
  const core = chunk.replace(/[^\p{L}\p{N}.]/gu, '').toLowerCase();
  if (/^\p{N}+\.$/u.test(core)) return false; // "1." ordinals, verse numbers
  if (/^\p{L}\.$/u.test(core) && core !== 'a.') return false; // initials
  return !ABBR.has(core);
}

/** Sentence number for every chunk (paragraph breaks also end sentences). */
export function sentenceOf(doc: Doc): number[] {
  const out: number[] = [];
  let s = 0;
  let para = 0;
  doc.chunks.forEach((c, i) => {
    if (c.para !== para) {
      para = c.para;
      if (i > 0 && !endsSentence(doc.plain.slice(doc.chunks[i - 1].start, doc.chunks[i - 1].end))) s++;
    }
    out.push(s);
    if (endsSentence(doc.plain.slice(c.start, c.end))) s++;
  });
  return out;
}

interface Group {
  label: string;
  sentence: number;
  para: number;
  meaning?: string;
  members: number[];
}

export function findComposites(doc: Doc, slots: string[]): Map<number, Composite> {
  const sent = sentenceOf(doc);
  const groups: Group[] = [];
  const open = new Map<string, Group>();
  doc.chunks.forEach((c, i) => {
    const raw = slots[i];
    if (!raw || !raw.includes('[')) return;
    const slot = parseSlot(raw, doc.plain.slice(c.start, c.end));
    if (!slot.tag) return;
    const key = `${sent[i]}:${slot.tag}`;
    let g = open.get(key);
    if (!g || (slot.meaning && g.meaning)) {
      g = { label: slot.tag, sentence: sent[i], para: c.para, meaning: slot.meaning, members: [] };
      groups.push(g);
      open.set(key, g);
    }
    if (slot.meaning && !g.meaning) g.meaning = slot.meaning;
    g.members.push(i);
  });

  // A lone part whose head was put in a neighbouring sentence (e.g. a misread
  // abbreviation ended the sentence early) joins the nearest headed group.
  for (const g of groups) {
    if (g.members.length !== 1 || g.meaning) continue;
    let best: Group | undefined;
    let dist = Infinity;
    for (const h of groups) {
      if (h === g || h.para !== g.para || h.label !== g.label || !h.meaning) continue;
      const d = Math.abs(h.members[0] - g.members[0]);
      if (d < dist) {
        dist = d;
        best = h;
      }
    }
    if (best) {
      best.members.push(...g.members);
      best.members.sort((a, b) => a - b);
      g.members = [];
    }
  }

  const out = new Map<number, Composite>();
  let gid = 0;
  for (const g of groups) {
    if (!g.members.length || (g.members.length < 2 && !g.meaning)) continue;
    gid++;
    const meaning =
      g.meaning ||
      g.members.map((i) => parseSlot(slots[i], doc.plain.slice(doc.chunks[i].start, doc.chunks[i].end)).gloss.plain).join(' ');
    g.members.forEach((ci, part) =>
      out.set(ci, { gid, label: g.label, part, size: g.members.length, meaning, members: g.members }),
    );
  }
  return out;
}

/** "zeichnet ... aus" (gap between parts) or "zeichnet aus" (adjacent). */
export function compositeQuery(doc: Doc, comp: Composite): string {
  let out = '';
  comp.members.forEach((ci, k) => {
    const c = doc.chunks[ci];
    const w = doc.words.slice(c.w0, c.w1).find((x) => x.letters);
    const text = w ? w.text : doc.plain.slice(c.start, c.end);
    if (k > 0) out += ci - comp.members[k - 1] > 1 ? ' ... ' : ' ';
    out += text;
  });
  return out;
}
