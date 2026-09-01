export type BlueprintType = 'word' | 'passage';

export interface QueryBlueprint {
  id: string;
  name: string;
  type: BlueprintType;
  template: string; // Must contain {word} for word, {text} for passage
  description?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TextItem {
  id: string;
  title: string;
  author?: string;
  language: string;
  content: string;
  wordBlueprintId: string;
  passageBlueprintId: string;
  tags?: string[];
  notes?: string;
  scrollPosition?: number; // Last scrolled Y position for reading resumption
  createdAt: string;
  updatedAt: string;
}

export interface Annotation {
  id: string;
  textId: string;
  type: BlueprintType;
  target: string; // The word tapped or passage selected
  blueprintName: string;
  queryUsed: string;
  result: string;
  createdAt: string; // ISO date timestamp
  modelUsed?: string; // Serving model (e.g., 'gemini-3.6-flash', 'llama-3.3-70b-versatile')
  providerUsed?: string; // Provider (e.g., 'built-in-gemini', 'openrouter', 'groq')
}

export type LLMProviderType = 
  | 'built-in-gemini'
  | 'custom-gemini'
  | 'groq'
  | 'openrouter'
  | 'custom-openai'
  | string;

export interface CustomProviderConfig {
  id: string;
  name: string;
  baseUrl: string; // e.g. "http://localhost:11434/v1/chat/completions"
  apiKey?: string;
  defaultModel: string;
  requestJsonTemplate?: string;
  customHeaders?: Record<string, string>;
  createdAt?: string;
}

export interface LLMConfig {
  provider: LLMProviderType;
  customApiKey?: string;
  modelName: string;
  customBaseUrl?: string;
  requestJsonTemplate?: string;
  customProviders?: CustomProviderConfig[];
  activeCustomProviderId?: string;
}

export type ReaderTheme = 'parchment' | 'obsidian' | 'sepia' | 'emerald' | 'mystic';

export type MirrorDisplayMode = 'original' | 'mirror' | 'mirror-normalized-original' | 'interlinear';

export interface MirrorPassageReplacement {
  id: string;
  pIdx: number;
  startWIdx: number;
  endWIdx: number;
  origText: string;
  customTrans: string;
  createdAt: string;
}

export interface MirrorCompositePartner {
  pIdx: number;
  wIdx: number;
  orig: string;
  cleanOrig?: string;
  separatedMeaning: string;
}

export interface MirrorCompositeLink {
  id: string; // Group ID, e.g. "1", "2", "auszeichnen"
  groupIndex?: number; // Numeric 1, 2, 3 for color-coding and badges
  partIndex: number; // 0 for head/first part, 1 for particle/second part, etc.
  totalParts: number; // Total parts in group (e.g. 2)
  compoundMeaning: string; // Combined idiomatic meaning, e.g. "distinguishes"
  separatedMeaning: string; // Literal token meaning, e.g. "draws" or "out"
  allPartsOrig: string[]; // e.g. ["zeichnet", "aus"]
  allPartsSeparated: string[]; // e.g. ["draws", "out"]
  partners?: MirrorCompositePartner[];
}

export interface MirrorWordPair {
  orig: string; // The original word with any attached punctuation
  trans: string; // The English calque / mirror counterpart
  cleanOrig?: string;
  cleanTrans?: string;
  keepOrig?: boolean; // When true, mirror mode displays the original word instead of English translation
  originalTrans?: string; // Cached previous translation if user toggles keepOrig or custom passage back
  passageReplacementId?: string; // ID of custom passage replacement if applicable
  composite?: MirrorCompositeLink; // Discontinuous composite link metadata (separable verbs / tmesis)
  preferCompoundInMirror?: boolean; // When true, mirror mode displays compound meaning instead of separated
}

export interface MirrorTranslationParagraph {
  paraIndex: number;
  words: MirrorWordPair[];
  rawMirrorText?: string;
}

export interface MirrorTranslationData {
  id: string; // textId
  textId: string;
  paragraphs: MirrorTranslationParagraph[];
  rawCalqueText?: string;
  sourceModel?: string;
  updatedAt: string;
  untranslatedWords?: string[]; // Lowercase list of words marked to always stay untranslated in mirror mode
  passageReplacements?: MirrorPassageReplacement[]; // Custom multi-word passage translation overrides
  compositeDisplayMode?: 'separated' | 'compound'; // Global preference for composite word display in mirror mode
}

export interface ReaderSettings {
  fontSize: number; // in px e.g. 18
  lineHeight: number; // e.g. 1.8
  fontFamily: 'serif' | 'sans' | 'mono';
  theme: ReaderTheme;
  autoDecipherSelection: boolean;
  mirrorDisplayMode?: MirrorDisplayMode;
  showMirrorOverlayDesktop?: boolean; // When true, show the floating mirror overlay bar on desktop as well
  compositeDisplayPreference?: 'separated' | 'compound'; // Preference for separated vs compound gloss in mirror
}

export interface QueryResult {
  text: string;
  providerUsed: string;
  modelUsed: string;
  rawRequestPayload?: any;
  rawResponsePayload?: any;
  error?: string;
}

export interface ActiveDecipherQuery {
  id: string;
  targetText: string;
  type: BlueprintType;
  blueprintId: string;
  blueprintName: string;
  prompt: string;
  status: 'loading' | 'completed' | 'error';
  streamText: string;
  result?: QueryResult;
  error?: string;
  startedAt: number;
}
