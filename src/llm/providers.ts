import type { ApiFormat, Provider } from '../model/types';

export interface ProviderDef {
  id: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  keyUrl?: string; // where to create an API key
  custom?: boolean;
}

export const BUILTIN_PROVIDERS: ProviderDef[] = [
  { id: 'openrouter', name: 'OpenRouter', format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys' },
  {
    id: 'gemini',
    name: 'Google Gemini API',
    format: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  { id: 'anthropic', name: 'Anthropic', format: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', format: 'openai', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'groq', name: 'Groq', format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys' },
  { id: 'web', name: 'Web chat (copy & paste)', format: 'web', baseUrl: '' },
];

export function resolveProvider(id: string, custom: Record<string, Provider>): ProviderDef | undefined {
  const b = BUILTIN_PROVIDERS.find((p) => p.id === id);
  if (b) return b;
  const c = custom[id];
  return c && !c.deleted ? { id: c.id, name: c.name, format: c.format, baseUrl: c.baseUrl.replace(/\/+$/, ''), custom: true } : undefined;
}

/** Default JSON body per API format. {placeholders} are filled with JSON values; null fields are dropped. */
export const DEFAULT_BODIES: Record<Exclude<ApiFormat, 'web'>, string> = {
  openai: `{
  "model": "{model}",
  "messages": {messages},
  "temperature": {temperature},
  "max_tokens": {max_tokens},
  "stream": true
}`,
  gemini: `{
  "systemInstruction": {system_parts},
  "contents": {contents},
  "generationConfig": {
    "temperature": {temperature},
    "maxOutputTokens": {max_tokens}
  }
}`,
  anthropic: `{
  "model": "{model}",
  "system": {system},
  "messages": {messages},
  "max_tokens": {max_tokens},
  "temperature": {temperature},
  "stream": true
}`,
};

export const PLACEHOLDER_HELP: Record<string, string> = {
  model: 'model path',
  messages: 'chat messages array (OpenAI/Anthropic shape)',
  contents: 'chat turns in Gemini shape',
  system: 'system instruction text (or null)',
  system_parts: 'system instruction in Gemini shape (or null)',
  prompt: 'the last user message as text',
  temperature: 'model temperature (or null)',
  max_tokens: 'max output tokens (or null)',
};
