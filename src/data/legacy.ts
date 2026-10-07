// Converts data from the previous app version ("Symbolic Text Decipher":
// JSON export v2, or its Firestore layout) into current records.
// Calques are re-aligned from their raw text with the new aligner; passages
// saved as plain strings are anchored back into their texts.

import { alignCalque, docSig } from '../calque/align';
import { DEFAULT_LANGS, DEFAULT_MODELS } from '../model/defaults';
import type { Calque, ChatMsg, Language, Model, Prefs, Prompt, Reading, Secret, Text, Translation } from '../model/types';
import { buildDoc, findLoose, wordKey } from '../text/document';
import type { Bundle } from './merge';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export function isLegacyBackup(x: Any): boolean {
  return !!x && !x.app && Array.isArray(x.texts) && (Array.isArray(x.annotations) || Array.isArray(x.blueprints));
}

/** Standalone chat export of the old app: { "ann_<id>": [messages] }. */
export function isLegacyChats(x: Any): boolean {
  return !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length > 0 && Object.keys(x).every((k) => k.startsWith('ann_'));
}

const time = (s: unknown, fallback = Date.now()) => (typeof s === 'string' && Date.parse(s)) || (typeof s === 'number' ? s : fallback);
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

const OLD_SEED_MODELS = new Set([
  'llm-bp-gemini-flash-default',
  'llm-bp-gemini-25-flash',
  'llm-bp-groq-llama33',
  'llm-bp-openrouter-sonnet',
  'llm-bp-local-ollama',
]);
const OLD_WEB_MODELS: Record<string, string> = {
  'llm-bp-web-assist-claude': 'm-web-claude',
  'llm-bp-web-assist-aistudio': 'm-web-aistudio',
  'llm-bp-web-assist-chatgpt': 'm-web-chatgpt',
};
const PROVIDER_MAP: Record<string, string> = {
  openrouter: 'openrouter',
  'built-in-gemini': 'gemini',
  'custom-gemini': 'gemini',
  groq: 'groq',
};

export function keyProvider(key: string): string | null {
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('AIza')) return 'gemini';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('gsk_')) return 'groq';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}

function chat(list: Any): ChatMsg[] | undefined {
  if (!Array.isArray(list) || !list.length) return undefined;
  return list
    .filter((m: Any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: Any) => ({ role: m.role, content: m.content, at: time(m.createdAt ?? m.timestamp), model: m.modelUsed }));
}

export interface LegacyResult {
  bundle: Bundle;
  keys: { provider: string; masked: string }[]; // API keys found (included only if requested)
  unanchored: number; // passages whose text could not be found
}

