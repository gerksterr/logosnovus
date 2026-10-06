import { 
  TextItem, 
  QueryBlueprint, 
  Annotation, 
  LLMConfig, 
  ReaderSettings,
  MirrorTranslationData,
  CalqueHistoryEntry,
  CalquePromptTemplate,
  LanguageItem,
  LanguageWordGloss,
  LLMModelBlueprint,
  TranslationChatMessage,
  WebAssistSite
} from '../types';
import { 
  DEFAULT_BLUEPRINTS, 
  SAMPLE_TEXTS, 
  DEFAULT_LANGUAGES, 
  DEFAULT_LLM_MODEL_BLUEPRINTS,
  DEFAULT_WEB_ASSIST_SITES
} from '../data/seedData';
import { getInitialSampleMirrorTranslation } from '../utils/mirrorTranslationUtils';
import { normalizeForMatch, cleanWordToken } from '../utils/textUtils';

const STORAGE_KEYS = {
  TEXTS: 'symbolic_texts_v1',
  BLUEPRINTS: 'symbolic_blueprints_v1',
  ANNOTATIONS: 'symbolic_annotations_v1',
  LLM_CONFIG: 'symbolic_llm_config_v1',
  READER_SETTINGS: 'symbolic_reader_settings_v1',
  SCROLL_POSITIONS: 'symbolic_scroll_positions_v1',
  MIRROR_TRANSLATIONS: 'symbolic_mirror_translations_v1',
  CALQUE_HISTORY: 'symbolic_calque_history_v1',
  CALQUE_PROMPTS: 'symbolic_calque_prompts_v1',
  LANGUAGES: 'symbolic_languages_v1',
  LLM_MODEL_BLUEPRINTS: 'symbolic_llm_model_blueprints_v1',
  LANGUAGE_GLOSSES: 'symbolic_language_glosses_v1',
  MODEL_PRESETS: 'symbolic_model_presets_v1',
  DECIPHER_CHATS: 'symbolic_decipher_chats_v1',
  WEB_ASSIST_SITES: 'symbolic_web_assist_sites_v1',
};

// Default LLM Configuration
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'built-in-gemini',
  modelName: 'gemini-3.7-flash',
};

// Default Reader Settings
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  fontFamily: 'serif',
  theme: 'obsidian',
  autoDecipherSelection: true,
  mirrorDisplayMode: 'original',
};

// Initialize Storage with defaults if empty
export function initStorage(): {
  texts: TextItem[];
  blueprints: QueryBlueprint[];
  languages: LanguageItem[];
  llmModelBlueprints: LLMModelBlueprint[];
  llmConfig: LLMConfig;
  readerSettings: ReaderSettings;
} {
  let texts = getStoredTexts();
  if (texts.length === 0) {
    texts = SAMPLE_TEXTS;
    saveTexts(texts);
  }

  let blueprints = getStoredBlueprints();
  const MIGRATION_GLOBAL_DEFAULT = 'symbolic_blueprints_default_global_v3';
  if (!localStorage.getItem(MIGRATION_GLOBAL_DEFAULT)) {
    if (blueprints.length > 0) {
      blueprints = blueprints.map((b) => {
        const copy = { ...b, updatedAt: new Date().toISOString() };
        delete copy.modelBlueprintId;
        return copy;
      });
      saveBlueprints(blueprints);
    }
    // Also reset calque prompts to Active Global Model
    try {
      const calquePrompts = getStoredCalquePrompts();
      if (calquePrompts.length > 0) {
        const updatedCalques = calquePrompts.map((cp) => {
          const c = { ...cp };
          delete c.modelBlueprintId;
          return c;
        });
        localStorage.setItem(STORAGE_KEYS.CALQUE_PROMPTS, JSON.stringify(updatedCalques));
      }
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(MIGRATION_GLOBAL_DEFAULT, 'true');
    } catch {
      // ignore
    }
  }

  blueprints = getStoredBlueprints();
  saveBlueprints(blueprints);

  let languages = getStoredLanguages();
  if (languages.length === 0) {
    languages = DEFAULT_LANGUAGES;
    saveLanguages(languages);
  }

  let llmModelBlueprints = getStoredLLMModelBlueprints();
  saveLLMModelBlueprints(llmModelBlueprints);

  // Seed sample mirror translations if empty
  const storedMirrors = getStoredMirrorTranslations();
  if (Object.keys(storedMirrors).length === 0) {
    texts.forEach((t) => {
      const sampleMirror = getInitialSampleMirrorTranslation(t);
      if (sampleMirror) {
        saveMirrorTranslation(sampleMirror);
      }
    });
  }

  const llmConfig = getLLMConfig();
  const readerSettings = getReaderSettings();

  return { texts, blueprints, languages, llmModelBlueprints, llmConfig, readerSettings };
}

// ==========================================
// LANGUAGES CRUD
// ==========================================
export function getStoredLanguages(): LanguageItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LANGUAGES);
    const list: LanguageItem[] = raw ? JSON.parse(raw) : [];
    if (list.length === 0) {
      localStorage.setItem(STORAGE_KEYS.LANGUAGES, JSON.stringify(DEFAULT_LANGUAGES));
      return DEFAULT_LANGUAGES;
    }
    return list;
  } catch (err) {
    console.error('Failed to parse stored languages:', err);
    return DEFAULT_LANGUAGES;
  }
}

