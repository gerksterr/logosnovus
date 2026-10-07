// Reads a streaming (SSE) or plain JSON completion in any supported format.
// Reasoning/"thinking" tokens are surfaced separately so a reasoning model
// shows activity immediately instead of looking frozen until its answer starts.

import type { ApiFormat } from '../model/types';

export interface Delta {
  text?: string;
  reasoning?: string;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  servedBy?: string;
  finish?: string;
  usage?: Record<string, unknown>;
  events: string[]; // raw events for the debug view (capped)
}

const MAX_EVENTS = 400;

/** Pulls text/reasoning/meta out of one parsed event or JSON body. */
export function extract(format: ApiFormat, j: any, out: StreamResult): Delta {
  const d: Delta = {};
  if (j?.error) throw new Error(typeof j.error === 'string' ? j.error : j.error.message || JSON.stringify(j.error));
  if (format === 'openai') {
    out.servedBy ??= j.model;
    if (j.usage) out.usage = j.usage;
    const c = j.choices?.[0];
    if (!c) return d;
    const m = c.delta ?? c.message ?? {};
    if (typeof m.content === 'string') d.text = m.content;
    else if (Array.isArray(m.content)) d.text = m.content.map((p: any) => p?.text ?? '').join('');
    const r = m.reasoning ?? m.reasoning_content ?? m.thinking;
    if (typeof r === 'string') d.reasoning = r;
    if (c.finish_reason) out.finish = c.finish_reason;
  } else if (format === 'gemini') {
    out.servedBy ??= j.modelVersion;
    if (j.usageMetadata) out.usage = j.usageMetadata;
    const c = j.candidates?.[0];
    for (const p of c?.content?.parts ?? []) {
      if (typeof p.text !== 'string') continue;
      if (p.thought) d.reasoning = (d.reasoning ?? '') + p.text;
      else d.text = (d.text ?? '') + p.text;
    }
    if (c?.finishReason) out.finish = c.finishReason;
    if (j.promptFeedback?.blockReason) throw new Error(`Blocked by the provider: ${j.promptFeedback.blockReason}`);
  } else if (format === 'anthropic') {
    if (j.type === 'message_start') {
      out.servedBy ??= j.message?.model;
      if (j.message?.usage) out.usage = j.message.usage;
    } else if (j.type === 'content_block_delta') {
      if (j.delta?.type === 'text_delta') d.text = j.delta.text;
      else if (j.delta?.type === 'thinking_delta') d.reasoning = j.delta.thinking;
    } else if (j.type === 'message_delta') {
      if (j.delta?.stop_reason) out.finish = j.delta.stop_reason;
      if (j.usage) out.usage = { ...out.usage, ...j.usage };
    } else if (Array.isArray(j.content)) {
      // non-streaming response
      out.servedBy ??= j.model;
      d.text = j.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      out.finish = j.stop_reason;
    }
  }
  return d;
}

async function httpError(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '');
  let msg = text.slice(0, 600);
  try {
    const j = JSON.parse(text);
    const e = Array.isArray(j) ? j[0]?.error : j.error;
    msg = (typeof e === 'string' ? e : e?.message) || j.message || msg;
  } catch {
    /* not JSON */
  }
  const hint =
    res.status === 401 || res.status === 403
      ? ' Check the API key in Settings.'
      : res.status === 402
        ? ' The account has no credit left for this model.'
        : res.status === 429
          ? ' Rate limit reached; wait a moment.'
          : '';
  return new Error(`HTTP ${res.status}: ${msg}${hint}`);
}

export async function readCompletion(res: Response, format: ApiFormat, onDelta: (d: Delta) => void): Promise<StreamResult> {
  const out: StreamResult = { content: '', reasoning: '', events: [] };
  if (!res.ok) throw await httpError(res);
  const push = (d: Delta) => {
    if (d.text) out.content += d.text;
    if (d.reasoning) out.reasoning += d.reasoning;
    if (d.text || d.reasoning) onDelta(d);
  };
  const type = res.headers.get('content-type') || '';
  if (!type.includes('event-stream') || !res.body) {
    const text = await res.text();
    out.events.push(text.slice(0, 20000));
    push(extract(format, JSON.parse(text), out));
    return out;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  const handle = (block: string) => {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) return; // comments (": OPENROUTER PROCESSING") and event: lines
    if (out.events.length < MAX_EVENTS) out.events.push(data);
    if (data === '[DONE]') return;
    push(extract(format, JSON.parse(data), out));
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value.replace(/\r\n?/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      handle(buf.slice(0, i));
      buf = buf.slice(i + 2);
    }
  }
  if (buf.trim()) handle(buf);
  return out;
}