export function convertLegacy(old: Any, opts: { includeKeys: boolean }): LegacyResult {
  const langs: Language[] = [];
  const langByName = new Map<string, string>();
  for (const l of DEFAULT_LANGS) langByName.set(l.name.toLowerCase(), l.id);
  for (const l of old.languages ?? []) {
    if (!l?.id || !l.name) continue;
    const id = langByName.get(l.name.toLowerCase()) ?? l.id;
    langByName.set(l.name.toLowerCase(), id);
    langs.push({ id, name: l.name, code: l.code, rtl: !!l.isRTL, updatedAt: time(l.createdAt, 2) });
  }
  const langId = (name: unknown): string => {
    const n = String(name || '').trim();
    if (!n || n.toLowerCase() === 'all') return '';
    let id = langByName.get(n.toLowerCase());
    if (!id) {
      id = `lang-${slug(n)}`;
      while (langs.some((l) => l.id === id) || DEFAULT_LANGS.some((l) => l.id === id)) id += '-2';
      langByName.set(n.toLowerCase(), id);
      langs.push({ id, name: n, updatedAt: 2 });
    }
    return id;
  };

  // ---- texts
  const texts: Text[] = [];
  const docs = new Map<string, ReturnType<typeof buildDoc>>();
  const textLang = new Map<string, string>();
  for (const t of old.texts ?? []) {
    if (!t?.id || typeof t.content !== 'string') continue;
    const lang = langId(t.language) || langId('Unknown');
    textLang.set(t.id, lang);
    docs.set(t.id, buildDoc(t.content));
    texts.push({
      id: t.id,
      title: t.title || 'Untitled',
      author: t.author || undefined,
      lang,
      content: t.content,
      createdAt: time(t.createdAt),
      updatedAt: time(t.updatedAt ?? t.createdAt),
      wordPromptId: t.wordBlueprintId || undefined,
      passagePromptId: t.passageBlueprintId || undefined,
    });
  }

  // ---- prompts: the user's own, plus built-ins they edited or still use
  const used = new Set(texts.flatMap((t) => [t.wordPromptId, t.passagePromptId]));
  const prompts: Prompt[] = [];
  for (const b of old.blueprints ?? []) {
    if (!b?.id || !b.template || (b.type !== 'word' && b.type !== 'passage')) continue;
    const own = String(b.id).startsWith('bp-');
    const edited = b.updatedAt && b.createdAt && b.updatedAt !== b.createdAt;
    if (!own && !edited && !used.has(b.id)) continue;
    prompts.push({
      id: b.id,
      name: b.name || 'Prompt',
      kind: b.type,
      lang: langId(b.language),
      template: b.template,
      createdAt: time(b.createdAt),
      updatedAt: time(b.updatedAt ?? b.createdAt),
    });
  }
  for (const c of old.calquePrompts ?? []) {
    if (!c?.id || !c.prompt || c.isDefault) continue;
    prompts.push({
      id: c.id,
      name: c.title || 'Calque prompt',
      kind: 'calque',
      lang: langId(c.language),
      template: c.prompt.includes('{text}') ? c.prompt : `${c.prompt}\n\nText:\n{text}`,
      system: c.systemInstruction || undefined,
      createdAt: time(c.createdAt),
      updatedAt: time(c.createdAt),
    });
  }
  const promptIds = new Set(prompts.map((p) => p.id));
  for (const t of texts) {
    if (t.wordPromptId && !promptIds.has(t.wordPromptId)) t.wordPromptId = undefined;
    if (t.passagePromptId && !promptIds.has(t.passagePromptId)) t.passagePromptId = undefined;
  }

  // ---- models, active model and keys
  const models: Model[] = [];
  const keyList: { provider: string; key: string }[] = [];
  const noteKey = (k: unknown, fallbackProvider?: string) => {
    if (typeof k !== 'string' || k.length < 12) return;
    const provider = keyProvider(k) ?? fallbackProvider;
    if (provider && !keyList.some((x) => x.key === k)) keyList.push({ provider, key: k });
  };
  let activeModel: string | undefined;
  for (const m of old.llmModelBlueprints ?? []) {
    if (!m?.id) continue;
    noteKey(m.customApiKey, PROVIDER_MAP[m.provider]);
    const web = OLD_WEB_MODELS[m.id];
    if (m.isDefault) activeModel = web ?? (OLD_SEED_MODELS.has(m.id) ? undefined : m.id);
    if (web || OLD_SEED_MODELS.has(m.id)) continue;
    if (m.provider === 'web-assist') {
      models.push({ id: m.id, name: m.name, provider: 'web', model: m.webSiteName || m.modelName, siteUrl: m.webSiteUrl, createdAt: time(m.createdAt), updatedAt: time(m.updatedAt) });
      continue;
    }
    const provider = PROVIDER_MAP[m.provider];
    if (!provider || !m.modelName) continue;
    models.push({
      id: m.id,
      name: m.name && m.name !== m.modelName ? m.name : '',
      provider,
      model: m.modelName,
      temperature: typeof m.temperature === 'number' ? m.temperature : undefined,
      createdAt: time(m.createdAt),
      updatedAt: time(m.updatedAt),
    });
  }
  noteKey(old.llmConfig?.customApiKey);
  for (const p of old.llmConfig?.customProviders ?? []) noteKey(p?.apiKey);
  const secrets: Secret[] = opts.includeKeys ? keyList.map((k) => ({ id: k.provider, key: k.key, updatedAt: 2 })) : [];
  const knownModel = (id?: string) => !!id && (models.some((m) => m.id === id) || DEFAULT_MODELS.some((m) => m.id === id));
  const prefs: Prefs[] = knownModel(activeModel) ? [{ id: 'prefs', modelId: activeModel, updatedAt: 2 }] : [];

  // ---- translations
  const chats = old.decipherChats ?? {};
  let unanchored = 0;
  const translations: Translation[] = [];
  for (const a of old.annotations ?? []) {
    if (!a?.id || typeof a.result !== 'string' || typeof a.target !== 'string') continue;
    const kind = a.type === 'passage' ? 'passage' : 'word';
    const doc = docs.get(a.textId);
    let anchor: [number, number] | undefined;
    if (kind === 'passage' && doc) {
      const r = findLoose(doc.plain, a.target);
      if (r) anchor = [r.start, r.end];
      else unanchored++;
    }
    translations.push({
      id: a.id,
      kind,
      lang: textLang.get(a.textId) ?? '',
      textId: a.textId,
      target: a.target.trim(),
      anchor,
      createdAt: time(a.createdAt),
      updatedAt: time(a.syncedAt ?? a.createdAt),
      prompt: a.queryUsed || '',
      promptName: a.blueprintName || undefined,
      model: a.modelUsed || undefined,
      provider: a.providerUsed || undefined,
      content: a.result,
      chat: chat(chats[`ann_${a.id}`]) ?? chat(a.conversation),
    });
  }

  // ---- calques: the active mirror per text plus its history
  const calques: Calque[] = [];
  const readings: Reading[] = [];
  const history = (old.calqueHistory ?? []) as Any[];
  const SOURCE: Record<string, Calque['source']> = { 'ai-generation': 'ai', 'manual-import': 'import', 'web-assist': 'web' };
  const makeCalque = (id: string, textId: string, raw: string, extra: Partial<Calque>): Calque | null => {
    const doc = docs.get(textId);
    if (!doc || typeof raw !== 'string') return null;
    if (raw.split(/\s+/).filter(Boolean).length < doc.chunks.length * 0.3) return null; // error text, not a calque
    return { id, textId, raw, slots: alignCalque(doc, raw).slots, sig: docSig(doc), source: 'legacy', createdAt: Date.now(), updatedAt: 2, ...extra };
  };
  for (const [textId, m] of Object.entries<Any>(old.mirrorTranslations ?? {})) {
    const text = texts.find((t) => t.id === textId);
    if (!text || !m?.rawCalqueText) continue;
    const hist = history.filter((h) => h?.textId === textId && typeof h.rawCalqueText === 'string');
    const same = hist.find((h) => h.rawCalqueText.trim() === m.rawCalqueText.trim());
    let activeId = same?.id;
    if (!same) {
      const c = makeCalque(`cq-${textId}`, textId, m.rawCalqueText, { model: m.sourceModel, createdAt: time(m.updatedAt), updatedAt: time(m.updatedAt) });
      if (c) {
        calques.push(c);
        activeId = c.id;
      }
    }
    for (const h of hist) {
      const c = makeCalque(h.id, textId, h.rawCalqueText, {
        source: SOURCE[h.source] ?? 'legacy',
        model: h.modelUsed,
        createdAt: time(h.createdAt),
        updatedAt: time(h.createdAt),
        chat: chat(h.conversation),
      });
      if (c) calques.push(c);
      else if (activeId === h.id) activeId = undefined;
    }
    if (activeId) text.calqueId = activeId;
    const keepWords = (m.untranslatedWords ?? []).filter((w: unknown) => typeof w === 'string').map((w: string) => wordKey(w));
    if (keepWords.length) readings.push({ id: textId, keepWords, updatedAt: 2 });
  }

  return {
    bundle: { langs, texts, prompts, models, secrets, prefs, translations, calques, readings },
    keys: keyList.map((k) => ({ provider: k.provider, masked: `${k.key.slice(0, 6)}…${k.key.slice(-4)}` })),
    unanchored,
  };
}

/** Old standalone chat export → chat added to the matching translations. */
export function convertLegacyChats(chats: Any, existing: Record<string, Translation>): Translation[] {
  const out: Translation[] = [];
  for (const [k, list] of Object.entries(chats)) {
    const t = existing[k.slice(4)];
    const c = chat(list);
    if (t && c && !t.chat?.length) out.push({ ...t, chat: c, updatedAt: Date.now() });
  }
  return out;
}
