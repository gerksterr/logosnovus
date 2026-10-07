// The lexicon: every word looked up in a language, with a one-line gloss,
// the calque's word-for-word meaning and where the word occurs in your texts.

import { docSig } from '../calque/align';
import { parseSlot } from '../calque/notation';
import { docFor } from '../data/selectors';
import { alive } from '../data/store';
import type { Calque, Id, Text, Translation } from '../model/types';
import { wordKey } from '../text/document';

export interface Occurrence {
  textId: Id;
  start: number;
  end: number;
}

export interface Entry {
  key: string;
  word: string; // most frequent spelling looked up
  versions: Translation[]; // newest first
  last: number;
  occ: Occurrence[];
  calque?: string;
  gloss: string;
}

/** A one-line gloss from a markdown answer: an italic rendering in the title line, else the first line of prose. */
export function shortGloss(md: string): string {
  const lines = md.split('\n').map((l) => l.trim()).filter(Boolean);
  const clean = (s: string) =>
    s
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\$[^$]*\$/g, '')
      .replace(/^([-*+>]|\d+\.)\s+/, '')
      .replace(/[*_`#]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const cut = (s: string) => (s.length > 170 ? `${s.slice(0, 167).replace(/\s+\S*$/, '')}…` : s);
  const title = lines[0] ?? '';
  const ital = /[—–-]\s*\*{1,3}"?([^*]{3,90}?)"?\*{1,3}\s*$/.exec(title);
  if (ital) return cut(ital[1].trim());
  for (const l of lines) {
    if (/^#{1,6}\s/.test(l) || /^\|/.test(l) || /^[-*_]{3,}$/.test(l)) continue;
    const c = clean(l);
    if (c.length >= 3 && /\p{L}/u.test(c)) return cut(c);
  }
  return '';
}

const groupKey = (lang: Id, textsSrc: unknown) => ({ lang, textsSrc });
let concMemo: { k: ReturnType<typeof groupKey> | null; out: Map<string, Occurrence[]> } = { k: null, out: new Map() };

/** Every word of every text in the language, by word key. */
export function concordance(lang: Id, texts: Record<Id, Text>): Map<string, Occurrence[]> {
  if (concMemo.k && concMemo.k.lang === lang && concMemo.k.textsSrc === texts) return concMemo.out;
  const out = new Map<string, Occurrence[]>();
  for (const t of alive(texts)) {
    if (t.lang !== lang || t.scratch) continue;
    for (const w of docFor(t).words) {
      if (!w.letters) continue;
      const k = wordKey(w.text);
      let l = out.get(k);
      if (!l) out.set(k, (l = []));
      l.push({ textId: t.id, start: w.start, end: w.end });
    }
  }
  concMemo = { k: groupKey(lang, texts), out };
  return out;
}

let glossMemo: { lang: Id; t: unknown; c: unknown; out: Map<string, string> } | null = null;

/** Word-for-word meanings from the calques of the language's texts (first occurrence wins). */
export function calqueGlosses(lang: Id, texts: Record<Id, Text>, calques: Record<Id, Calque>): Map<string, string> {
  if (glossMemo && glossMemo.lang === lang && glossMemo.t === texts && glossMemo.c === calques) return glossMemo.out;
  const out = new Map<string, string>();
  for (const t of alive(texts)) {
    const cq = t.lang === lang && t.calqueId ? calques[t.calqueId] : undefined;
    if (!cq || cq.deleted) continue;
    const doc = docFor(t);
    if (cq.sig !== docSig(doc)) continue;
    doc.chunks.forEach((c, i) => {
      const words = doc.words.slice(c.w0, c.w1).filter((w) => w.letters);
      if (words.length !== 1 || !cq.slots[i]) return;
      const k = wordKey(words[0].text);
      if (out.has(k)) return;
      const slot = parseSlot(cq.slots[i], doc.plain.slice(c.start, c.end));
      const g = (slot.meaning ?? slot.gloss.plain).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (g) out.set(k, g);
    });
  }
  glossMemo = { lang, t: texts, c: calques, out };
  return out;
}

/** Lexicon entries for one language. */
export function entries(lang: Id, translations: Record<Id, Translation>, texts: Record<Id, Text>, calques: Record<Id, Calque>): Entry[] {
  const conc = concordance(lang, texts);
  const glosses = calqueGlosses(lang, texts, calques);
  const byKey = new Map<string, Translation[]>();
  for (const t of alive(translations)) {
    if (t.kind !== 'word' || t.lang !== lang) continue;
    const k = wordKey(t.target);
    let l = byKey.get(k);
    if (!l) byKey.set(k, (l = []));
    l.push(t);
  }
  const out: Entry[] = [];
  for (const [key, versions] of byKey) {
    versions.sort((a, b) => b.createdAt - a.createdAt);
    const spellings = new Map<string, number>();
    for (const v of versions) spellings.set(v.target, (spellings.get(v.target) ?? 0) + 1);
    const word = [...spellings].sort((a, b) => b[1] - a[1])[0][0];
    out.push({ key, word, versions, last: versions[0].createdAt, occ: conc.get(key) ?? [], calque: glosses.get(key), gloss: shortGloss(versions[0].content) });
  }
  return out;
}

/** Context around an occurrence for a keyword-in-context line. */
export function kwic(plain: string, o: Pick<Occurrence, 'start' | 'end'>, span = 60): { left: string; key: string; right: string } {
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  return {
    left: flat(plain.slice(Math.max(0, o.start - span), o.start)),
    key: plain.slice(o.start, o.end),
    right: flat(plain.slice(o.end, o.end + span)),
  };
}
