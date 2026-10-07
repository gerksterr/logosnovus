// Aligns raw calque output to the source text's chunks.
//
// LLMs rarely produce a perfect 1:1 token stream: they drop a lone dash, split
// "to-the" into "to the", glue "Stern“—so" differently, or skip a word. A
// greedy index walk then shifts every following word (the old app's "starts
// misaligning at nicht" bug). Instead we run a banded dynamic-programming
// alignment whose anchors are things a calque must preserve: trailing/leading
// punctuation, numbers, brackets, capitalization and line ends. One bad token
// becomes one local gap instead of a cascade.

import type { Doc } from '../text/document';
import { tokenizeCalque, glossText } from './notation';

export const Flag = {
  Ok: 0,
  Missing: 1, // no calque token for this chunk
  Joined: 2, // this chunk's token was merged into the previous chunk's slot
  Extra: 3, // an unmatched calque token was appended to this slot
  Merged: 4, // several calque tokens were joined into this slot
} as const;
export type Flag = (typeof Flag)[keyof typeof Flag];

export interface Alignment {
  slots: string[]; // one calque token (notation kept) per source chunk
  flags: Flag[];
  uncertain: number; // count of non-Ok flags
}

interface Feat {
  grams: Set<string>;
  skel: string; // every punctuation class in order, e.g. "Stern“—so" → "q-"
  lead: string;
  trail: string;
  digits: string;
  core: string;
  cap: boolean;
  punctOnly: boolean;
  lineEnd: boolean;
}

const CLASS: Record<string, string> = {
  '.': '.', '…': '.', '׃': '.', '!': '!', '?': '?', ';': ';', ';': '?', ',': ',', '،': ',',
  ':': ':', '·': ':', '·': ':', '—': '-', '–': '-', '-': '-', '‐': '-', '‑': '-', '־': '-',
  '(': '(', ')': ')', '[': '[', ']': ']', '{': '(', '}': ')',
};
const QUOTES = `"'“”„‟«»‹›‘’‚‛״׳\``;
const ALNUM = /[\p{L}\p{M}\p{N}]/u;

function classes(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = QUOTES.includes(ch) ? 'q' : CLASS[ch] ?? (/\s/.test(ch) ? '' : '*');
    if (c && out[out.length - 1] !== c) out += c;
  }
  return out;
}

