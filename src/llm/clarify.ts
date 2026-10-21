// Clarifications: tiny model requests that refine what is guessed locally —
// the dictionary form of word forms (so every form of a word finds its
// translations) and the author/title of texts. Nothing runs unless asked:
// they are collected, then sent together when the reader presses Run, or in
// the background if Settings say so. With the Claude bridge they simply join
// the next batch.

import { useSettings } from '../app/settings';
import { toast } from '../app/ui';
import { docFor, langCode, langName } from '../data/selectors';
import { alive, getRec, patch, putMany, useStore } from '../data/store';
import type { Id, Lemma, Model, Text } from '../model/types';
import { germanStrongLemma, normalize } from '../text/forms';
import { useBridge } from './bridge';
import { activeModel } from './run';
import { onClarifyAnswer, runClarify } from './queries';

const CHUNK = 300; // forms per request
const META_CHUNK = 8; // texts per request

export interface ClarifyPlan {
  lemmas: { lang: Id; forms: string[] }[];
  meta: Text[];
  forms: number;
}

let memo: { t: unknown; tr: unknown; l: unknown; b: unknown; plan: ClarifyPlan } | null = null;
const inflight = new Set<string>(); // `${lang}|${form}` and text ids already asked about

/** Forms and texts in requests that have not been answered yet (also bridge requests from before a reload). */
function asked(): Set<string> {
  const out = new Set(inflight);
  for (const j of useBridge.getState().jobs) {
    const r = j.resume;
    if (r?.type !== 'clarify') continue;
    const d = r.data as { lang?: Id; forms?: string[]; ids?: Id[] };
    for (const f of d.forms ?? []) out.add(`${d.lang}|${f}`);
    for (const id of d.ids ?? []) out.add(id);
  }
  return out;
}

/** What is still unclear: word forms without a known dictionary form (in texts you study), texts without an author. */
export function pendingClarifications(): ClarifyPlan {
  const s = useStore.getState();
  const jobs = useBridge.getState().jobs;
  if (memo && memo.t === s.texts && memo.tr === s.translations && memo.l === s.lemmas && memo.b === jobs) return memo.plan;
  const busy = asked();
  const studied = new Set(alive(s.translations).map((t) => t.textId));
  const byLang = new Map<Id, Set<string>>();
  for (const t of alive(s.texts)) {
    if (t.scratch || !studied.has(t.id)) continue;
    const code = langCode(t.lang);
    if (!byLang.has(t.lang)) byLang.set(t.lang, new Set());
    const set = byLang.get(t.lang)!;
    for (const w of docFor(t).words) {
      if (!w.letters || w.text.length < 2 || /\d/.test(w.text)) continue;
      const f = normalize(w.text, code);
      if (s.lemmas[`${t.lang}|${f}`] || busy.has(`${t.lang}|${f}`)) continue;
      if (code.startsWith('de') && germanStrongLemma(f)) continue; // already known locally
      set.add(f);
    }
  }
  const lemmas = [...byLang].filter(([, f]) => f.size).map(([lang, f]) => ({ lang, forms: [...f].sort() }));
  const meta = alive(s.texts).filter((t) => !t.scratch && !t.metaChecked && !busy.has(t.id) && (!t.author || t.auto?.includes('author')));
  const plan = { lemmas, meta, forms: lemmas.reduce((n, l) => n + l.forms.length, 0) };
  memo = { t: s.texts, tr: s.translations, l: s.lemmas, b: jobs, plan };
  return plan;
}

/** A rough token count for the plan (shown before running). */
export const estimateTokens = (p: ClarifyPlan) => p.forms * 12 + p.meta.length * 260;

function clarifyModel(): Model | undefined {
  return getRec('models', useSettings.getState().clarifyModelId) ?? activeModel();
}

