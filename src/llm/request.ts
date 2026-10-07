// Builds the HTTP request for a model from an editable JSON body template.

import type { Model } from '../model/types';
import { DEFAULT_BODIES, type ProviderDef } from './providers';

export interface Turn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: string; // final JSON text (what the debug view shows)
  format: ProviderDef['format'];
}

/** Values available to body templates. */
export function templateValues(model: Model, turns: Turn[]): Record<string, unknown> {
  const system = turns.filter((t) => t.role === 'system').map((t) => t.content).join('\n\n') || null;
  const chat = turns.filter((t) => t.role !== 'system');
  return {
    model: model.model,
    messages: model.provider === 'anthropic' ? chat : turns,
    contents: chat.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
    system,
    system_parts: system ? { parts: [{ text: system }] } : null,
    prompt: chat.filter((t) => t.role === 'user').at(-1)?.content ?? '',
    temperature: model.temperature ?? null,
    max_tokens: model.maxTokens ?? (model.provider === 'anthropic' ? 8192 : null),
  };
}

/**
 * Fills {placeholders} in a JSON template. Outside strings a placeholder
 * becomes the JSON value; inside a string it becomes escaped text; a string
 * that is exactly "{name}" becomes the value itself. Nulls are then dropped.
 */
export function fillTemplate(template: string, values: Record<string, unknown>): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    if (ch === '"' && template[i - 1] !== '\\') inString = !inString;
    if (ch === '{') {
      const m = /^\{([a-z_]+)\}/.exec(template.slice(i, i + 40));
      if (m && m[1] in values) {
        const v = values[m[1]];
        const whole = inString && template[i - 1] === '"' && template[i + m[0].length] === '"';
        if (whole && typeof v !== 'string') {
          out = out.slice(0, -1) + JSON.stringify(v);
          i += m[0].length; // skip closing quote too
          inString = false;
        } else {
          out += inString ? JSON.stringify(v == null ? '' : String(v)).slice(1, -1) : JSON.stringify(v ?? null);
          i += m[0].length - 1;
        }
        continue;
      }
    }
    out += ch;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(out);
  } catch (e) {
    throw new Error(`The request template is not valid JSON after filling placeholders (${(e as Error).message}).`);
  }
  return JSON.stringify(dropNulls(parsed), null, 2);
}

function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const y = dropNulls(x);
      if (y !== null && !(typeof y === 'object' && !Array.isArray(y) && Object.keys(y as object).length === 0)) o[k] = y;
    }
    return o;
  }
  return v;
}

export function defaultBody(provider: ProviderDef): string {
  return provider.format === 'web' ? '' : DEFAULT_BODIES[provider.format];
}

export function buildRequest(model: Model, provider: ProviderDef, key: string, turns: Turn[], bodyOverride?: string): BuiltRequest {
  const body = bodyOverride ?? fillTemplate(model.body?.trim() || defaultBody(provider), templateValues(model, turns));
  const base = provider.baseUrl;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let url: string;
  switch (provider.format) {
    case 'gemini':
      url = `${base}/models/${encodeURIComponent(model.model)}:streamGenerateContent?alt=sse`;
      if (key) headers['x-goog-api-key'] = key;
      break;
    case 'anthropic':
      url = `${base}/messages`;
      if (key) headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      break;
    case 'openai':
      url = `${base}/chat/completions`;
      if (key) headers.authorization = `Bearer ${key}`;
      if (provider.id === 'openrouter') {
        headers['HTTP-Referer'] = typeof location !== 'undefined' ? location.origin : 'https://logosnovus.app';
        headers['X-Title'] = 'Logos Novus';
      }
      break;
    default:
      throw new Error('Web chat models are used by copy & paste, not over the network.');
  }
  return { url, headers, body, format: provider.format };
}
