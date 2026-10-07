// Everything the reader needs for one text, memoized on the store records it uses.

import { useEffect, useMemo } from 'react';
import { docSig, realign } from '../calque/align';
import { findComposites, type Composite } from '../calque/composites';
import { docFor, translationIndex } from '../data/selectors';
import { getRec, patch, useStore } from '../data/store';
import type { Calque, Language, Reading, Text } from '../model/types';
import { findLoose, passageKey, wordKey, type Doc } from '../text/document';

export interface PassageMark {
  key: string;
  start: number;
  end: number;
  id: string; // newest translation id
  count: number;
}

export interface Replacement {
  c0: number; // chunk range [c0, c1]
  c1: number;
  text: string;
}

export interface ReaderData {
  text: Text;
  doc: Doc;
  lang?: Language;
  calque?: Calque;
  slots: string[] | null;
  comps: Map<number, Composite>;
  reading?: Reading;
  keep: Set<number>; // chunk indices kept in the original
  replace: Replacement[];
  known: Set<string>; // word keys with saved translations in this language
  passages: PassageMark[];
}

export function useReader(textId: string): ReaderData | null {
  const text = useStore((s) => s.texts[textId]);
  const langs = useStore((s) => s.langs);
  const calques = useStore((s) => s.calques);
  const reading = useStore((s) => s.readings[textId]);
  const translations = useStore((s) => s.translations);

  const doc = useMemo(() => (text && !text.deleted ? docFor(text) : null), [text, langs]);
  const calque = text?.calqueId ? calques[text.calqueId] : undefined;
  const liveCalque = calque && !calque.deleted ? calque : undefined;

  const slots = useMemo(() => {
    if (!doc || !liveCalque) return null;
    return liveCalque.sig === docSig(doc) ? liveCalque.slots : realign(doc, liveCalque.slots).slots;
  }, [doc, liveCalque]);

  // Persist a re-alignment after the text was edited.
  useEffect(() => {
    if (doc && liveCalque && slots && liveCalque.sig !== docSig(doc)) patch('calques', liveCalque.id, { slots, sig: docSig(doc) });
  }, [doc, liveCalque, slots]);

  const comps = useMemo(() => (doc && slots ? findComposites(doc, slots) : new Map<number, Composite>()), [doc, slots]);

  const keep = useMemo(() => {
    const out = new Set<number>();
    if (!doc || !reading) return out;
    const starts = new Set(reading.keep ?? []);
    const words = new Set(reading.keepWords ?? []);
    doc.chunks.forEach((c, i) => {
      if (starts.has(c.start) || doc.words.slice(c.w0, c.w1).some((w) => words.has(wordKey(w.text)))) out.add(i);
    });
    return out;
  }, [doc, reading]);

  const replace = useMemo(() => {
    if (!doc || !reading?.replace) return [];
    const out: Replacement[] = [];
    for (const r of reading.replace) {
      const c0 = doc.chunks.findIndex((c) => c.end > r.start);
      let c1 = c0;
      while (c1 + 1 < doc.chunks.length && doc.chunks[c1 + 1].start < r.end) c1++;
      if (c0 >= 0 && doc.chunks[c0].para === doc.chunks[c1].para) out.push({ c0, c1, text: r.text });
    }
    return out;
  }, [doc, reading]);

  const known = useMemo(() => {
    const out = new Set<string>();
    if (!text) return out;
    const prefix = `w|${text.lang}|`;
    for (const k of translationIndex(translations).byKey.keys()) if (k.startsWith(prefix)) out.add(k.slice(prefix.length));
    return out;
  }, [translations, text?.lang]);

  const passages = useMemo(() => {
    if (!doc) return [];
    const byKey = new Map<string, PassageMark>();
    for (const t of translationIndex(translations).byText.get(textId) ?? []) {
      if (t.kind !== 'passage') continue;
      const key = passageKey(t.target);
      let range = t.anchor && passageKey(doc.plain.slice(t.anchor[0], t.anchor[1])) === key ? t.anchor : null;
      if (!range) {
        const f = findLoose(doc.plain, t.target);
        range = f ? [f.start, f.end] : null;
      }
      if (!range) continue;
      const cur = byKey.get(key);
      if (!cur) byKey.set(key, { key, start: range[0], end: range[1], id: t.id, count: 1 });
      else {
        cur.count++;
        if ((getRec('translations', cur.id)?.createdAt ?? 0) < t.createdAt) cur.id = t.id;
      }
    }
    return [...byKey.values()].sort((a, b) => a.start - b.start);
  }, [doc, translations, textId]);

  if (!text || text.deleted || !doc) return null;
  return { text, doc, lang: langs[text.lang], calque: liveCalque, slots, comps, reading, keep, replace, known, passages };
}