/** Starts every pending clarification; returns how many requests were sent. */
export function runClarifications(): number {
  const model = clarifyModel();
  if (!model) return 0;
  if (model.provider === 'web') {
    toast('Clarifications need an API model or Claude (your account), not a copy & paste chat site. Choose one in Settings.', 'error');
    return 0;
  }
  const plan = pendingClarifications();
  let n = 0;
  for (const { lang, forms } of plan.lemmas)
    for (let i = 0; i < forms.length; i += CHUNK) {
      const chunk = forms.slice(i, i + CHUNK);
      const name = langName(lang) || 'the source language';
      const prompt =
        `For each ${name} word form below (from literary and religious texts), give its dictionary form (lemma): infinitive for verbs, nominative singular for nouns, ` +
        `the base form for adjectives. Keep the original script and spelling style. A form that is its own lemma maps to itself.\n` +
        `Reply with only a JSON object {"form": "lemma", ...} covering every form.\n\n${chunk.join('\n')}`;
      if (runClarify('lemmas', `${name} word forms (${chunk.length})`, model, prompt, { lang, forms: chunk })) {
        n++;
        chunk.forEach((f) => inflight.add(`${lang}|${f}`));
      }
    }
  for (let i = 0; i < plan.meta.length; i += META_CHUNK) {
    const texts = plan.meta.slice(i, i + META_CHUNK);
    const prompt =
      'Identify each text below: the work it comes from, its author, and a short title for the excerpt. Use null where unknown; do not guess wildly.\n' +
      'Reply with only a JSON array [{"id": "...", "author": "...", "work": "...", "title": "..."}].\n\n' +
      texts.map((t) => `id: ${t.id}\ncurrent title: ${t.title}\n${docFor(t).plain.slice(0, 600)}`).join('\n\n---\n\n');
    if (runClarify('meta', `Authors and titles (${texts.length} texts)`, model, prompt, { ids: texts.map((t) => t.id) })) {
      n++;
      texts.forEach((t) => inflight.add(t.id));
    }
  }
  memo = null;
  return n;
}

/** The first JSON value in a model's answer. */
export function parseJsonLoose(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fence ? fence[1] : text;
  const a = body.search(/[[{]/);
  const b = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(body.slice(a, b + 1));
  } catch {
    return null;
  }
}

export function applyLemmas(data: { lang: Id; forms: string[] }, answer: string): number {
  const map = parseJsonLoose(answer);
  if (!map || typeof map !== 'object' || Array.isArray(map)) return 0;
  const code = langCode(data.lang);
  const got = new Map<string, string>();
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) if (typeof v === 'string' && v.trim()) got.set(normalize(k, code), v.trim());
  const now = Date.now();
  // every requested form gets a record, so it is not asked again (unanswered ones map to themselves)
  const recs: Lemma[] = data.forms.map((f) => ({ id: `${data.lang}|${f}`, lang: data.lang, form: f, lemma: got.get(f) ?? f, source: 'llm', updatedAt: now }));
  const existing = useStore.getState().lemmas;
  putMany(
    'lemmas',
    recs.filter((r) => !existing[r.id] || existing[r.id].deleted),
  );
  return got.size;
}

export function applyMeta(data: { ids: Id[] }, answer: string): number {
  const list = parseJsonLoose(answer);
  let n = 0;
  for (const id of data.ids) {
    const t = getRec('texts', id);
    if (!t) continue;
    const hit = Array.isArray(list) ? (list as Record<string, unknown>[]).find((x) => x && x.id === id) : undefined;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : undefined);
    const author = str(hit?.author);
    const title = str(hit?.title);
    const changes: Partial<Text> = { metaChecked: Date.now() };
    if (author && (!t.author || t.auto?.includes('author'))) changes.author = author;
    if (title && t.auto?.includes('title')) changes.title = title;
    if (changes.author || changes.title) n++;
    patch('texts', id, changes);
  }
  return n;
}

onClarifyAnswer('lemmas', (data, text) => applyLemmas(data as { lang: Id; forms: string[] }, text));
onClarifyAnswer('meta', (data, text) => applyMeta(data as { ids: Id[] }, text));

// ---- background mode

let timer: ReturnType<typeof setTimeout> | null = null;
/** In "automatic" mode: run what is pending a little after things change (never in a loop). */
export function startAutoClarify() {
  const check = () => {
    timer = null;
    if (useSettings.getState().clarify !== 'auto') return;
    const p = pendingClarifications();
    if (!p.forms && !p.meta.length) return;
    runClarifications();
  };
  const schedule = () => {
    if (useSettings.getState().clarify !== 'auto' || timer) return;
    timer = setTimeout(check, 20000);
  };
  useStore.subscribe((s, prev) => (s.texts !== prev.texts || s.translations !== prev.translations) && schedule());
  useSettings.subscribe(schedule);
  schedule();
}
