// Derived lookups over the store, memoized on record-map identity.

import { buildDoc, passageKey, wordKey, type Doc } from '../text/document';
import type { Id, Language, Prompt, PromptKind, Text, Translation } from '../model/types';
import { alive, getRec, useStore } from './store';

export interface Target {
  kind: 'word' | 'passage';
  textId: Id;
  lang: Id;
  text: string; // original-language word or passage
  anchor?: [number, number]; // plain offsets of this occurrence
  sentence?: string;
}

export const targetKey = (t: Pick<Target, 'kind' | 'textId' | 'lang' | 'text'>) =>
  t.kind === 'word' ? `w|${t.lang}|${wordKey(t.text)}` : `p|${t.textId}|${passageKey(t.text)}`;

interface Index {
  src: Record<Id, Translation> | null;
  byKey: Map<string, Translation[]>;
  byText: Map<Id, Translation[]>;
}
let index: Index = { src: null, byKey: new Map(), byText: new Map() };

/** Word translations are shared by all texts of a language; passages belong to one text. */
export function translationIndex(map: Record<Id, Translation> = useStore.getState().translations): Index {
  if (index.src === map) return index;
  const byKey = new Map<string, Translation[]>();
  const byText = new Map<Id, Translation[]>();
  for (const t of alive(map)) {
    const k = targetKey({ ...t, text: t.target });
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(t);
    if (!byText.has(t.textId)) byText.set(t.textId, []);
    byText.get(t.textId)!.push(t);
  }
  for (const list of byKey.values()) list.sort((a, b) => b.createdAt - a.createdAt);
  index = { src: map, byKey, byText };
  return index;
}

/** Saved versions for a target, newest first; exact-case matches of a word come first. */
export function versionsFor(t: Pick<Target, 'kind' | 'textId' | 'lang' | 'text'>, map?: Record<Id, Translation>): Translation[] {
  const list = translationIndex(map).byKey.get(targetKey(t)) ?? [];
  if (t.kind !== 'word') return list;
  const exact = list.filter((x) => x.target === t.text);
  return exact.length && exact.length < list.length ? [...exact, ...list.filter((x) => x.target !== t.text)] : list;
}

// ---- documents (parsing is memoized per content string)
const docCache = new Map<string, Doc>();
export function docFor(text: Pick<Text, 'content' | 'lang'>): Doc {
  const lang = getRec('langs', text.lang);
  const key = `${lang?.rtl ? 1 : 0}|${text.content}`;
  let d = docCache.get(key);
  if (!d) {
    d = buildDoc(text.content, lang?.rtl);
    if (docCache.size > 40) docCache.delete(docCache.keys().next().value!);
    docCache.set(key, d);
  }
  return d;
}

export const langName = (id: Id | undefined): string => (id && getRec('langs', id)?.name) || '';

export function promptsFor(kind: PromptKind, lang: Id, prompts: Record<Id, Prompt>): Prompt[] {
  return alive(prompts)
    .filter((p) => p.kind === kind && (!p.lang || p.lang === lang))
    .sort((a, b) => Number(!!b.lang) - Number(!!a.lang) || a.name.localeCompare(b.name));
}

/** The prompt a lookup uses unless the user picks another one. */
export function defaultPrompt(kind: PromptKind, text: Text | undefined, lang: Id): Prompt | undefined {
  const s = useStore.getState();
  const preferred = kind === 'word' ? text?.wordPromptId : kind === 'passage' ? text?.passagePromptId : undefined;
  return getRec('prompts', preferred) ?? promptsFor(kind, lang, s.prompts)[0];
}

export const languages = (): Language[] => alive(useStore.getState().langs).sort((a, b) => a.name.localeCompare(b.name));

/** The sentence around [start,end) for the {sentence} placeholder. */
export function sentenceAround(doc: Doc, start: number, end: number): string {
  const p = doc.paras.find((x) => x.start <= start && x.end >= end);
  if (!p) return doc.plain.slice(start, end);
  const text = doc.plain.slice(p.start, p.end);
  const rel = start - p.start;
  const relEnd = end - p.start;
  const re = /[.!?;…׃;](?=\s|$)|\n/g;
  let from = 0;
  let to = text.length;
  for (const m of text.matchAll(re)) {
    const at = m.index! + 1;
    if (at <= rel) from = at;
    else if (at >= relEnd) {
      to = at;
      break;
    }
  }
  return text.slice(from, to).replace(/\s+/g, ' ').trim();
}