export function saveLanguages(languages: LanguageItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LANGUAGES, JSON.stringify(languages));
  } catch (err) {
    console.error('Failed to save languages:', err);
  }
}

export function saveLanguageItem(language: LanguageItem): LanguageItem[] {
  const current = getStoredLanguages();
  const index = current.findIndex((l) => l.id === language.id || l.name.toLowerCase() === language.name.toLowerCase());
  let updated: LanguageItem[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...current[index], ...language };
  } else {
    updated = [...current, language];
  }
  saveLanguages(updated);
  return updated;
}

export const saveLanguage = saveLanguageItem;

export function deleteLanguageItem(id: string): LanguageItem[] {
  const current = getStoredLanguages();
  const updated = current.filter((l) => l.id !== id);
  saveLanguages(updated);
  return updated;
}

export function getLanguageByName(name: string): LanguageItem | undefined {
  if (!name) return undefined;
  const list = getStoredLanguages();
  const normalized = name.trim().toLowerCase();
  return list.find((l) => l.name.toLowerCase() === normalized || l.id.toLowerCase() === normalized);
}

// ==========================================
// LLM MODEL BLUEPRINTS CRUD
// ==========================================
export function getStoredLLMModelBlueprints(): LLMModelBlueprint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LLM_MODEL_BLUEPRINTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.LLM_MODEL_BLUEPRINTS, JSON.stringify(DEFAULT_LLM_MODEL_BLUEPRINTS));
      return DEFAULT_LLM_MODEL_BLUEPRINTS;
    }
    const list: LLMModelBlueprint[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) {
      return DEFAULT_LLM_MODEL_BLUEPRINTS;
    }
    // Ensure default models (including Web Assist models) are present
    const map = new Map<string, LLMModelBlueprint>();
    list.forEach((m) => map.set(m.id, m));
    DEFAULT_LLM_MODEL_BLUEPRINTS.forEach((def) => {
      if (!map.has(def.id)) {
        map.set(def.id, def);
      }
    });
    return Array.from(map.values());
  } catch (err) {
    console.error('Failed to parse stored LLM model blueprints:', err);
    return DEFAULT_LLM_MODEL_BLUEPRINTS;
  }
}

export function saveLLMModelBlueprints(blueprints: LLMModelBlueprint[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LLM_MODEL_BLUEPRINTS, JSON.stringify(blueprints));
  } catch (err) {
    console.error('Failed to save LLM model blueprints:', err);
  }
}

export function saveLLMModelBlueprint(modelBp: LLMModelBlueprint): LLMModelBlueprint[] {
  const all = getStoredLLMModelBlueprints();
  const index = all.findIndex((m) => m.id === modelBp.id);
  let updated: LLMModelBlueprint[];
  if (index >= 0) {
    updated = [...all];
    updated[index] = { ...modelBp, updatedAt: new Date().toISOString() };
  } else {
    updated = [...all, { ...modelBp, createdAt: modelBp.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }];
  }
  saveLLMModelBlueprints(updated);
  return updated;
}

export function deleteLLMModelBlueprint(id: string): LLMModelBlueprint[] {
  const all = getStoredLLMModelBlueprints().filter((m) => m.id !== id);
  saveLLMModelBlueprints(all);
  return all;
}

export function getLLMModelBlueprintById(id?: string): LLMModelBlueprint | undefined {
  if (!id) return undefined;
  const list = getStoredLLMModelBlueprints();
  return list.find((m) => m.id === id);
}

/**
 * Resolves the effective LLMConfig for any query blueprint or translation action.
 * If modelBlueprintId is provided, extracts provider, modelName, API keys, and endpoint
 * so that any edit to the LLMModelBlueprint immediately updates all referencing queries.
 */
export function resolveLLMConfigForBlueprint(
  modelBlueprintId?: string,
  fallbackConfig?: LLMConfig
): LLMConfig {
  const baseConfig = fallbackConfig || getLLMConfig();
  if (!modelBlueprintId) return baseConfig;

  const modelBp = getLLMModelBlueprintById(modelBlueprintId);
  if (!modelBp) return baseConfig;

  return {
    ...baseConfig,
    provider: modelBp.provider || baseConfig.provider,
    modelName: modelBp.modelName || baseConfig.modelName,
    customApiKey: modelBp.customApiKey !== undefined && modelBp.customApiKey !== '' ? modelBp.customApiKey : baseConfig.customApiKey,
    customBaseUrl: modelBp.customBaseUrl !== undefined && modelBp.customBaseUrl !== '' ? modelBp.customBaseUrl : baseConfig.customBaseUrl,
    requestJsonTemplate: modelBp.requestJsonTemplate !== undefined && modelBp.requestJsonTemplate !== '' ? modelBp.requestJsonTemplate : baseConfig.requestJsonTemplate,
    activeCustomProviderId: modelBp.activeCustomProviderId !== undefined ? modelBp.activeCustomProviderId : baseConfig.activeCustomProviderId,
  };
}

