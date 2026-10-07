// Running LLM requests. Several can run at once; the dock lists them until
// they are seen. A request for a target that is already running is joined,
// never duplicated. Results are saved the moment they complete.

import { create } from 'zustand';
import { alignCalque, docSig } from '../calque/align';
import { defaultPrompt, docFor, langName, sentenceAround, targetKey, type Target } from '../data/selectors';
import { getRec, patch, put, uid, useStore } from '../data/store';
import type { ChatMsg, Model, Prompt, Text, Translation } from '../model/types';
import { activeModel, fillPrompt, modelLabel, runModel, type RunResult } from './run';
import type { Turn } from './request';

export type QueryKind = 'word' | 'passage' | 'chat' | 'calque';

export interface Query {
  id: string;
  key: string;
  kind: QueryKind;
  title: string;
  status: 'running' | 'done' | 'error' | 'stopped';
  content: string;
  reasoning: string;
  error?: string;
  startedAt: number;
  firstTokenMs?: number;
  seen: boolean;
  resultId?: string; // saved translation / calque id
  target?: Target;
  textId?: string; // calque requests
  model: string;
  request?: { url: string; body: string };
  events?: string[];
}

export const useQueries = create<{ queries: Query[] }>(() => ({ queries: [] }));
const controllers = new Map<string, AbortController>();

const update = (id: string, changes: Partial<Query>) =>
  useQueries.setState((s) => ({ queries: s.queries.map((q) => (q.id === id ? { ...q, ...changes } : q)) }));
export const getQuery = (id: string) => useQueries.getState().queries.find((q) => q.id === id);
export const runningFor = (key: string) => useQueries.getState().queries.find((q) => q.key === key && q.status === 'running');

/** Streams into the query, batching UI updates to ~16/s. */
async function execute(q: Query, model: Model, turns: Turn[], bodyOverride?: string): Promise<RunResult | null> {
  const ctl = new AbortController();
  controllers.set(q.id, ctl);
  let content = '';
  let reasoning = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flushNow = () => {
    timer = null;
    update(q.id, { content, reasoning });
  };
  try {
    const r = await runModel(
      model,
      turns,
      ctl.signal,
      (d) => {
        if (d.text) content += d.text;
        if (d.reasoning) reasoning += d.reasoning;
        timer ??= setTimeout(flushNow, 60);
      },
      bodyOverride,
    );
    if (timer) clearTimeout(timer);
    update(q.id, { content: r.content, reasoning: r.reasoning, firstTokenMs: r.firstTokenMs, request: r.request, events: r.events });
    return r;
  } catch (e) {
    if (timer) clearTimeout(timer);
    const stopped = ctl.signal.aborted;
    update(q.id, { content, reasoning, status: stopped ? 'stopped' : 'error', error: stopped ? undefined : (e as Error).message });
    return null;
  } finally {
    controllers.delete(q.id);
  }
}

function addQuery(q: Omit<Query, 'id' | 'status' | 'content' | 'reasoning' | 'startedAt' | 'seen'>): Query {
  const full: Query = { ...q, id: uid('q'), status: 'running', content: '', reasoning: '', startedAt: Date.now(), seen: false };
  useQueries.setState((s) => ({ queries: [...s.queries.filter((x) => !(x.key === q.key && x.status !== 'running')), full] }));
  return full;
}

export function stopQuery(id: string) {
  controllers.get(id)?.abort();
}
export function dismissQuery(id: string) {
  stopQuery(id);
  useQueries.setState((s) => ({ queries: s.queries.filter((q) => q.id !== id) }));
}
/** Viewing a finished query clears it from the dock. */
export function markSeen(id: string) {
  const q = getQuery(id);
  if (q && q.status !== 'running' && !q.seen) update(id, { seen: true });
}

// ---------------------------------------------------------------- lookups

export interface LookupPlan {
  prompt?: Prompt;
  model?: Model;
  text: string; // filled prompt
}

export function planLookup(target: Target, promptId?: string, modelId?: string): LookupPlan {
  const textRec = getRec('texts', target.textId);
  const prompt = getRec('prompts', promptId) ?? defaultPrompt(target.kind, textRec, target.lang);
  const model = getRec('models', modelId) ?? activeModel();
  const doc = textRec ? docFor(textRec) : null;
  const sentence = target.sentence ?? (doc && target.anchor ? sentenceAround(doc, target.anchor[0], target.anchor[1]) : undefined);
  const text = fillPrompt(prompt?.template ?? (target.kind === 'word' ? 'Explain the word: {word}' : 'Interpret this passage: {text}'), {
    word: target.text,
    text: target.text,
    sentence,
    language: langName(target.lang),
    title: textRec?.title,
    author: textRec?.author,
  });
  return { prompt, model, text };
}

