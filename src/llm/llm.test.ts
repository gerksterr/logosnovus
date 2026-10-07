import { describe, expect, it } from 'vitest';
import { DEFAULT_BODIES, BUILTIN_PROVIDERS } from './providers';
import { buildRequest, fillTemplate, templateValues } from './request';
import { readCompletion } from './stream';
import { fillPrompt } from './run';
import type { Model } from '../model/types';

const model = (provider: string, extra: Partial<Model> = {}): Model => ({ id: 'm', name: '', provider, model: 'x/y', createdAt: 1, updatedAt: 1, ...extra });
const turns = [
  { role: 'system' as const, content: 'Be brief.' },
  { role: 'user' as const, content: 'Erkläre "Sein"\nbitte' },
];
const prov = (id: string) => BUILTIN_PROVIDERS.find((p) => p.id === id)!;

describe('request templates', () => {
  it('fills the OpenAI body and drops nulls', () => {
    const body = JSON.parse(fillTemplate(DEFAULT_BODIES.openai, templateValues(model('openrouter', { temperature: 0.2 }), turns)));
    expect(body).toEqual({ model: 'x/y', messages: turns, temperature: 0.2, stream: true });
  });
  it('builds Gemini contents with a system instruction', () => {
    const body = JSON.parse(fillTemplate(DEFAULT_BODIES.gemini, templateValues(model('gemini', { maxTokens: 500 }), turns)));
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: turns[1].content }] });
    expect(body.generationConfig).toEqual({ maxOutputTokens: 500 });
  });
  it('separates the Anthropic system prompt and requires max_tokens', () => {
    const body = JSON.parse(fillTemplate(DEFAULT_BODIES.anthropic, templateValues(model('anthropic'), turns)));
    expect(body.system).toBe('Be brief.');
    expect(body.messages).toEqual([turns[1]]);
    expect(body.max_tokens).toBe(8192);
  });
  it('escapes placeholders inside strings and supports custom fields', () => {
    const tpl = '{"model": "{model}", "messages": [{"role": "user", "content": "Q: {prompt}"}], "reasoning": {"effort": "low"}, "messages2": "{messages}"}';
    const body = JSON.parse(fillTemplate(tpl, templateValues(model('openrouter'), turns)));
    expect(body.messages[0].content).toBe('Q: Erkläre "Sein"\nbitte');
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.messages2).toEqual(turns);
  });
  it('reports invalid templates clearly', () => {
    expect(() => fillTemplate('{"model": {model', {})).toThrow(/not valid JSON/);
  });
  it('builds provider URLs and headers', () => {
    const r = buildRequest(model('openrouter'), prov('openrouter'), 'k', turns);
    expect(r.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(r.headers.authorization).toBe('Bearer k');
    const g = buildRequest(model('gemini', { model: 'gemini-flash-latest' }), prov('gemini'), 'k', turns);
    expect(g.url).toContain('/models/gemini-flash-latest:streamGenerateContent?alt=sse');
    expect(buildRequest(model('anthropic'), prov('anthropic'), 'k', turns).headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});

const sse = (events: string[], type = 'text/event-stream') =>
  new Response(new Blob([events.map((e) => `data: ${e}\n\n`).join('')]), { headers: { 'content-type': type } });

describe('stream parsing', () => {
  it('reads OpenAI/OpenRouter streams with reasoning and comments', async () => {
    const body = ': OPENROUTER PROCESSING\n\n' +
      ['{"model":"anthropic/claude-x","choices":[{"delta":{"reasoning":"hmm "}}]}', '{"choices":[{"delta":{"content":"Hal"}}]}', '{"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"total_tokens":9}}', '[DONE]']
        .map((e) => `data: ${e}\r\n\r\n`).join('');
    const deltas: string[] = [];
    const r = await readCompletion(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), 'openai', (d) => deltas.push(d.text ?? `(${d.reasoning})`));
    expect(r.content).toBe('Hallo');
    expect(r.reasoning).toBe('hmm ');
    expect(r.servedBy).toBe('anthropic/claude-x');
    expect(r.finish).toBe('stop');
    expect(deltas).toEqual(['(hmm )', 'Hal', 'lo']);
  });
  it('reads Gemini streams with thought parts', async () => {
    const r = await readCompletion(
      sse(['{"candidates":[{"content":{"parts":[{"text":"think","thought":true}]}}],"modelVersion":"gemini-x"}', '{"candidates":[{"content":{"parts":[{"text":"Answer"}]},"finishReason":"STOP"}]}']),
      'gemini',
      () => {},
    );
    expect(r).toMatchObject({ content: 'Answer', reasoning: 'think', servedBy: 'gemini-x', finish: 'STOP' });
  });
  it('reads Anthropic event streams', async () => {
    const r = await readCompletion(
      sse([
        '{"type":"message_start","message":{"model":"claude-x","usage":{"input_tokens":3}}}',
        '{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"t"}}',
        '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}',
        '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}',
      ]),
      'anthropic',
      () => {},
    );
    expect(r).toMatchObject({ content: 'Hi', reasoning: 't', servedBy: 'claude-x', finish: 'end_turn' });
  });
  it('reads non-streaming JSON and explains HTTP errors', async () => {
    const r = await readCompletion(new Response('{"choices":[{"message":{"content":"x"}}]}', { headers: { 'content-type': 'application/json' } }), 'openai', () => {});
    expect(r.content).toBe('x');
    await expect(readCompletion(new Response('{"error":{"message":"No auth"}}', { status: 401 }), 'openai', () => {})).rejects.toThrow(/HTTP 401: No auth.*API key/);
    await expect(readCompletion(sse(['{"error":{"message":"overloaded"}}']), 'openai', () => {})).rejects.toThrow('overloaded');
  });
});

describe('prompt filling', () => {
  it('fills word/text interchangeably plus context placeholders', () => {
    expect(fillPrompt("'{word}' in {title} ({language}): {sentence}", { text: 'Sein', title: 'Zarathustra', language: 'German', sentence: 'Das Sein.' }))
      .toBe("'Sein' in Zarathustra (German): Das Sein.");
  });
});
