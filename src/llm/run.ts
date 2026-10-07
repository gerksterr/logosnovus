import { getRec, useStore } from '../data/store';
import type { Model } from '../model/types';
import { resolveProvider } from './providers';
import { buildRequest, type Turn } from './request';
import { readCompletion, type Delta, type StreamResult } from './stream';

export interface PromptVars {
  word?: string;
  text?: string;
  sentence?: string;
  language?: string;
  title?: string;
  author?: string;
}

/** Fills {word} {text} {sentence} {language} {title} {author}; {word} and {text} are interchangeable. */
export function fillPrompt(template: string, v: PromptVars): string {
  const vals: Record<string, string | undefined> = {
    word: v.word ?? v.text,
    text: v.text ?? v.word,
    sentence: v.sentence ?? v.text ?? v.word,
    language: v.language || 'source-language',
    title: v.title || 'the text',
    author: v.author || 'its author',
  };
  return template.replace(/\{(word|text|sentence|language|title|author)\}/g, (_, k) => vals[k] ?? '');
}

/** The chosen model; otherwise the first one whose provider has a key; otherwise a copy & paste model. */
export function activeModel(): Model | undefined {
  const s = useStore.getState();
  const chosen = getRec('models', s.prefs.prefs?.modelId);
  if (chosen) return chosen;
  const models = Object.values(s.models).filter((m) => !m.deleted);
  const hasKey = (m: Model) => m.provider !== 'web' && (!!getRec('secrets', m.provider) || !!s.providers[m.provider]);
  return models.find(hasKey) ?? models.find((m) => m.id === 'm-web-claude') ?? models.find((m) => m.provider === 'web') ?? models[0];
}

export function modelLabel(m?: Model): string {
  return m ? m.name || m.model : 'no model';
}

export interface RunResult extends StreamResult {
  request: { url: string; body: string };
  firstTokenMs?: number;
  totalMs: number;
}

export function prepare(model: Model, turns: Turn[], bodyOverride?: string) {
  const s = useStore.getState();
  const provider = resolveProvider(model.provider, s.providers);
  if (!provider) throw new Error(`Unknown provider "${model.provider}" for model ${modelLabel(model)}.`);
  const key = getRec('secrets', provider.id)?.key ?? '';
  if (!key && !provider.custom) throw new Error(`No API key for ${provider.name}. Add one in Settings → API keys.`);
  return buildRequest(model, provider, key, turns, bodyOverride);
}

export async function runModel(
  model: Model,
  turns: Turn[],
  signal: AbortSignal,
  onDelta: (d: Delta) => void,
  bodyOverride?: string,
): Promise<RunResult> {
  const req = prepare(model, turns, bodyOverride);
  const t0 = performance.now();
  let first: number | undefined;
  const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal });
  const out = await readCompletion(res, req.format, (d) => {
    first ??= performance.now() - t0;
    onDelta(d);
  });
  if (!out.content && !out.reasoning) throw new Error(`The model returned no text${out.finish ? ` (finish reason: ${out.finish})` : ''}.`);
  return { ...out, request: { url: req.url, body: req.body }, firstTokenMs: first, totalMs: performance.now() - t0 };
}