// ==========================================
// CROSS-TEXT LANGUAGE GLOSS DICTIONARY CRUD
// ==========================================
// Stored as a map of language -> Record<cleanOrigWord, LanguageWordGloss>
export function getStoredAllLanguageGlosses(): Record<string, Record<string, LanguageWordGloss>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LANGUAGE_GLOSSES);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Failed to parse language glosses:', err);
    return {};
  }
}

export function getLanguageGlossDictionary(language: string): Record<string, LanguageWordGloss> {
  if (!language) return {};
  const all = getStoredAllLanguageGlosses();
  const normalizedLang = language.trim().toLowerCase();
  return all[normalizedLang] || all[language] || {};
}

export function saveLanguageWordGloss(gloss: LanguageWordGloss): void {
  if (!gloss || !gloss.language || !gloss.cleanOrig) return;
  try {
    const all = getStoredAllLanguageGlosses();
    const langKey = gloss.language.trim().toLowerCase();
    if (!all[langKey]) {
      all[langKey] = {};
    }
    const cleanWordKey = gloss.cleanOrig.trim().toLowerCase();
    all[langKey][cleanWordKey] = {
      ...gloss,
      cleanOrig: cleanWordKey,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.LANGUAGE_GLOSSES, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to save language word gloss:', err);
  }
}

export function deleteLanguageWordGloss(language: string, cleanOrig: string): void {
  if (!language || !cleanOrig) return;
  try {
    const all = getStoredAllLanguageGlosses();
    const langKey = language.trim().toLowerCase();
    const wordKey = cleanOrig.trim().toLowerCase();
    if (all[langKey] && all[langKey][wordKey]) {
      delete all[langKey][wordKey];
      localStorage.setItem(STORAGE_KEYS.LANGUAGE_GLOSSES, JSON.stringify(all));
    }
  } catch (err) {
    console.error('Failed to delete language word gloss:', err);
  }
}

export function getLanguageGlossesForLanguage(language: string): LanguageWordGloss[] {
  const dict = getLanguageGlossDictionary(language);
  return Object.values(dict);
}

/**
 * Applies the stored language dictionary words to an existing MirrorTranslationData object.
 * Returns the updated MirrorTranslationData.
 */
export function applyLanguageGlossDictionaryToMirrorData(
  mirrorData: MirrorTranslationData,
  language: string
): { updatedData: MirrorTranslationData; appliedCount: number } {
  if (!mirrorData || !Array.isArray(mirrorData.paragraphs) || !language) {
    return { updatedData: mirrorData, appliedCount: 0 };
  }
  const dict = getLanguageGlossDictionary(language);
  if (Object.keys(dict).length === 0) {
    return { updatedData: mirrorData, appliedCount: 0 };
  }

  let appliedCount = 0;
  const newParagraphs = mirrorData.paragraphs.map((para) => {
    if (!para || !Array.isArray(para.words)) return para;
    const newWords = para.words.map((pair) => {
      const cleanKey = (pair.cleanOrig || cleanWordToken(pair.orig)).toLowerCase();
      const matchedGloss = dict[cleanKey];
      if (matchedGloss) {
        appliedCount++;
        return {
          ...pair,
          trans: matchedGloss.trans || pair.trans,
          cleanTrans: matchedGloss.trans || pair.cleanTrans,
          keepOrig: matchedGloss.keepOrig !== undefined ? matchedGloss.keepOrig : pair.keepOrig,
          composite: matchedGloss.compoundMeaning && pair.composite
            ? { ...pair.composite, compoundMeaning: matchedGloss.compoundMeaning }
            : pair.composite,
        };
      }
      return pair;
    });
    return { ...para, words: newWords };
  });

  const updatedData: MirrorTranslationData = {
    ...mirrorData,
    paragraphs: newParagraphs,
    updatedAt: new Date().toISOString(),
  };

  return { updatedData, appliedCount };
}

/**
 * Propagates the language dictionary across ALL stored texts and mirror translations of that language specification.
 */
export function applyLanguageGlossDictionaryToAllTexts(language: string): {
  updatedTextsCount: number;
  updatedWordsCount: number;
} {
  if (!language) return { updatedTextsCount: 0, updatedWordsCount: 0 };
  const texts = getStoredTexts();
  const normalizedTargetLang = language.trim().toLowerCase();
  const matchedTexts = texts.filter(
    (t) => (t.language || 'German').trim().toLowerCase() === normalizedTargetLang
  );

  let totalUpdatedWords = 0;
  let totalUpdatedTexts = 0;
  const storedMirrors = getStoredMirrorTranslations();

  for (const textItem of matchedTexts) {
    const existingMirror = storedMirrors[textItem.id];
    if (existingMirror) {
      const { updatedData, appliedCount } = applyLanguageGlossDictionaryToMirrorData(
        existingMirror,
        language
      );
      if (appliedCount > 0) {
        saveMirrorTranslation(updatedData);
        totalUpdatedWords += appliedCount;
        totalUpdatedTexts++;
      }
    }
  }

  return { updatedTextsCount: totalUpdatedTexts, updatedWordsCount: totalUpdatedWords };
}

// TEXTS CRUD
export function getStoredTexts(): TextItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TEXTS);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to parse stored texts:', err);
    return [];
  }
}