function feat(text: string, lineEnd: boolean): Feat {
  const chars = [...text];
  let a = 0;
  let b = chars.length;
  while (a < b && !ALNUM.test(chars[a])) a++;
  while (b > a && !ALNUM.test(chars[b - 1])) b--;
  const core = chars.slice(a, b).join('');
  const firstLetter = core.match(/\p{L}/u)?.[0] ?? '';
  return {
    grams: bigrams(core.toLowerCase()),
    // hyphens/apostrophes between letters join words ("of-the", "sie’s", Hebrew maqaf); they are not punctuation
    skel: classes(text.replace(/[\p{L}\p{M}\p{N}]+(?:['’ʼ\-‐‑־][\p{L}\p{M}\p{N}]+)*/gu, ' ')),
    lead: classes(chars.slice(0, a).join('')),
    trail: classes(chars.slice(b).join('')),
    digits: (core.match(/\p{N}+/gu) || []).join(','),
    core: core.toLowerCase(),
    cap: !!firstLetter && firstLetter !== firstLetter.toLowerCase(),
    punctOnly: a === chars.length,
    lineEnd,
  };
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
function bigrams(s: string): Set<string> {
  const f = fold(s);
  const out = new Set<string>();
  for (let i = 0; i < f.length - 1; i++) out.add(f.slice(i, i + 2));
  return out;
}
/** Dice similarity of letter bigrams: a weak cognate signal (und/and, Mutter/mother). */
function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return (2 * n) / (a.size + b.size);
}

function punctCost(a: string, b: string, same: number, diff: number): number {
  if (a === b) return a ? -same : 0;
  if (a.replace(/;/g, '?') === b.replace(/;/g, '?')) return -same * 0.8; // Greek ; = ?
  if (a.replace(/q/g, '') === b.replace(/q/g, '')) return 0.1; // only quoting differs
  return a && b ? diff * 0.8 : diff;
}

function matchCost(s: Feat, c: Feat, lines: boolean): number {
  let x = 0.35;
  x += punctCost(s.skel, c.skel, 0.35, 0.6);
  if (s.skel && s.skel === c.skel && (s.trail !== c.trail || s.lead !== c.lead)) x += 0.15; // same signs, other places
  if (s.digits || c.digits) x += s.digits === c.digits ? -0.4 : 0.9;
  if (s.punctOnly !== c.punctOnly) x += 0.7;
  if (s.core && s.core === c.core) x -= 0.15;
  else x -= 0.15 * dice(s.grams, c.grams);
  if (c.cap && !s.cap) x += 0.15;
  x += 0.08 * Math.abs(Math.log((s.core.length + 2) / (c.core.length + 2)));
  if (lines) x += s.lineEnd && c.lineEnd ? -0.2 : s.lineEnd !== c.lineEnd ? 0.12 : 0;
  return x;
}

// Operations: [di, dj]
const OPS: [number, number][] = [
  [0, 0],
  [1, 1], // 1 match
  [1, 2], // 2 two calque tokens → one chunk
  [1, 3], // 3 three calque tokens → one chunk
  [2, 1], // 4 two chunks share one calque token
  [1, 0], // 5 chunk without token
  [0, 1], // 6 token without chunk
];

/** Core banded DP. Returns, per source item, the indices of calque tokens it receives. */
function alignSeq(src: string[], srcEnd: boolean[], cal: string[], calEnd: boolean[], lines: boolean) {
  const n = src.length;
  const m = cal.length;
  const sf = src.map((t, i) => feat(t, srcEnd[i]));
  const gl = cal.map((t) => glossText(t));
  const cf = gl.map((t, j) => feat(t, calEnd[j]));
  // Features of joined neighbours are precomputed once (the DP visits each many times).
  const joinS = src.map((t, i) => (i + 1 < n ? feat(t + ' ' + src[i + 1], srcEnd[i + 1]) : sf[i]));
  const joinC = [2, 3].map((k) => gl.map((_, j) => (j + k <= m ? feat(gl.slice(j, j + k).join(' '), calEnd[j + k - 1]) : cf[j])));
  // "des Zweiges" → "of the branch": an English article ends a merged group ("of the"), it rarely starts one.
  const bias = gl.map((t) => (/^(the|a|an)$/i.test(t) ? -0.06 : 0));

  const B = Math.min(Math.max(n, m), Math.max(60, Math.abs(n - m) + 40));
  const W = 2 * B + 1;
  const lo = (i: number) => Math.max(0, Math.round((i * m) / Math.max(n, 1)) - B);
  const rows = [new Float64Array(W), new Float64Array(W), new Float64Array(W)];
  const bp = new Uint8Array((n + 1) * W);
  const get = (i: number, j: number) => {
    if (i < 0 || j < 0) return Infinity;
    const k = j - lo(i);
    return k < 0 || k >= W || j > m ? Infinity : rows[i % 3][k];
  };

  for (let i = 0; i <= n; i++) {
    const row = rows[i % 3];
    row.fill(Infinity);
    const l = lo(i);
    for (let j = l; j <= Math.min(m, l + W - 1); j++) {
      if (i === 0 && j === 0) {
        row[0 - l] = 0;
        continue;
      }
      let best = Infinity;
      let op = 0;
      const tryOp = (o: number, cost: number) => {
        if (cost < best) {
          best = cost;
          op = o;
        }
      };
      if (i >= 1 && j >= 1) tryOp(1, get(i - 1, j - 1) + matchCost(sf[i - 1], cf[j - 1], lines));
      if (i >= 1 && j >= 2) tryOp(2, get(i - 1, j - 2) + matchCost(sf[i - 1], joinC[0][j - 2], lines) + 0.45 + bias[j - 1]);
      if (i >= 1 && j >= 3) tryOp(3, get(i - 1, j - 3) + matchCost(sf[i - 1], joinC[1][j - 3], lines) + 0.9 + bias[j - 1]);
      if (i >= 2 && j >= 1) tryOp(4, get(i - 2, j - 1) + matchCost(joinS[i - 2], cf[j - 1], lines) + 0.5);
      if (i >= 1) tryOp(5, get(i - 1, j) + (sf[i - 1].punctOnly ? 0.25 : 0.9));
      if (j >= 1) tryOp(6, get(i, j - 1) + (cf[j - 1].punctOnly ? 0.2 : 0.9));
      row[j - l] = best;
      bp[i * W + (j - l)] = op;
    }
  }

  // Traceback
  const take: number[][] = Array.from({ length: n }, () => []);
  const flags: Flag[] = new Array(n).fill(Flag.Ok);
  const extras: number[][] = Array.from({ length: n + 1 }, () => []); // tokens to attach before chunk i
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const k = j - lo(i);
    const op = k >= 0 && k < W ? bp[i * W + k] : 0;
    if (!op) break; // unreachable with sane bands; leaves remaining slots empty
    const [di, dj] = OPS[op];
    if (op === 1) take[i - 1].push(j - 1);
    else if (op === 2 || op === 3) {
      for (let t = j - dj; t < j; t++) take[i - 1].push(t);
      flags[i - 1] = Flag.Merged;
    } else if (op === 4) {
      take[i - 2].push(j - 1);
      flags[i - 1] = Flag.Joined;
    } else if (op === 5) {
      if (!sf[i - 1].punctOnly) flags[i - 1] = Flag.Missing;
    } else if (op === 6) extras[i].unshift(j - 1);
    i -= di;
    j -= dj;
  }
  return { take, flags, extras, sf, cf };
}

function chunkLines(doc: Doc): number[] {
  // index of the non-blank line each chunk sits on
  const lineOf: number[] = [];
  let line = -1;
  let prevEnd = -1;
  for (const c of doc.chunks) {
    const between = prevEnd < 0 ? doc.plain.slice(0, c.start) : doc.plain.slice(prevEnd, c.start);
    if (prevEnd < 0 || between.includes('\n')) line++;
    lineOf.push(line);
    prevEnd = c.end;
  }
  return lineOf;
}

export function alignCalque(doc: Doc, raw: string): Alignment {
  const n = doc.chunks.length;
  const src = doc.chunks.map((c) => doc.plain.slice(c.start, c.end));
  const lineOf = chunkLines(doc);
  const srcEnd = lineOf.map((l, i) => lineOf[i + 1] !== l);
  const toks = tokenizeCalque(raw);
  const srcLines = n ? lineOf[n - 1] + 1 : 0;
  const calLines = toks.length ? toks[toks.length - 1].line + 1 : 0;

  const slots: string[] = new Array(n).fill('');
  const flags: Flag[] = new Array(n).fill(Flag.Ok);

  const run = (si: number[], ti: number[], lines: boolean) => {
    const r = alignSeq(
      si.map((i) => src[i]),
      si.map((i) => srcEnd[i]),
      ti.map((j) => toks[j].text),
      ti.map((j) => toks[j].lineEnd),
      lines,
    );
    si.forEach((ci, k) => {
      const parts = r.take[k].map((t) => toks[ti[t]].text);
      if (!parts.length && r.sf[k].punctOnly) parts.push(src[ci]); // dropped dash/quote: show the source sign
      slots[ci] = parts.join(' ');
      flags[ci] = r.flags[k];
    });
    // Unmatched calque tokens: punctuation glues onto the previous slot, words are appended with a space.
    r.extras.forEach((list, k) => {
      for (const t of list) {
        const text = toks[ti[t]].text;
        const target = k > 0 ? si[k - 1] : si[0];
        if (target === undefined) continue;
        const punct = r.cf[t].punctOnly;
        slots[target] = k > 0 ? slots[target] + (punct ? '' : ' ') + text : text + (punct ? '' : ' ') + slots[target];
        if (!punct) flags[target] = Flag.Extra;
      }
    });
  };

  if (srcLines === calLines && srcLines > 0) {
    const bySrc: number[][] = Array.from({ length: srcLines }, () => []);
    lineOf.forEach((l, i) => bySrc[l].push(i));
    const byTok: number[][] = Array.from({ length: calLines }, () => []);
    toks.forEach((t, j) => byTok[t.line].push(j));
    for (let l = 0; l < srcLines; l++) run(bySrc[l], byTok[l], false);
  } else {
    run(
      src.map((_, i) => i),
      toks.map((_, j) => j),
      true,
    );
  }
  return { slots, flags, uncertain: flags.filter((f) => f !== Flag.Ok).length };
}

/** Re-aligns previously stored slots after the source text was edited. */
export function realign(doc: Doc, slots: string[]): Alignment {
  return alignCalque(doc, slots.filter(Boolean).join(' '));
}

/** Calque as plain text laid out like the source (for export / "edit as text"). */
export function slotsToText(doc: Doc, slots: string[]): string {
  let out = '';
  let prev = 0;
  doc.chunks.forEach((c, i) => {
    out += doc.plain.slice(prev, c.start).replace(/[^\n]+/g, ' ');
    out += slots[i] || doc.plain.slice(c.start, c.end);
    prev = c.end;
  });
  return out + doc.plain.slice(prev).replace(/[^\n]+/g, '');
}

/** Fingerprint of the source chunks; a stored calque is re-aligned when it changes. */
export function docSig(doc: Doc): string {
  let h = 0x811c9dc5;
  for (const c of doc.chunks) {
    for (let i = c.start; i < c.end; i++) h = Math.imul(h ^ doc.plain.charCodeAt(i), 0x01000193);
    h = Math.imul(h ^ 32, 0x01000193);
  }
  return `${doc.chunks.length}:${(h >>> 0).toString(36)}`;
}
