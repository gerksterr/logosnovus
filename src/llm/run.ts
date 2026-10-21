import { getRec, useStore } from '../data/store';
import type { Model } from '../model/types';
import { bridgeAsk, bridgeUrl, sampleOptions, toSampleInput, type Resume } from './bridge';
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
  // the Claude bridge needs no key but a Claude account: never chosen for someone who did not pick it
  const hasKey = (m: Model) => m.provider !== 'web' && m.provider !== 'claude' && (!!getRec('secrets', m.provider) || !!s.providers[m.provider]);
  return models.find(hasKey) ?? models.find((m) => m.id === 'm-web-claude') ?? models.find((m) => m.provider === 'web') ?? models[0];
}

/** Display name (older seeds carried a "(copy & paste)" suffix; the picker shows a badge instead). */
export function modelLabel(m?: Model): string {
  return m ? (m.name || m.model).replace(/\s*\((copy & paste|Google API key)\)$/, '') : 'no model';
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
  if (provider.format === 'bridge')
    return { url: bridgeUrl(), headers: {}, format: provider.format, body: JSON.stringify({ input: toSampleInput(turns), ...sampleOptions(model) }, null, 2) };
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
  bridge?: { label: string; resume?: Resume },
): Promise<RunResult> {
  const req = prepare(model, turns, bodyOverride);
  if (req.format === 'bridge') {
    const t0 = performance.now();
    const a = await bridgeAsk(model, turns, bridge?.label ?? 'Request', signal, bridge?.resume);
    if (a.error || !a.text) throw new Error(a.error ? `Claude bridge: ${a.error}` : 'The Claude bridge returned no text.');
    onDelta({ text: a.text });
    const servedBy = `Claude${a.model ? ` ${a.model}` : ''} (claude.ai)`;
    return { content: a.text, reasoning: '', servedBy, finish: a.truncated ? 'length' : undefined, events: [], request: { url: req.url, body: req.body }, totalMs: performance.now() - t0 };
  }
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
