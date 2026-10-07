// Persisted data model. Every record syncs independently: `updatedAt` (ms)
// decides last-writer-wins merges, `deleted` marks tombstones so deletions
// propagate between devices.

export type Id = string;

export interface Rec {
  id: Id;
  updatedAt: number;
  deleted?: boolean;
}

export interface Language extends Rec {
  name: string;
  code?: string; // BCP-47-ish, used for speech and Wiktionary
  rtl?: boolean;
}

export interface Text extends Rec {
  title: string;
  author?: string;
  lang: Id;
  content: string; // may contain [Red]…[/Red], [hang:n]…[/hang]
  createdAt: number;
  wordPromptId?: Id;
  passagePromptId?: Id;
  calqueId?: Id; // active calque
  rank?: number; // custom library order; set only once moved by hand
  scratch?: boolean; // the Playground text (hidden from the library)
}

export type PromptKind = 'word' | 'passage' | 'calque';

export interface Prompt extends Rec {
  name: string;
  kind: PromptKind;
  lang: Id | ''; // '' = any language
  template: string; // placeholders: {word} {text} {sentence} {language} {title} {author}
  system?: string;
  createdAt: number;
}

export type ApiFormat = 'openai' | 'gemini' | 'anthropic' | 'web';

/** A user-defined endpoint (built-in providers live in llm/providers.ts). */
export interface Provider extends Rec {
  name: string;
  format: ApiFormat;
  baseUrl: string;
}

/** API key for a provider id (built-in or custom). Never exported unless asked. */
export interface Secret extends Rec {
  key: string;
}

export interface Model extends Rec {
  name: string; // empty → the model path is shown
  provider: Id; // built-in provider id, custom Provider id, or 'web'
  model: string; // e.g. "anthropic/claude-opus-5.5"
  temperature?: number;
  maxTokens?: number;
  body?: string; // custom JSON body template; default comes from the provider format
  siteUrl?: string; // web assist: chat site to open
  createdAt: number;
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  model?: string;
}

export interface Translation extends Rec {
  kind: 'word' | 'passage';
  lang: Id;
  textId: Id;
  target: string; // the word or passage as it appears
  anchor?: [number, number]; // passages: plain-text offsets in textId
  createdAt: number;
  prompt: string; // the exact query sent
  promptName?: string;
  model?: string; // requested model path or web site
  servedBy?: string; // model name reported by the API
  provider?: string;
  content: string;
  reasoning?: string;
  chat?: ChatMsg[];
}

export interface Calque extends Rec {
  textId: Id;
  createdAt: number;
  slots: string[]; // one calque token per source chunk (notation kept)
  sig: string; // fingerprint of the source chunks the slots belong to
  raw?: string; // output as received
  source: 'ai' | 'import' | 'web' | 'edit' | 'legacy';
  model?: string;
  promptName?: string;
  chat?: ChatMsg[];
}

/** Per-text reading state and mirror-view overrides (id = text id). */
export interface Reading extends Rec {
  pos?: number; // plain offset of the first visible word
  keep?: number[]; // chunk start offsets shown untranslated in mirror view
  keepWords?: string[]; // word keys shown untranslated everywhere in this text
  replace?: { start: number; end: number; text: string }[]; // custom mirror text for a chunk range
}

/** Synced preferences (single record, id 'prefs'). */
export interface Prefs extends Rec {
  modelId?: Id; // active model
  compound?: boolean; // mirror view shows compound meanings instead of literal parts
  syncKeys?: boolean;
}

export interface Stores {
  langs: Language;
  texts: Text;
  prompts: Prompt;
  providers: Provider;
  secrets: Secret;
  models: Model;
  translations: Translation;
  calques: Calque;
  readings: Reading;
  prefs: Prefs;
}
export type StoreName = keyof Stores;
export const STORE_NAMES: StoreName[] = [
  'langs',
  'texts',
  'prompts',
  'providers',
  'secrets',
  'models',
  'translations',
  'calques',
  'readings',
  'prefs',
];

export type Records = { [K in StoreName]: Record<Id, Stores[K]> };
