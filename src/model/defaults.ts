// Seed records for a fresh install. Seeds use updatedAt 1 so any user edit or
// synced/imported version always wins a merge against them.

import type { Language, Model, Prompt } from './types';

const seed = { updatedAt: 1, createdAt: 1 };

export const DEFAULT_LANGS: Language[] = [
  { id: 'lang-german', name: 'German', code: 'de', updatedAt: 1 },
  { id: 'lang-hebrew', name: 'Hebrew', code: 'he', rtl: true, updatedAt: 1 },
  { id: 'lang-greek', name: 'Ancient Greek', code: 'grc', updatedAt: 1 },
  { id: 'lang-latin', name: 'Latin', code: 'la', updatedAt: 1 },
  { id: 'lang-aramaic', name: 'Aramaic', code: 'arc', rtl: true, updatedAt: 1 },
  { id: 'lang-arabic', name: 'Arabic', code: 'ar', rtl: true, updatedAt: 1 },
  { id: 'lang-french', name: 'French', code: 'fr', updatedAt: 1 },
  { id: 'lang-sanskrit', name: 'Sanskrit', code: 'sa', updatedAt: 1 },
];

export const CALQUE_PROMPT = `Write a strict word-for-word English calque (mirror translation) of the {language} text below.

Rules:
1. Exactly one English token for every whitespace-separated source token, in the same order. Keep every line break and blank line.
2. If a token needs several English words, join them with hyphens: "zur" → "to-the", "Endknospe" → "end-bud".
3. Keep punctuation, numbers, brackets and markup tags ([Red]…[/Red], [hang:N]…[/hang]) exactly where they are in each token. Translate words inside brackets too. Translate signs whose meaning differs in English (Greek ";" → "?", "·" → ";").
4. Separated parts of one word (German separable verbs, tmesis): write the first part as literal[n:compound-meaning] and each later part as literal[n]. Number the groups per sentence, starting at 1.
   Example: "es zeichnet sie aus vor den Ziegenhirten." → "it draws[1:distinguishes] them out[1] before the goat-herds."
5. Output only the calque, no commentary.

Text:
{text}`;

export const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: 'p-word-etymology',
    name: 'Word: meaning & etymology',
    kind: 'word',
    lang: '',
    template: `Briefly explain the {language} word '{word}' as it is used in this sentence from {title}:
"{sentence}"

Give its literal meaning, its composition (stem, prefixes, suffixes), its etymology and historical development up to the time of the text, and how it differs from the English words it is usually translated with. Keep it brief and well formatted.`,
    ...seed,
  },
  {
    id: 'p-passage-symbolic',
    name: 'Passage: symbolic renderings',
    kind: 'passage',
    lang: '',
    template: `Give several English renderings of this passage from {title}, each approaching it from a different angle, so that together they carry its symbolic meaning to a reader who does not speak {language}. Keep them symbolic; do not reduce them to explanations. Then add a short note on what no rendering could carry over.

{text}`,
    ...seed,
  },
  { id: 'p-calque', name: 'Calque: word-for-word', kind: 'calque', lang: '', template: CALQUE_PROMPT, ...seed },
];

export const DEFAULT_MODELS: Model[] = [
  { id: 'm-openrouter-auto', name: 'OpenRouter auto-router', provider: 'openrouter', model: 'openrouter/auto', ...seed },
  { id: 'm-gemini-flash', name: 'Gemini Flash', provider: 'gemini', model: 'gemini-flash-latest', ...seed },
  { id: 'm-web-claude', name: 'Claude.ai', provider: 'web', model: 'Claude.ai', siteUrl: 'https://claude.ai/new', ...seed },
  { id: 'm-web-chatgpt', name: 'ChatGPT', provider: 'web', model: 'ChatGPT', siteUrl: 'https://chatgpt.com/', ...seed },
  {
    id: 'm-web-aistudio',
    name: 'Google AI Studio',
    provider: 'web',
    model: 'AI Studio',
    siteUrl: 'https://aistudio.google.com/prompts/new_chat',
    ...seed,
  },
];