export function saveTexts(texts: TextItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TEXTS, JSON.stringify(texts));
  } catch (err) {
    console.error('Failed to save texts:', err);
  }
}

export function saveTextItem(text: TextItem): TextItem[] {
  const texts = getStoredTexts();
  const index = texts.findIndex((t) => t.id === text.id);
  let updated: TextItem[];
  if (index >= 0) {
    updated = [...texts];
    updated[index] = { ...text, updatedAt: new Date().toISOString() };
  } else {
    updated = [{ ...text, createdAt: text.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }, ...texts];
  }
  saveTexts(updated);
  return updated;
}

export function touchTextUpdatedAt(textId: string, timestamp = new Date().toISOString()): TextItem[] {
  if (!textId || textId === 'playground-text') return getStoredTexts();
  const texts = getStoredTexts();
  const index = texts.findIndex((t) => t.id === textId);
  if (index >= 0) {
    const updated = [...texts];
    updated[index] = { ...updated[index], updatedAt: timestamp };
    saveTexts(updated);
    return updated;
  }
  return texts;
}

export function deleteTextItem(id: string): TextItem[] {
  const texts = getStoredTexts().filter((t) => t.id !== id);
  saveTexts(texts);
  return texts;
}

// SCROLL POSITIONS CRUD
export interface StoredScrollState {
  scrollY: number;
  paraIndex?: number;
  wordIndex?: number;
  lineIndex?: number;
  updatedAt?: string;
}

export function getStoredScrollPositions(): Record<string, any> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SCROLL_POSITIONS);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Failed to parse stored scroll positions:', err);
    return {};
  }
}

export function getStoredScrollState(textId: string): StoredScrollState {
  if (!textId) return { scrollY: 0, paraIndex: 0, wordIndex: 0, lineIndex: 0 };
  const positions = getStoredScrollPositions();
  const val = positions[textId];
  if (typeof val === 'number') {
    return { scrollY: val, paraIndex: 0, wordIndex: 0, lineIndex: 0 };
  }
  if (val && typeof val === 'object') {
    return {
      scrollY: typeof val.scrollY === 'number' ? val.scrollY : 0,
      paraIndex: typeof val.paraIndex === 'number' ? val.paraIndex : 0,
      wordIndex: typeof val.wordIndex === 'number' ? val.wordIndex : 0,
      lineIndex: typeof val.lineIndex === 'number' ? val.lineIndex : 0,
      updatedAt: val.updatedAt,
    };
  }
  // Fallback to text item property if available
  const texts = getStoredTexts();
  const matched = texts.find((t) => t.id === textId);
  return { scrollY: matched?.scrollPosition || 0, paraIndex: 0, wordIndex: 0, lineIndex: 0 };
}

export function getStoredScrollPosition(textId: string): number {
  return getStoredScrollState(textId).scrollY;
}

export function saveStoredScrollState(
  textId: string, 
  state: { scrollY: number; paraIndex?: number; wordIndex?: number; lineIndex?: number }
): void {
  if (!textId) return;
  try {
    const positions = getStoredScrollPositions();
    positions[textId] = {
      scrollY: Math.max(0, Math.round(state.scrollY)),
      paraIndex: typeof state.paraIndex === 'number' ? state.paraIndex : 0,
      wordIndex: typeof state.wordIndex === 'number' ? state.wordIndex : 0,
      lineIndex: typeof state.lineIndex === 'number' ? state.lineIndex : 0,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.SCROLL_POSITIONS, JSON.stringify(positions));
  } catch (err) {
    console.error('Failed to save scroll state:', err);
  }
}

export function saveStoredScrollPosition(textId: string, position: number): void {
  saveStoredScrollState(textId, { scrollY: position, paraIndex: 0, wordIndex: 0, lineIndex: 0 });
}

// BLUEPRINTS CRUD
export function getStoredBlueprints(): QueryBlueprint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BLUEPRINTS);
    if (!raw) return DEFAULT_BLUEPRINTS;
    const list: QueryBlueprint[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return DEFAULT_BLUEPRINTS;
    // Ensure all default blueprints (including Web UI Assist blueprints) are present
    const map = new Map<string, QueryBlueprint>();
    list.forEach((b) => map.set(b.id, b));
    DEFAULT_BLUEPRINTS.forEach((def) => {
      if (!map.has(def.id)) {
        map.set(def.id, def);
      }
    });
    return Array.from(map.values());
  } catch (err) {
    console.error('Failed to parse stored blueprints:', err);
    return DEFAULT_BLUEPRINTS;
  }
}

export function saveBlueprints(blueprints: QueryBlueprint[]): void {
  try {
    const cleaned = blueprints.map((b) => {
      const copy = { ...b };
      if (!copy.modelBlueprintId) {
        delete copy.modelBlueprintId;
      }
      return copy;
    });
    localStorage.setItem(STORAGE_KEYS.BLUEPRINTS, JSON.stringify(cleaned));
  } catch (err) {
    console.error('Failed to save blueprints:', err);
  }
}

