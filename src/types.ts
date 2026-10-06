export type BlueprintType = 'word' | 'passage';

export interface LanguageItem {
  id: string; // e.g. "german", "hebrew", "latin", "ancient-greek", or "custom-xyz"
  name: string; // "German", "Hebrew", "Ancient Greek", "Latin", etc.
  code?: string; // "de", "he", "grc", "la", "sa", etc.
  isRTL?: boolean; // true for Hebrew, Arabic, Aramaic, etc.
  description?: string;
  isCustom?: boolean;
  createdAt?: string;
}

export interface LanguageWordGloss {
  orig: string; // The original word token or clean form
  cleanOrig: string; // Normalized lowercase clean word without punctuation
  trans: string; // Translated word or gloss
  keepOrig?: boolean; // When true, keep original untranslated in mirror view
  compoundMeaning?: string; // Compound or idiomatic meaning if composite
  notes?: string;
  language: string; // Language name or id, e.g. "German"
  updatedAt: string;
}

export interface LLMModelBlueprint {
  id: string;
  name: string; // e.g., "Gemini 3.7 Flash (Default)", "Llama 3.3 70B Versatile"
  description?: string;
  provider: LLMProviderType;
  modelName: string;
  customApiKey?: string;
  customBaseUrl?: string;
  requestJsonTemplate?: string;
  systemInstruction?: string;
  temperature?: number;
  customHeaders?: Record<string, string>;
  activeCustomProviderId?: string;
  webSiteUrl?: string; // Target URL for web-assist provider (e.g. https://claude.ai/new)
  webSiteName?: string; // Display name of the web AI site (e.g. Claude.ai)
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebAssistSite {
  id: string;
  name: string; // "Claude.ai", "Google AI Studio", "ChatGPT", etc.
  url: string; // "https://claude.ai/new", "https://aistudio.google.com/prompts/new_chat", "https://chatgpt.com/"
  badgeColor?: string; // e.g. "purple", "blue", "emerald", "cyan", "amber"
  description?: string;
  isCustom?: boolean;
}

export interface QueryBlueprint {
  id: string;
  name: string;
  type: BlueprintType;
  template: string; // Must contain {word} for word, {text} for passage
  description?: string;
  isDefault?: boolean;
  language?: string; // Applicable language, e.g. "all", "German", "Hebrew", or custom language name
  modelBlueprintId?: string; // Reference to a named LLMModelBlueprint
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

export interface TranslationChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  createdAt?: string;
  modelUsed?: string;
  providerUsed?: string;
}

export interface Annotation {
  id: string;
  textId: string;
  type: BlueprintType;
  target: string; // The word tapped or passage selected
  blueprintId?: string;
  blueprintName: string;
  modelBlueprintId?: string;
  modelBlueprintName?: string;
  queryUsed: string;
  result: string;
  createdAt: string; // ISO date timestamp
  modelUsed?: string; // Serving model (e.g., 'gemini-3.7-flash', 'llama-3.3-70b-versatile')
  providerUsed?: string; // Provider (e.g., 'built-in-gemini', 'openrouter', 'groq')
  language?: string;
  conversation?: TranslationChatMessage[];
}

export type LLMProviderType = 
  | 'built-in-gemini'
  | 'custom-gemini'
  | 'groq'
  | 'openrouter'
  | 'custom-openai'
  | 'web-assist'
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
  maxTokens?: number;
  temperature?: number;
  customRequestPayload?: any;
  webSiteUrl?: string; // Target URL for web-assist provider (e.g. https://claude.ai/new)
  webSiteName?: string; // Display name of the web AI site (e.g. Claude.ai)
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
  id: string; // Group ID, e.g. "s0_1", "s1_1", or "auszeichnen"
  rawTagId?: string; // Original notation tag written in brackets, e.g. "1", "2"
  sentenceIndex?: number; // 0-based sentence index within paragraph
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
  blueprintId?: string;
  blueprintName?: string;
  modelBlueprintId?: string;
  modelBlueprintName?: string;
  updatedAt: string;
  untranslatedWords?: string[]; // Lowercase list of words marked to always stay untranslated in mirror mode
  passageReplacements?: MirrorPassageReplacement[]; // Custom multi-word passage translation overrides
  compositeDisplayMode?: 'separated' | 'compound'; // Global preference for composite word display in mirror mode
  historyEntryId?: string; // ID of active history entry if linked
  conversation?: TranslationChatMessage[];
}

export interface CalqueHistoryEntry {
  id: string;
  textId: string;
  title?: string;
  createdAt: string;
  source: 'ai-generation' | 'manual-import' | 'manual-edit' | 'sample-default' | 'manual-snapshot' | 'web-assist';
  modelUsed?: string;
  rawCalqueText: string;
  blueprintId?: string;
  blueprintName?: string;
  modelBlueprintId?: string;
  modelBlueprintName?: string;
  promptUsed?: string;
  systemInstruction?: string;
  notes?: string;
  compositeCount?: number;
  wordCount?: number;
  mirrorData?: MirrorTranslationData;
  conversation?: TranslationChatMessage[];
}

export interface CalquePromptTemplate {
  id: string;
  title: string;
  description?: string;
  prompt: string;
  systemInstruction?: string;
  createdAt: string;
  isDefault?: boolean;
  isCustom?: boolean;
  language?: string; // Applicable language, e.g. "all", "German", "Hebrew"
  modelBlueprintId?: string; // Reference to a named LLMModelBlueprint
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
