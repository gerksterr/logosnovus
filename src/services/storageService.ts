import { 
  TextItem, 
  QueryBlueprint, 
  Annotation, 
  LLMConfig, 
  ReaderSettings,
  MirrorTranslationData 
} from '../types';
import { DEFAULT_BLUEPRINTS, SAMPLE_TEXTS } from '../data/seedData';
import { getInitialSampleMirrorTranslation } from '../utils/mirrorTranslationUtils';

const STORAGE_KEYS = {
  TEXTS: 'symbolic_texts_v1',
  BLUEPRINTS: 'symbolic_blueprints_v1',
  ANNOTATIONS: 'symbolic_annotations_v1',
  LLM_CONFIG: 'symbolic_llm_config_v1',
  READER_SETTINGS: 'symbolic_reader_settings_v1',
  SCROLL_POSITIONS: 'symbolic_scroll_positions_v1',
  MIRROR_TRANSLATIONS: 'symbolic_mirror_translations_v1',
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
  llmConfig: LLMConfig;
  readerSettings: ReaderSettings;
} {
  let texts = getStoredTexts();
  if (texts.length === 0) {
    texts = SAMPLE_TEXTS;
    saveTexts(texts);
  }

  let blueprints = getStoredBlueprints();
  if (blueprints.length === 0) {
    blueprints = DEFAULT_BLUEPRINTS;
    saveBlueprints(blueprints);
  }

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

  return { texts, blueprints, llmConfig, readerSettings };
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
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to parse stored blueprints:', err);
    return [];
  }
}

export function saveBlueprints(blueprints: QueryBlueprint[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.BLUEPRINTS, JSON.stringify(blueprints));
  } catch (err) {
    console.error('Failed to save blueprints:', err);
  }
}

export function saveBlueprintItem(bp: QueryBlueprint): QueryBlueprint[] {
  const blueprints = getStoredBlueprints();
  const index = blueprints.findIndex((b) => b.id === bp.id);
  let updated: QueryBlueprint[];
  if (index >= 0) {
    updated = [...blueprints];
    updated[index] = { ...bp, updatedAt: new Date().toISOString() };
  } else {
    updated = [...blueprints, bp];
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
  } catch (err) {
    console.error('Failed to save LLM config:', err);
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

// IMPORT / EXPORT DATA
export function exportAppData(): string {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    texts: getStoredTexts(),
    blueprints: getStoredBlueprints(),
    annotations: getStoredAnnotations(),
    mirrorTranslations: getStoredMirrorTranslations(),
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
    if (data.texts && Array.isArray(data.texts)) {
      saveTexts(data.texts);
    }
    if (data.blueprints && Array.isArray(data.blueprints)) {
      saveBlueprints(data.blueprints);
    }
    if (data.annotations && Array.isArray(data.annotations)) {
      localStorage.setItem(STORAGE_KEYS.ANNOTATIONS, JSON.stringify(data.annotations));
    }
    if (data.mirrorTranslations && typeof data.mirrorTranslations === 'object') {
      localStorage.setItem(STORAGE_KEYS.MIRROR_TRANSLATIONS, JSON.stringify(data.mirrorTranslations));
    }
    if (data.llmConfig) {
      saveLLMConfig(data.llmConfig);
    }
    return { success: true, message: 'Data imported successfully!' };
  } catch (err: any) {
    return { success: false, message: `Import failed: ${err.message}` };
  }
}