export function saveBlueprintItem(bp: QueryBlueprint): QueryBlueprint[] {
  const blueprints = getStoredBlueprints();
  const index = blueprints.findIndex((b) => b.id === bp.id);
  let updated: QueryBlueprint[];
  const itemToSave: QueryBlueprint = {
    ...bp,
    updatedAt: bp.updatedAt || new Date().toISOString(),
  };
  if (!itemToSave.modelBlueprintId) {
    delete itemToSave.modelBlueprintId;
  }
  if (index >= 0) {
    updated = [...blueprints];
    updated[index] = itemToSave;
  } else {
    updated = [...blueprints, itemToSave];
  }
  saveBlueprints(updated);
  return updated;
}

export function deleteBlueprintItem(id: string): QueryBlueprint[] {
  const blueprints = getStoredBlueprints().filter((b) => b.id !== id);
  saveBlueprints(blueprints);
  return blueprints;
}

// ANNOTATIONS
export function getStoredAnnotations(textId?: string): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ANNOTATIONS);
    const all: Annotation[] = raw ? JSON.parse(raw) : [];
    if (textId) {
      return all.filter((a) => a.textId === textId);
    }
    return all;
  } catch (err) {
    console.error('Failed to parse annotations:', err);
    return [];
  }
}

export function saveAnnotation(annotation: Annotation): Annotation[] {
  const all = getStoredAnnotations();
  const existingByIdIndex = all.findIndex((a) => a.id === annotation.id);

  let updated: Annotation[];
  if (existingByIdIndex >= 0) {
    // Update existing specific annotation
    updated = [...all];
    updated[existingByIdIndex] = annotation;
  } else {
    // Add new translation version to collection
    updated = [annotation, ...all];
  }

  try {
    localStorage.setItem(STORAGE_KEYS.ANNOTATIONS, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save annotation:', err);
  }

  // Update parent text's updatedAt timestamp to reflect newest translation
  if (annotation.textId && annotation.textId !== 'playground-text') {
    touchTextUpdatedAt(annotation.textId, annotation.createdAt || new Date().toISOString());
  }

  return updated;
}

export function updateAnnotationConversation(annotationId: string, conversation: TranslationChatMessage[]): Annotation[] {
  const all = getStoredAnnotations();
  const index = all.findIndex((a) => a.id === annotationId);
  if (index >= 0) {
    all[index] = {
      ...all[index],
      conversation,
    };
    try {
      localStorage.setItem(STORAGE_KEYS.ANNOTATIONS, JSON.stringify(all));
    } catch (err) {
      console.error('Failed to update annotation conversation:', err);
    }
  }
  return all;
}

export function deleteAnnotation(id: string): Annotation[] {
  const all = getStoredAnnotations().filter((a) => a.id !== id);
  try {
    localStorage.setItem(STORAGE_KEYS.ANNOTATIONS, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to delete annotation:', err);
  }
  return all;
}

// LLM CONFIG
export function getLLMConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LLM_CONFIG);
    if (!raw) return DEFAULT_LLM_CONFIG;
    const parsed: LLMConfig = JSON.parse(raw);
    // Automatically upgrade legacy default models to gemini-3.7-flash
    if (parsed.provider === 'built-in-gemini' && (parsed.modelName === 'gemini-3.6-flash' || parsed.modelName === 'gemini-2.5-flash' || parsed.modelName === 'gemini-1.5-flash')) {
      parsed.modelName = 'gemini-3.7-flash';
      saveLLMConfig(parsed);
    }
    return parsed;
  } catch (err) {
    return DEFAULT_LLM_CONFIG;
  }
}

export function saveLLMConfig(config: LLMConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LLM_CONFIG, JSON.stringify(config));
    if (config.modelName) {
      addStoredModelPreset(config.modelName);
    }
  } catch (err) {
    console.error('Failed to save LLM config:', err);
  }
}

// MODEL IDENTIFIER PRESETS
export const DEFAULT_MODEL_PRESETS: string[] = [
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.5-sonnet',
  'deepseek/deepseek-r1',
  'deepseek/deepseek-chat',
  'meta-llama/llama-3.3-70b-instruct',
  'google/gemini-2.5-flash',
  'qwen/qwen-2.5-72b-instruct',
  'mistralai/mistral-large-2411',
  'gemini-3.7-flash',
  'llama-3.3-70b-versatile',
  'gpt-4o-mini',
];

export function getStoredModelPresets(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MODEL_PRESETS);
    if (!raw) return DEFAULT_MODEL_PRESETS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const combined = [...parsed];
      for (const def of DEFAULT_MODEL_PRESETS) {
        if (!combined.some((item) => item.toLowerCase() === def.toLowerCase())) {
          combined.push(def);
        }
      }
      return combined;
    }
    return DEFAULT_MODEL_PRESETS;
  } catch {
    return DEFAULT_MODEL_PRESETS;
  }
}