/** Starts (or joins) a lookup. Web-chat models return null: the sheet handles copy & paste. */
export function startLookup(target: Target, opts: { promptId?: string; modelId?: string; promptText?: string; body?: string } = {}): string | null {
  const key = targetKey(target);
  const running = runningFor(key);
  if (running) return running.id;
  const plan = planLookup(target, opts.promptId, opts.modelId);
  const model = plan.model;
  if (!model || model.provider === 'web') return null;
  const promptText = opts.promptText ?? plan.text;
  const turns: Turn[] = [...(plan.prompt?.system ? [{ role: 'system' as const, content: plan.prompt.system }] : []), { role: 'user', content: promptText }];
  const q = addQuery({ key, kind: target.kind, title: target.text, target, model: modelLabel(model) });
  void execute(q, model, turns, opts.body).then((r) => {
    if (!r) return;
    const saved = saveTranslation(target, {
      prompt: promptText,
      promptName: plan.prompt?.name,
      model: model.model,
      servedBy: r.servedBy,
      provider: model.provider,
      content: r.content,
      reasoning: r.reasoning || undefined,
    });
    update(q.id, { status: 'done', resultId: saved.id });
  });
  return q.id;
}

export function saveTranslation(target: Target, fields: Pick<Translation, 'prompt' | 'content'> & Partial<Translation>): Translation {
  const now = Date.now();
  return put('translations', {
    id: uid('tr'),
    kind: target.kind,
    lang: target.lang,
    textId: target.textId,
    target: target.text,
    anchor: target.kind === 'passage' ? target.anchor : undefined,
    createdAt: now,
    updatedAt: now,
    ...fields,
  });
}

// ---------------------------------------------------------------- chat about a translation

export function chatTurns(tr: { prompt: string; content: string; chat?: ChatMsg[] }, message: string): Turn[] {
  return [
    { role: 'user', content: tr.prompt },
    { role: 'assistant', content: tr.content },
    ...(tr.chat ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];
}

export function startChat(kind: 'translations' | 'calques', id: string, message: string, modelId?: string): string | null {
  const key = `chat|${id}`;
  if (runningFor(key)) return null;
  const rec = getRec(kind, id);
  const model = getRec('models', modelId) ?? activeModel();
  if (!rec || !model || model.provider === 'web') return null;
  const base =
    kind === 'translations'
      ? (rec as Translation)
      : { prompt: 'Here is a word-for-word calque of a text.', content: (rec as { slots: string[] }).slots.join(' '), chat: rec.chat };
  const turns = chatTurns(base, message);
  const userMsg: ChatMsg = { role: 'user', content: message, at: Date.now() };
  patch(kind, id, { chat: [...(rec.chat ?? []), userMsg] } as never);
  const q = addQuery({ key, kind: 'chat', title: message.slice(0, 60), model: modelLabel(model) });
  void execute(q, model, turns).then((r) => {
    const cur = getRec(kind, id);
    if (r && cur) patch(kind, id, { chat: [...(cur.chat ?? []), { role: 'assistant', content: r.content, at: Date.now(), model: r.servedBy ?? model.model }] } as never);
    update(q.id, { status: r ? 'done' : getQuery(q.id)?.status ?? 'error' });
    if (r) dismissQuery(q.id);
  });
  return q.id;
}

// ---------------------------------------------------------------- calques

export function calquePromptText(text: Text, prompt: Prompt | undefined): string {
  return fillPrompt(prompt?.template ?? '{text}', { text: text.content, language: langName(text.lang), title: text.title, author: text.author });
}

/** Aligns raw calque output to the text and stores it as the active calque. */
export function saveCalque(text: Text, raw: string, extra: { source: 'ai' | 'import' | 'web' | 'edit'; model?: string; promptName?: string }) {
  const doc = docFor(text);
  const a = alignCalque(doc, raw);
  const now = Date.now();
  const c = put('calques', { id: uid('cq'), textId: text.id, createdAt: now, updatedAt: now, slots: a.slots, sig: docSig(doc), raw, ...extra });
  patch('texts', text.id, { calqueId: c.id });
  return { calque: c, uncertain: a.uncertain };
}

export function startCalque(text: Text, opts: { promptId?: string; modelId?: string; body?: string; promptText?: string }): string | null {
  const key = `calque|${text.id}`;
  const running = runningFor(key);
  if (running) return running.id;
  const prompt = getRec('prompts', opts.promptId) ?? defaultPrompt('calque', text, text.lang);
  const model = getRec('models', opts.modelId) ?? activeModel();
  if (!model || model.provider === 'web') return null;
  const turns: Turn[] = [
    ...(prompt?.system ? [{ role: 'system' as const, content: prompt.system }] : []),
    { role: 'user', content: opts.promptText ?? calquePromptText(text, prompt) },
  ];
  const q = addQuery({ key, kind: 'calque', title: `Calque · ${text.title}`, model: modelLabel(model), textId: text.id });
  void execute(q, model, turns, opts.body).then((r) => {
    if (!r) return;
    const cur = useStore.getState().texts[text.id] ?? text;
    const { calque } = saveCalque(cur, r.content, { source: 'ai', model: r.servedBy ?? model.model, promptName: prompt?.name });
    update(q.id, { status: 'done', resultId: calque.id });
  });
  return q.id;
}

/** Turns for a model test: tiny prompt, measures time to first token. */
export async function testModel(model: Model): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await runModel(model, [{ role: 'user', content: 'Reply with the single word OK.' }], ctl.signal, () => {});
    return `OK · first token ${r.firstTokenMs ? Math.round(r.firstTokenMs) : '?'} ms · total ${Math.round(r.totalMs)} ms · served by ${r.servedBy ?? model.model}`;
  } finally {
    clearTimeout(timer);
  }
}