export function addStoredModelPreset(modelName: string): string[] {
  const trimmed = (modelName || '').trim();
  if (!trimmed) return getStoredModelPresets();
  try {
    const current = getStoredModelPresets();
    const filtered = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...filtered].slice(0, 35);
    localStorage.setItem(STORAGE_KEYS.MODEL_PRESETS, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to add model preset:', err);
    return getStoredModelPresets();
  }
}

export function removeStoredModelPreset(modelName: string): string[] {
  const trimmed = (modelName || '').trim();
  if (!trimmed) return getStoredModelPresets();
  try {
    const current = getStoredModelPresets();
    const updated = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
    localStorage.setItem(STORAGE_KEYS.MODEL_PRESETS, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to remove model preset:', err);
    return getStoredModelPresets();
  }
}

// DECIPHER INTERACTIVE CHAT CACHE
export function getAllStoredDecipherChats(): Record<string, TranslationChatMessage[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DECIPHER_CHATS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function mergeImportedDecipherChats(chats: Record<string, TranslationChatMessage[]>): void {
  if (!chats || typeof chats !== 'object') return;
  try {
    const current = getAllStoredDecipherChats();
    const merged = { ...current, ...chats };
    localStorage.setItem(STORAGE_KEYS.DECIPHER_CHATS, JSON.stringify(merged));
  } catch (err) {
    console.error('Failed to merge imported decipher chats:', err);
  }
}

export function getStoredDecipherChat(targetText: string): TranslationChatMessage[] {
  if (!targetText) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DECIPHER_CHATS);
    if (!raw) return [];
    const all = JSON.parse(raw);
    const key = targetText.trim().toLowerCase();
    return Array.isArray(all[key]) ? all[key] : [];
  } catch {
    return [];
  }
}

export function saveDecipherChat(targetText: string, conversation: TranslationChatMessage[]): void {
  if (!targetText) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DECIPHER_CHATS);
    const all = raw ? JSON.parse(raw) : {};
    const key = targetText.trim().toLowerCase();
    if (conversation && conversation.length > 0) {
      all[key] = conversation;
    } else {
      delete all[key];
    }
    localStorage.setItem(STORAGE_KEYS.DECIPHER_CHATS, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to save decipher chat:', err);
  }
}

// READER SETTINGS
export function getReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.READER_SETTINGS);
    return raw ? JSON.parse(raw) : DEFAULT_READER_SETTINGS;
  } catch (err) {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.READER_SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save reader settings:', err);
  }
}

// MIRROR TRANSLATIONS CRUD
export function getStoredMirrorTranslations(): Record<string, MirrorTranslationData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MIRROR_TRANSLATIONS);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Failed to parse mirror translations:', err);
    return {};
  }
}

export function getStoredMirrorTranslation(textId: string): MirrorTranslationData | null {
  if (!textId) return null;
  const all = getStoredMirrorTranslations();
  return all[textId] || null;
}

export function saveMirrorTranslation(data: MirrorTranslationData): void {
  if (!data || !data.textId) return;
  try {
    const all = getStoredMirrorTranslations();
    all[data.textId] = {
      ...data,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.MIRROR_TRANSLATIONS, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to save mirror translation:', err);
  }
}

export function deleteMirrorTranslation(textId: string): void {
  if (!textId) return;
  try {
    const all = getStoredMirrorTranslations();
    delete all[textId];
    localStorage.setItem(STORAGE_KEYS.MIRROR_TRANSLATIONS, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to delete mirror translation:', err);
  }
}

// CALQUE HISTORY CRUD
export function getStoredCalqueHistory(textId?: string): CalqueHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CALQUE_HISTORY);
    const list: CalqueHistoryEntry[] = raw ? JSON.parse(raw) : [];
    if (textId) {
      return list.filter((item) => item.textId === textId);
    }
    return list;
  } catch (err) {
    console.error('Failed to parse calque history:', err);
    return [];
  }
}

export function saveCalqueHistoryEntry(entry: CalqueHistoryEntry): CalqueHistoryEntry[] {
  if (!entry || !entry.id || !entry.textId) return getStoredCalqueHistory();
  try {
    const all = getStoredCalqueHistory();
    const existingIndex = all.findIndex((item) => item.id === entry.id);
    let updated: CalqueHistoryEntry[];
    if (existingIndex >= 0) {
      updated = [...all];
      updated[existingIndex] = entry;
    } else {
      updated = [entry, ...all];
    }
    // Cap total history entries across app to 200 items to avoid localStorage bloat
    if (updated.length > 200) {
      updated = updated.slice(0, 200);
    }
    localStorage.setItem(STORAGE_KEYS.CALQUE_HISTORY, JSON.stringify(updated));
    return updated.filter((item) => item.textId === entry.textId);
  } catch (err) {
    console.error('Failed to save calque history entry:', err);
    return getStoredCalqueHistory(entry.textId);
  }
}

export function updateCalqueHistoryConversation(entryId: string, conversation: TranslationChatMessage[]): CalqueHistoryEntry[] {
  const all = getStoredCalqueHistory();
  const index = all.findIndex((item) => item.id === entryId);
  if (index >= 0) {
    all[index] = {
      ...all[index],
      conversation,
    };
    try {
      localStorage.setItem(STORAGE_KEYS.CALQUE_HISTORY, JSON.stringify(all));
    } catch (err) {
      console.error('Failed to update calque conversation:', err);
    }
  }
  return all;
}

export function deleteCalqueHistoryEntry(id: string): CalqueHistoryEntry[] {
  if (!id) return getStoredCalqueHistory();
  try {
    const all = getStoredCalqueHistory();
    const target = all.find((item) => item.id === id);
    const updated = all.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEYS.CALQUE_HISTORY, JSON.stringify(updated));
    if (target?.textId) {
      return updated.filter((item) => item.textId === target.textId);
    }
    return updated;
  } catch (err) {
    console.error('Failed to delete calque history entry:', err);
    return getStoredCalqueHistory();
  }
}

export function clearCalqueHistory(textId?: string): void {
  try {
    if (textId) {
      const all = getStoredCalqueHistory();
      const updated = all.filter((item) => item.textId !== textId);
      localStorage.setItem(STORAGE_KEYS.CALQUE_HISTORY, JSON.stringify(updated));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CALQUE_HISTORY);
    }
  } catch (err) {
    console.error('Failed to clear calque history:', err);
  }
}

// CALQUE PROMPTS CRUD
export const DEFAULT_CALQUE_PROMPTS: CalquePromptTemplate[] = [
  {
    id: 'prompt-default-token-optimized',
    title: 'Standard Philological Calque (Default)',
    description: 'Strict 1:1 word-for-word alignment, hyphenated compounds, and discontinuous separable verb [id:compound] tags.',
    prompt: `You are an expert philological calque translator. Translate the text word-by-word into English preserving exact original syntax and order.
Rules:
1. Exact 1-to-1 word alignment.
2. Compound words in the original should be translated into hyphenated English words (e.g., "violence-deed").
3. Separable verbs / discontinuous words must be annotated with bracketed IDs: first part as word[id:compound_meaning], subsequent parts as word[id].
4. Punctuation must be preserved attached to corresponding words.
5. Textual apparatus notes, manuscript variants, or editorial brackets in the source text (e.g., [RP: –], [RP: ὑμᾶς], [1], [note]) are NOT composite words. Maintain 1:1 token correspondence for all bracketed text and tokens.`,
    systemInstruction: `You are an expert philological calque translator. Always output ONLY the calque translation. Do not include markdown preamble or conversational fluff.`,
    createdAt: '2026-01-01T00:00:00.000Z',
    isDefault: true,
  },
  {
    id: 'prompt-literal-etymological',
    title: 'Strict Etymological Root Gloss',
    description: 'Emphasizes deep etymological root meanings of prefixes, stems, and morphological components.',
    prompt: `Provide an ultra-literal morphological and etymological calque of the provided source text.
Rules:
- Translate every morpheme and stem into its closest archaic or literal root meaning.
- Use hyphens for multi-morpheme compounds.
- Mark separable elements with [id:compound_meaning] and [id].
- Preserve verbatim syntax and word order.`,
    systemInstruction: `You are a specialist in comparative linguistics and historical etymology. Output ONLY the aligned calque.`,
    createdAt: '2026-01-01T00:00:00.000Z',
    isDefault: true,
  },
];

export function getStoredCalquePrompts(): CalquePromptTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CALQUE_PROMPTS);
    const list: CalquePromptTemplate[] = raw ? JSON.parse(raw) : [];
    if (list.length === 0) {
      localStorage.setItem(STORAGE_KEYS.CALQUE_PROMPTS, JSON.stringify(DEFAULT_CALQUE_PROMPTS));
      return DEFAULT_CALQUE_PROMPTS;
    }
    return list;
  } catch (err) {
    console.error('Failed to parse calque prompts:', err);
    return DEFAULT_CALQUE_PROMPTS;
  }
}

export function saveCalquePrompt(prompt: CalquePromptTemplate): CalquePromptTemplate[] {
  if (!prompt || !prompt.id) return getStoredCalquePrompts();
  try {
    const itemToSave: CalquePromptTemplate = { ...prompt };
    if (!itemToSave.modelBlueprintId) {
      delete itemToSave.modelBlueprintId;
    }
    const all = getStoredCalquePrompts();
    const existingIndex = all.findIndex((item) => item.id === itemToSave.id);
    let updated: CalquePromptTemplate[];
    if (existingIndex >= 0) {
      updated = [...all];
      updated[existingIndex] = itemToSave;
    } else {
      updated = [itemToSave, ...all];
    }
    localStorage.setItem(STORAGE_KEYS.CALQUE_PROMPTS, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save calque prompt:', err);
    return getStoredCalquePrompts();
  }
}

export function deleteCalquePrompt(id: string): CalquePromptTemplate[] {
  if (!id) return getStoredCalquePrompts();
  try {
    const all = getStoredCalquePrompts();
    const updated = all.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEYS.CALQUE_PROMPTS, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to delete calque prompt:', err);
    return getStoredCalquePrompts();
  }
}

// IMPORT / EXPORT DATA
export function exportAppData(): string {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    texts: getStoredTexts(),
    blueprints: getStoredBlueprints(),
    languages: getStoredLanguages(),
    llmModelBlueprints: getStoredLLMModelBlueprints(),
    languageGlosses: getStoredAllLanguageGlosses(),
    annotations: getStoredAnnotations(),
    decipherChats: getAllStoredDecipherChats(),
    webAssistSites: getStoredWebAssistSites(),
    mirrorTranslations: getStoredMirrorTranslations(),
    calqueHistory: getStoredCalqueHistory(),
    calquePrompts: getStoredCalquePrompts(),
    llmConfig: getLLMConfig(),
  };
  return JSON.stringify(data, null, 2);
}

export function importAppData(jsonString: string): {
  success: boolean;
  message: string;
} {
  try {
    const data = JSON.parse(jsonString);

    // [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
    // If the imported JSON is specifically a raw decipher chats backup dictionary:
    if (data && typeof data === 'object' && !data.texts && !data.blueprints && !data.annotations) {
      if (data.decipherChats && typeof data.decipherChats === 'object') {
        mergeImportedDecipherChats(data.decipherChats);
        return { success: true, message: 'Translation chats imported and merged successfully!' };
      }
      const entries = Object.entries(data);
      const isChatsDict = entries.length > 0 && entries.every(([_, val]) => Array.isArray(val));
      if (isChatsDict) {
        mergeImportedDecipherChats(data as Record<string, TranslationChatMessage[]>);
        return { success: true, message: `Successfully imported ${entries.length} translation chat conversation(s)!` };
      }
    }

    if (data.texts && Array.isArray(data.texts)) {
      saveTexts(data.texts);
    }
    if (data.blueprints && Array.isArray(data.blueprints)) {
      saveBlueprints(data.blueprints);
    }
    if (data.languages && Array.isArray(data.languages)) {
      saveLanguages(data.languages);
    }
    if (data.llmModelBlueprints && Array.isArray(data.llmModelBlueprints)) {
      saveLLMModelBlueprints(data.llmModelBlueprints);
    }
    if (data.languageGlosses && typeof data.languageGlosses === 'object') {
      localStorage.setItem(STORAGE_KEYS.LANGUAGE_GLOSSES, JSON.stringify(data.languageGlosses));
    }
    if (data.annotations && Array.isArray(data.annotations)) {
      localStorage.setItem(STORAGE_KEYS.ANNOTATIONS, JSON.stringify(data.annotations));
    }
    if (data.decipherChats && typeof data.decipherChats === 'object') {
      mergeImportedDecipherChats(data.decipherChats);
    }
    if (data.mirrorTranslations && typeof data.mirrorTranslations === 'object') {
      localStorage.setItem(STORAGE_KEYS.MIRROR_TRANSLATIONS, JSON.stringify(data.mirrorTranslations));
    }
    if (data.calqueHistory && Array.isArray(data.calqueHistory)) {
      localStorage.setItem(STORAGE_KEYS.CALQUE_HISTORY, JSON.stringify(data.calqueHistory));
    }
    if (data.calquePrompts && Array.isArray(data.calquePrompts)) {
      localStorage.setItem(STORAGE_KEYS.CALQUE_PROMPTS, JSON.stringify(data.calquePrompts));
    }
    if (data.webAssistSites && Array.isArray(data.webAssistSites)) {
      saveStoredWebAssistSites(data.webAssistSites);
    }
    if (data.llmConfig) {
      saveLLMConfig(data.llmConfig);
    }
    return { success: true, message: 'Data imported successfully!' };
  } catch (err: any) {
    return { success: false, message: `Import failed: ${err.message}` };
  }
}

// WEB ASSIST SITES MANAGEMENT
export function getStoredWebAssistSites(): WebAssistSite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WEB_ASSIST_SITES);
    if (!raw) return DEFAULT_WEB_ASSIST_SITES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WEB_ASSIST_SITES;
    
    // Ensure all default sites are present if not explicitly removed
    const map = new Map<string, WebAssistSite>();
    parsed.forEach((s) => map.set(s.id, s));
    DEFAULT_WEB_ASSIST_SITES.forEach((def) => {
      if (!map.has(def.id)) {
        map.set(def.id, def);
      }
    });
    return Array.from(map.values());
  } catch {
    return DEFAULT_WEB_ASSIST_SITES;
  }
}

export function saveStoredWebAssistSites(sites: WebAssistSite[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WEB_ASSIST_SITES, JSON.stringify(sites));
  } catch (err) {
    console.error('Failed to save web assist sites:', err);
  }
}

export function addCustomWebAssistSite(site: Omit<WebAssistSite, 'id'>): WebAssistSite[] {
  const current = getStoredWebAssistSites();
  const id = `web-site-${Date.now()}`;
  const newSite: WebAssistSite = {
    ...site,
    id,
    isCustom: true,
  };
  const updated = [...current, newSite];
  saveStoredWebAssistSites(updated);
  return updated;
}

export function deleteCustomWebAssistSite(id: string): WebAssistSite[] {
  const current = getStoredWebAssistSites();
  const updated = current.filter((s) => s.id !== id);
  saveStoredWebAssistSites(updated);
  return updated;
}
