import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Sparkles, 
  Volume2, 
  Bookmark, 
  SlidersHorizontal, 
  ChevronDown, 
  RotateCcw, 
  Highlighter, 
  Check, 
  BookOpen, 
  X,
  Type,
  Sun,
  Moon,
  ArrowUp,
  ArrowRightLeft,
  Layers,
  Cpu,
  Globe
} from 'lucide-react';
import { 
  TextItem, 
  QueryBlueprint, 
  Annotation, 
  ReaderSettings, 
  ReaderTheme,
  MirrorTranslationData,
  MirrorWordPair,
  MirrorDisplayMode,
  MirrorPassageReplacement,
  LLMConfig,
  LLMModelBlueprint
} from '../types';
import { User } from 'firebase/auth';
import { ModelBlueprintSwitcher } from './ModelBlueprintSwitcher';
import { 
  getStoredScrollState, 
  saveStoredScrollState,
  getStoredMirrorTranslation,
  saveMirrorTranslation,
  deleteMirrorTranslation,
  getLLMConfig,
  saveLanguageWordGloss
} from '../services/storageService';
import {
  syncMirrorTranslationToCloud,
  deleteMirrorTranslationFromCloud
} from '../services/cloudSyncService';
import { 
  isRTLText, 
  cleanWordToken,
  normalizeForMatch,
  stripFormattingTags,
  parseParagraph,
  FormattedRun,
  applyRunsToMirrorWord,
  cleanCopiedReaderText,
  extractSelectionTextFromReader,
  splitTextIntoParagraphs,
  findPassageMatchesInParagraph,
  stripHebrewVowels,
  ParsedParagraph,
  ParsedWordToken
} from '../utils/textUtils';
import { PassageHighlightOverlay, PassageBoxInfo } from './PassageHighlightOverlay';
import { MirrorTranslationModal } from './MirrorTranslationModal';
import { parseMirrorCalqueText, getCompositeQueryWord, ensureMirrorCompositeSentenceScoping } from '../utils/mirrorTranslationUtils';
import { ReaderContextMenu, ContextMenuState } from './ReaderContextMenu';
import { MobileMirrorOverlay } from './MobileMirrorOverlay';
import { ReaderParagraphItem } from './reader/ReaderParagraphItem';
import { ReaderOptionsModal } from './reader/ReaderOptionsModal';

interface TextReaderViewProps {
  text: TextItem;
  blueprints: QueryBlueprint[];
  annotations: Annotation[];
  readerSettings: ReaderSettings;
  llmConfig?: LLMConfig;
  currentUser?: User | null;
  onUpdateReaderSettings: (settings: ReaderSettings) => void;
  onUpdateTextBlueprints: (textId: string, wordBpId: string, passageBpId: string) => void;
  onWordClick: (word: string, blueprintId: string) => void;
  onWordClickWebAssist?: (word: string, blueprintId?: string) => void;
  onPassageSelect: (passage: string, blueprintId: string) => void;
  onPassageSelectWebAssist?: (passage: string, blueprintId?: string) => void;
  onOpenAnnotations: () => void;
  selectedWord: string | null;
  selectedPassage?: string | null;
  llmModelBlueprints?: LLMModelBlueprint[];
  onSelectModelBlueprint?: (model: LLMModelBlueprint) => void;
}

export const TextReaderView: React.FC<TextReaderViewProps> = ({
  text,
  blueprints,
  annotations,
  readerSettings,
  llmConfig,
  currentUser,
  onUpdateReaderSettings,
  onUpdateTextBlueprints,
  onWordClick,
  onWordClickWebAssist,
  onPassageSelect,
  onPassageSelectWebAssist,
  onOpenAnnotations,
  selectedWord,
  selectedPassage,
  llmModelBlueprints = [],
  onSelectModelBlueprint,
}) => {
  const [activeWordBpId, setActiveWordBpId] = useState(text.wordBlueprintId);
  const [activePassageBpId, setActivePassageBpId] = useState(text.passageBlueprintId);
  const [selectedText, setSelectedText] = useState('');
  const [hoveredPassageKey, setHoveredPassageKey] = useState<string | null>(null);
  const [hoveredCompositeKey, setHoveredCompositeKey] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [scrollNotice, setScrollNotice] = useState<string | null>(null);
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);

  // Mirror Calque State
  const [mirrorData, setMirrorData] = useState<MirrorTranslationData | null>(null);
  const [isMirrorModalOpen, setIsMirrorModalOpen] = useState(false);
  const [isMobileMirrorOverlayDismissed, setIsMobileMirrorOverlayDismissed] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const lastScrollPosRef = useRef<{ 
    scrollY: number; 
    paraIndex: number; 
    wordIndex: number; 
    lineIndex: number 
  }>({ scrollY: 0, paraIndex: 0, wordIndex: 0, lineIndex: 0 });

  const applicableBlueprints = useMemo(() => {
    const textLang = (text.language || '').toLowerCase().trim();
    return blueprints.filter(
      (b) => !b.language || b.language === 'all' || b.language.toLowerCase().trim() === textLang
    );
  }, [blueprints, text.language]);

  const wordBlueprints = useMemo(() => {
    const filtered = applicableBlueprints.filter((b) => b.type === 'word');
    return filtered.length > 0 ? filtered : blueprints.filter((b) => b.type === 'word');
  }, [applicableBlueprints, blueprints]);

  const passageBlueprints = useMemo(() => {
    const filtered = applicableBlueprints.filter((b) => b.type === 'passage');
    return filtered.length > 0 ? filtered : blueprints.filter((b) => b.type === 'passage');
  }, [applicableBlueprints, blueprints]);
  const isDarkTheme = ['obsidian', 'emerald', 'mystic'].includes(readerSettings.theme);

  const activeWordBp = blueprints.find((b) => b.id === activeWordBpId);
  const activePassageBp = blueprints.find((b) => b.id === activePassageBpId);

  // Calculate total composite word groups across text
  const totalCompositeGroupsCount = useMemo(() => {
    if (!mirrorData) return 0;
    const groupIds = new Set<string>();
    for (const para of mirrorData.paragraphs) {
      for (const word of para.words) {
        if (word.composite?.id) {
          groupIds.add(word.composite.id);
        }
      }
    }
    return groupIds.size;
  }, [mirrorData]);

  // Active Hovered Composite Info for sleek floating manuscript preview bar
  const activeHoveredCompositeInfo = useMemo(() => {
    if (!hoveredCompositeKey || !mirrorData) return null;
    const firstDash = hoveredCompositeKey.indexOf('-');
    if (firstDash === -1) return null;
    const pIdxStr = hoveredCompositeKey.substring(0, firstDash);
    const compId = hoveredCompositeKey.substring(firstDash + 1);
    const pIdx = parseInt(pIdxStr, 10);
    const para = mirrorData.paragraphs[pIdx];
    if (!para) return null;
    for (const word of para.words) {
      if (word.composite && String(word.composite.id) === compId) {
        return {
          pIdx,
          composite: word.composite,
        };
      }
    }
    return null;
  }, [hoveredCompositeKey, mirrorData]);

  // Load mirror translation for current text
  useEffect(() => {
    const loaded = getStoredMirrorTranslation(text.id);
    if (loaded && text.content) {
      const ensured = ensureMirrorCompositeSentenceScoping(loaded, text.content);
      setMirrorData(ensured);
    } else {
      setMirrorData(loaded);
    }
    setIsMobileMirrorOverlayDismissed(false);
  }, [text.id, text.content]);

  // Context Menu Handlers
  const handleContextMenuWord = (
    e: React.MouseEvent | React.TouchEvent,
    word: string,
    cleanWord: string,
    pIdx: number,
    wIdx: number,
    _token: any,
    mirrorPair?: any,
    activePassageReplacement?: MirrorPassageReplacement,
    matchedExistingTranslation?: { target: string },
    _tokenSpan?: { start: number; end: number },
    parsedPara?: ParsedParagraph
  ) => {
    let clientX = 0;
    let clientY = 0;
    if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    } else if ('touches' in e && (e as React.TouchEvent).touches.length > 0) {
      clientX = (e as React.TouchEvent).touches[0].clientX;
      clientY = (e as React.TouchEvent).touches[0].clientY;
    }

    const cleanLower = cleanWord?.toLowerCase() || '';
    const isAllKeepOrig = Boolean(cleanLower && mirrorData?.untranslatedWords?.includes(cleanLower));
    const isWordKeepOrig = Boolean(mirrorPair?.keepOrig || isAllKeepOrig);

    // Compute selectedRange for passage operations
    let selectedRange: ContextMenuState['selectedRange'] = undefined;
    const activeSelectionText = selectedText || (typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : '');

    if (activeSelectionText && parsedPara) {
      const selClean = activeSelectionText.trim();
      const selWords = selClean.split(/\s+/).filter(Boolean);
      if (selWords.length > 1) {
        const wordTokens = parsedPara.tokens.filter(
          (t): t is ParsedWordToken => t.type === 'word' && t.wordIndex !== undefined
        );
        let matchStartWIdx = -1;
        let matchEndWIdx = -1;
        let matchOrigText = '';

        for (let i = 0; i <= wordTokens.length - selWords.length; i++) {
          const sliceWords = wordTokens.slice(i, i + selWords.length);
          const sliceJoined = sliceWords.map((w) => w.cleanWord).join(' ');
          const selJoined = selWords.map((w) => cleanWordToken(w)).join(' ');
          if (
            sliceJoined.toLowerCase().includes(selJoined.toLowerCase()) ||
            selJoined.toLowerCase().includes(sliceJoined.toLowerCase())
          ) {
            matchStartWIdx = sliceWords[0].wordIndex!;
            matchEndWIdx = sliceWords[sliceWords.length - 1].wordIndex!;
            matchOrigText = sliceWords.map((w) => w.plainText).join(' ');
            break;
          }
        }

        if (matchStartWIdx !== -1) {
          selectedRange = {
            pIdx,
            startWIdx: matchStartWIdx,
            endWIdx: matchEndWIdx,
            origText: matchOrigText || activeSelectionText,
            wordCount: matchEndWIdx - matchStartWIdx + 1,
          };
        }
      }
    }

    if (!selectedRange && activePassageReplacement) {
      selectedRange = {
        pIdx,
        startWIdx: activePassageReplacement.startWIdx,
        endWIdx: activePassageReplacement.endWIdx,
        origText: activePassageReplacement.origText,
        wordCount: activePassageReplacement.endWIdx - activePassageReplacement.startWIdx + 1,
      };
    } else if (!selectedRange) {
      selectedRange = {
        pIdx,
        startWIdx: wIdx,
        endWIdx: wIdx,
        origText: word,
        wordCount: 1,
      };
    }

    setContextMenu({
      x: clientX,
      y: clientY,
      word,
      cleanWord,
      pIdx,
      wIdx,
      isWordKeepOrig,
      isAllKeepOrig,
      mirrorPair,
      selectedText: activeSelectionText || undefined,
      selectedRange,
      activePassageReplacement,
      matchedExistingTranslation,
      hasMirrorData: Boolean(mirrorData),
    });
  };

  const handleSavePassageReplacement = (
    pIdx: number,
    startWIdx: number,
    endWIdx: number,
    origText: string,
    customTrans: string
  ) => {
    let currentData = mirrorData;
    if (!currentData) {
      currentData = parseMirrorCalqueText(text.content, text.content, text.id, 'custom');
    }

    const replacementId = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newReplacement: MirrorPassageReplacement = {
      id: replacementId,
      pIdx,
      startWIdx,
      endWIdx,
      origText,
      customTrans,
      createdAt: new Date().toISOString(),
    };

    // Filter out any overlapping replacements in this paragraph
    const existingReplacements = (currentData.passageReplacements || []).filter(
      (r) =>
        !(
          r.pIdx === pIdx &&
          ((r.startWIdx >= startWIdx && r.startWIdx <= endWIdx) ||
            (r.endWIdx >= startWIdx && r.endWIdx <= endWIdx) ||
            (r.startWIdx <= startWIdx && r.endWIdx >= endWIdx))
        )
    );

    const updatedReplacements = [...existingReplacements, newReplacement];

    // Update words in paragraph
    const updatedParas = [...currentData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (targetPara) {
      const updatedWords = [...targetPara.words];
      for (let w = startWIdx; w <= endWIdx; w++) {
        if (updatedWords[w]) {
          const originalTrans = updatedWords[w].originalTrans || updatedWords[w].trans;
          if (w === startWIdx) {
            updatedWords[w] = {
              ...updatedWords[w],
              trans: customTrans,
              originalTrans,
              passageReplacementId: replacementId,
              keepOrig: false,
            };
          } else {
            updatedWords[w] = {
              ...updatedWords[w],
              trans: '',
              originalTrans,
              passageReplacementId: replacementId,
              keepOrig: false,
            };
          }
        }
      }
      targetPara.words = updatedWords;
    }

    const updatedData: MirrorTranslationData = {
      ...currentData,
      paragraphs: updatedParas,
      passageReplacements: updatedReplacements,
      updatedAt: new Date().toISOString(),
    };

    setMirrorData(updatedData);
    saveMirrorTranslation(updatedData);
    if (currentUser) {
      syncMirrorTranslationToCloud(currentUser.uid, updatedData);
    }
  };

  const handleDeletePassageReplacement = (replacementId: string) => {
    if (!mirrorData) return;

    const targetReplacement = mirrorData.passageReplacements?.find((r) => r.id === replacementId);
    const updatedReplacements = (mirrorData.passageReplacements || []).filter((r) => r.id !== replacementId);

    const updatedParas = [...mirrorData.paragraphs];
    if (targetReplacement) {
      const targetPara = updatedParas[targetReplacement.pIdx];
      if (targetPara) {
        const updatedWords = [...targetPara.words];
        for (let w = targetReplacement.startWIdx; w <= targetReplacement.endWIdx; w++) {
          if (updatedWords[w]) {
            const restoredTrans = updatedWords[w].originalTrans || updatedWords[w].trans;
            updatedWords[w] = {
              ...updatedWords[w],
              trans: restoredTrans,
              passageReplacementId: undefined,
              originalTrans: undefined,
            };
          }
        }
        targetPara.words = updatedWords;
      }
    }

    const updatedData: MirrorTranslationData = {
      ...mirrorData,
      paragraphs: updatedParas,
      passageReplacements: updatedReplacements,
      updatedAt: new Date().toISOString(),
    };

    setMirrorData(updatedData);
    saveMirrorTranslation(updatedData);
    if (currentUser) {
      syncMirrorTranslationToCloud(currentUser.uid, updatedData);
    }
  };

  const handleToggleKeepOrigSingle = (pIdx: number, wIdx: number) => {
    let currentData = mirrorData;
    if (!currentData) {
      currentData = parseMirrorCalqueText(text.content, text.content, text.id, 'custom');
    }

    const updatedParas = [...currentData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (targetPara && targetPara.words[wIdx]) {
      const word = targetPara.words[wIdx];
      const nextKeep = !word.keepOrig;
      const updatedWords = [...targetPara.words];
      updatedWords[wIdx] = {
        ...word,
        keepOrig: nextKeep,
      };
      targetPara.words = updatedWords;
      const updatedData: MirrorTranslationData = {
        ...currentData,
        paragraphs: updatedParas,
        updatedAt: new Date().toISOString(),
      };
      setMirrorData(updatedData);
      saveMirrorTranslation(updatedData);
      if (currentUser) {
        syncMirrorTranslationToCloud(currentUser.uid, updatedData);
      }
    }
  };

  const handleToggleKeepOrigGlobal = (cleanWord: string) => {
    if (!cleanWord) return;
    const cleanLower = cleanWord.toLowerCase();
    let currentData = mirrorData;
    if (!currentData) {
      currentData = parseMirrorCalqueText(text.content, text.content, text.id, 'custom');
    }

    const existingList = currentData.untranslatedWords || [];
    let updatedList: string[];
    if (existingList.includes(cleanLower)) {
      updatedList = existingList.filter((w) => w !== cleanLower);
    } else {
      updatedList = [...existingList, cleanLower];
    }

    const updatedData: MirrorTranslationData = {
      ...currentData,
      untranslatedWords: updatedList,
      updatedAt: new Date().toISOString(),
    };
    setMirrorData(updatedData);
    saveMirrorTranslation(updatedData);
    if (currentUser) {
      syncMirrorTranslationToCloud(currentUser.uid, updatedData);
    }
  };

  const handleSaveWordTranslation = (pIdx: number, wIdx: number, newTrans: string) => {
    let currentData = mirrorData;
    if (!currentData) {
      currentData = parseMirrorCalqueText(text.content, text.content, text.id, 'custom');
    }

    const updatedParas = [...currentData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (targetPara && targetPara.words[wIdx]) {
      const origWord = targetPara.words[wIdx].orig;
      const updatedWords = [...targetPara.words];
      updatedWords[wIdx] = {
        ...updatedWords[wIdx],
        trans: newTrans,
        keepOrig: false,
      };
      targetPara.words = updatedWords;
      const updatedData: MirrorTranslationData = {
        ...currentData,
        paragraphs: updatedParas,
        updatedAt: new Date().toISOString(),
      };
      setMirrorData(updatedData);
      saveMirrorTranslation(updatedData);

      // Persist to language-wide gloss dictionary
      if (text.language && origWord) {
        saveLanguageWordGloss({
          orig: origWord,
          cleanOrig: origWord.toLowerCase().trim(),
          trans: newTrans.trim(),
          language: text.language,
          updatedAt: new Date().toISOString(),
        });
      }

      if (currentUser) {
        syncMirrorTranslationToCloud(currentUser.uid, updatedData);
      }
    }
  };

  const handleTogglePreferCompound = (pIdx: number, wIdx: number) => {
    if (!mirrorData) return;
    const targetPara = mirrorData.paragraphs[pIdx];
    if (!targetPara || !targetPara.words[wIdx]) return;
    const targetWord = targetPara.words[wIdx];
    const newPrefer = !targetWord.preferCompoundInMirror;

    const updatedParas = [...mirrorData.paragraphs];
    const updatedWords = [...targetPara.words];

    // If part of a composite, toggle preferCompoundInMirror for all words in the composite group
    const compositeId = targetWord.composite?.id;
    if (compositeId) {
      for (let i = 0; i < updatedWords.length; i++) {
        if (updatedWords[i].composite?.id === compositeId) {
          updatedWords[i] = {
            ...updatedWords[i],
            preferCompoundInMirror: newPrefer,
          };
        }
      }
    } else {
      updatedWords[wIdx] = {
        ...targetWord,
        preferCompoundInMirror: newPrefer,
      };
    }

    targetPara.words = updatedWords;
    const updatedData: MirrorTranslationData = {
      ...mirrorData,
      paragraphs: updatedParas,
      updatedAt: new Date().toISOString(),
    };
    setMirrorData(updatedData);
    saveMirrorTranslation(updatedData);
    if (currentUser) {
      syncMirrorTranslationToCloud(currentUser.uid, updatedData);
    }
  };

  const handleEditCompositeCompoundMeaning = (pIdx: number, groupId: string, newMeaning: string) => {
    if (!mirrorData) return;
    const targetPara = mirrorData.paragraphs[pIdx];
    if (!targetPara) return;

    const updatedParas = [...mirrorData.paragraphs];
    const updatedWords = [...targetPara.words];

    for (let i = 0; i < updatedWords.length; i++) {
      if (updatedWords[i].composite?.id === groupId) {
        const comp = updatedWords[i].composite!;
        updatedWords[i] = {
          ...updatedWords[i],
          composite: {
            ...comp,
            compoundMeaning: newMeaning,
          },
        };
      }
    }

    targetPara.words = updatedWords;
    const updatedData: MirrorTranslationData = {
      ...mirrorData,
      paragraphs: updatedParas,
      updatedAt: new Date().toISOString(),
    };
    setMirrorData(updatedData);
    saveMirrorTranslation(updatedData);
    if (currentUser) {
      syncMirrorTranslationToCloud(currentUser.uid, updatedData);
    }
  };

  const handleUnlinkCompositeWord = (pIdx: number, wIdx: number) => {
    if (!mirrorData) return;
    const targetPara = mirrorData.paragraphs[pIdx];
    if (!targetPara || !targetPara.words[wIdx]) return;
    const targetWord = targetPara.words[wIdx];
    const compositeId = targetWord.composite?.id;
    if (!compositeId) return;

    const updatedParas = [...mirrorData.paragraphs];
    const updatedWords = [...targetPara.words];

    // Remove composite from all words in this group
    for (let i = 0; i < updatedWords.length; i++) {
      if (updatedWords[i].composite?.id === compositeId) {
        const { composite, preferCompoundInMirror, ...rest } = updatedWords[i];
        updatedWords[i] = rest as MirrorWordPair;
      }
    }

    targetPara.words = updatedWords;
    const updatedData: MirrorTranslationData = {
      ...mirrorData,
      paragraphs: updatedParas,
      updatedAt: new Date().toISOString(),
    };
    setMirrorData(updatedData);
    saveMirrorTranslation(updatedData);
    if (currentUser) {
      syncMirrorTranslationToCloud(currentUser.uid, updatedData);
    }
  };

  const handleToggleCompositeGlobalPreference = () => {
    if (!mirrorData) return;
    const currentPref = mirrorData.compositeDisplayMode || 'separated';
    const newPref = currentPref === 'separated' ? 'compound' : 'separated';
    const updatedData: MirrorTranslationData = {
      ...mirrorData,
      compositeDisplayMode: newPref,
      updatedAt: new Date().toISOString(),
    };
    setMirrorData(updatedData);
    saveMirrorTranslation(updatedData);
    if (currentUser) {
      syncMirrorTranslationToCloud(currentUser.uid, updatedData);
    }
  };

  // Keyboard shortcut: Press 'M' to toggle between Mirror and Mirror-Normalized-Original instantly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        const currentMode = readerSettings.mirrorDisplayMode || 'original';
        let newMode: MirrorDisplayMode;
        if (currentMode === 'mirror') {
          newMode = 'mirror-normalized-original';
        } else if (currentMode === 'mirror-normalized-original') {
          newMode = 'mirror';
        } else if (currentMode === 'original') {
          newMode = 'mirror';
        } else {
          newMode = 'mirror';
        }
        onUpdateReaderSettings({ ...readerSettings, mirrorDisplayMode: newMode });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readerSettings, onUpdateReaderSettings]);

  // Handle Selection Change natively without needing scroll
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectedText('');
        return;
      }
      const rawSelected = selection.toString().trim();
      if (rawSelected.length > 1) {
        if (contentRef.current && contentRef.current.contains(selection.anchorNode)) {
          let extracted = extractSelectionTextFromReader(contentRef.current, selection, true);
          if (!extracted) {
            extracted = cleanCopiedReaderText(rawSelected);
          }
          setSelectedText(extracted.trim());
          return;
        }
      }
      setSelectedText('');
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [readerSettings.mirrorDisplayMode]);

  useEffect(() => {
    setActiveWordBpId(text.wordBlueprintId);
    setActivePassageBpId(text.passageBlueprintId);
  }, [text]);

  // Helper to get true active scroll Y regardless of whether window, body, html or container scrolls
  const getCurrentScrollY = (): number => {
    const scrollContainer = document.getElementById('main-scroll-container');
    const containerY = scrollContainer ? scrollContainer.scrollTop : 0;
    const winY = window.scrollY || window.pageYOffset || 0;
    const docY = document.documentElement ? document.documentElement.scrollTop : 0;
    const bodyY = document.body ? document.body.scrollTop : 0;
    return Math.max(containerY, winY, docY, bodyY);
  };

  // Helper to find the topmost visible line and word position in the reader area
  const getTopmostVisibleLineInfo = (): { paraIndex: number; wordIndex: number; lineIndex: number } => {
    if (!contentRef.current) {
      return {
        paraIndex: lastScrollPosRef.current.paraIndex || 0,
        wordIndex: lastScrollPosRef.current.wordIndex || 0,
        lineIndex: lastScrollPosRef.current.lineIndex || 0,
      };
    }

    const readingThreshold = 75; // px from viewport top (below sticky top bar)
    const wordEls = contentRef.current.querySelectorAll<HTMLElement>('[data-word-idx]');
    if (wordEls.length === 0) {
      return {
        paraIndex: lastScrollPosRef.current.paraIndex || 0,
        wordIndex: lastScrollPosRef.current.wordIndex || 0,
        lineIndex: lastScrollPosRef.current.lineIndex || 0,
      };
    }

    let activeWordEl: HTMLElement | null = null;
    for (let i = 0; i < wordEls.length; i++) {
      const el = wordEls[i];
      const rect = el.getBoundingClientRect();
      if (rect.bottom >= readingThreshold) {
        activeWordEl = el;
        break;
      }
    }

    if (!activeWordEl && wordEls.length > 0) {
      activeWordEl = wordEls[wordEls.length - 1];
    }

    if (activeWordEl) {
      const pIdx = parseInt(activeWordEl.getAttribute('data-para-idx') || '0', 10) || 0;
      const wIdx = parseInt(activeWordEl.getAttribute('data-word-idx') || '0', 10) || 0;

      // Determine visual line index within this paragraph
      const paraEl = document.getElementById(`reader-para-${pIdx}`);
      let lineIndex = 0;
      if (paraEl) {
        const wordsInPara = paraEl.querySelectorAll<HTMLElement>('[data-word-idx]');
        const seenLineTops = new Set<number>();
        for (let i = 0; i < wordsInPara.length; i++) {
          const w = wordsInPara[i];
          const currWIdx = parseInt(w.getAttribute('data-word-idx') || '0', 10) || 0;
          const clusterTop = Math.round(w.offsetTop / 5) * 5;
          seenLineTops.add(clusterTop);
          if (currWIdx === wIdx) {
            lineIndex = Math.max(0, seenLineTops.size - 1);
            break;
          }
        }
      }

      return { paraIndex: pIdx, wordIndex: wIdx, lineIndex };
    }

    return { paraIndex: 0, wordIndex: 0, lineIndex: 0 };
  };

  // RESTORE SCROLL AND LINE POSITION UPON REOPENING / TEXT CHANGE (Mobile & PC)
  useEffect(() => {
    const savedState = getStoredScrollState(text.id);
    lastScrollPosRef.current = {
      scrollY: savedState.scrollY || 0,
      paraIndex: savedState.paraIndex || 0,
      wordIndex: savedState.wordIndex || 0,
      lineIndex: savedState.lineIndex || 0,
    };

    const hasSavedPosition = 
      (savedState.scrollY && savedState.scrollY > 15) || 
      (savedState.paraIndex && savedState.paraIndex > 0) ||
      (savedState.wordIndex && savedState.wordIndex > 0) ||
      (savedState.lineIndex && savedState.lineIndex > 0);

    if (hasSavedPosition) {
      let isCancelled = false;

      const performRestore = () => {
        if (isCancelled) return false;
        const scrollContainer = document.getElementById('main-scroll-container');

        // 1. Try exact line/word-level restoration first for precise recovery in long paragraphs
        if (
          typeof savedState.wordIndex === 'number' &&
          (savedState.wordIndex > 0 || (savedState.paraIndex && savedState.paraIndex > 0))
        ) {
          const targetWordEl = document.getElementById(`reader-w-${savedState.paraIndex || 0}-${savedState.wordIndex}`);
          if (targetWordEl) {
            const targetRect = targetWordEl.getBoundingClientRect();
            const currentWinY = window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || 0;
            const winTargetTop = targetRect.top + currentWinY - 72;

            window.scrollTo({
              top: Math.max(0, winTargetTop),
              behavior: 'instant' as ScrollBehavior,
            });
            if (document.documentElement) document.documentElement.scrollTop = Math.max(0, winTargetTop);
            if (document.body) document.body.scrollTop = Math.max(0, winTargetTop);

            if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 10) {
              const containerRect = scrollContainer.getBoundingClientRect();
              const offsetTop = targetRect.top - containerRect.top + scrollContainer.scrollTop - 40;
              scrollContainer.scrollTop = Math.max(0, offsetTop);
            }

            const lineNum = typeof savedState.lineIndex === 'number' ? savedState.lineIndex + 1 : 1;
            const paraNum = (savedState.paraIndex || 0) + 1;
            if (lineNum > 1 || paraNum > 1) {
              setScrollNotice(`Resumed reading at line ${lineNum} (paragraph ${paraNum})`);
            }
            return true;
          }
        }

        // 2. Fallback to paragraph-anchored restoration
        if (typeof savedState.paraIndex === 'number' && savedState.paraIndex > 0) {
          const targetParaEl = document.getElementById(`reader-para-${savedState.paraIndex}`);
          if (targetParaEl) {
            const targetRect = targetParaEl.getBoundingClientRect();
            const currentWinY = window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || 0;
            const winTargetTop = targetRect.top + currentWinY - 72;

            window.scrollTo({
              top: Math.max(0, winTargetTop),
              behavior: 'instant' as ScrollBehavior,
            });
            if (document.documentElement) document.documentElement.scrollTop = Math.max(0, winTargetTop);
            if (document.body) document.body.scrollTop = Math.max(0, winTargetTop);

            if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 10) {
              const containerRect = scrollContainer.getBoundingClientRect();
              const offsetTop = targetRect.top - containerRect.top + scrollContainer.scrollTop - 40;
              scrollContainer.scrollTop = Math.max(0, offsetTop);
            }

            setScrollNotice(`Resumed reading at paragraph ${savedState.paraIndex + 1}`);
            return true;
          }
        }

        // 3. Fallback to pixel scroll offset
        if (savedState.scrollY && savedState.scrollY > 15) {
          if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 10) {
            scrollContainer.scrollTop = savedState.scrollY;
          }
          window.scrollTo({
            top: savedState.scrollY,
            behavior: 'instant' as ScrollBehavior,
          });
          if (document.documentElement) document.documentElement.scrollTop = savedState.scrollY;
          if (document.body) document.body.scrollTop = savedState.scrollY;

          setScrollNotice('Resumed previous reading position');
          return true;
        }

        return false;
      };

      // Multi-stage restoration to handle dynamic font painting on phones & PC
      requestAnimationFrame(() => performRestore());
      const t1 = setTimeout(() => performRestore(), 40);
      const t2 = setTimeout(() => performRestore(), 120);
      const t3 = setTimeout(() => performRestore(), 280);
      const t4 = setTimeout(() => performRestore(), 550);

      const clearNoticeTimer = setTimeout(() => setScrollNotice(null), 3000);

      return () => {
        isCancelled = true;
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(clearNoticeTimer);
      };
    } else {
      const scrollContainer = document.getElementById('main-scroll-container');
      if (scrollContainer) scrollContainer.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, [text.id]);

  // CONTINUOUSLY SAVE SCROLL POSITION AND LINE ANCHOR (Scroll, Touch, Mobile Visibility)
  useEffect(() => {
    let debounceTimer: any = null;
    const scrollContainer = document.getElementById('main-scroll-container');

    const persistPosition = () => {
      const currentY = getCurrentScrollY();
      const lineInfo = getTopmostVisibleLineInfo();
      if (currentY > 5 || lineInfo.paraIndex > 0 || lineInfo.wordIndex > 0) {
        lastScrollPosRef.current = { scrollY: currentY, ...lineInfo };
        saveStoredScrollState(text.id, { scrollY: currentY, ...lineInfo });
      }
    };

    const handleScroll = () => {
      const currentY = getCurrentScrollY();
      setShowScrollTopBtn(currentY > 350);

      if (currentY > 5) {
        const lineInfo = getTopmostVisibleLineInfo();
        lastScrollPosRef.current = { scrollY: currentY, ...lineInfo };

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          saveStoredScrollState(text.id, { scrollY: currentY, ...lineInfo });
        }, 100);
      }
    };

    const handleVisibilityOrPageHide = () => {
      persistPosition();
    };

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchmove', handleScroll, { passive: true });
    window.addEventListener('touchend', handleScroll, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityOrPageHide);
    window.addEventListener('pagehide', handleVisibilityOrPageHide);
    window.addEventListener('beforeunload', handleVisibilityOrPageHide);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchmove', handleScroll);
      window.removeEventListener('touchend', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibilityOrPageHide);
      window.removeEventListener('pagehide', handleVisibilityOrPageHide);
      window.removeEventListener('beforeunload', handleVisibilityOrPageHide);

      // Protect against saving 0 when unmounting or navigating away
      if (
        lastScrollPosRef.current.scrollY > 5 || 
        lastScrollPosRef.current.paraIndex > 0 || 
        lastScrollPosRef.current.wordIndex > 0
      ) {
        saveStoredScrollState(text.id, lastScrollPosRef.current);
      }
    };
  }, [text.id]);

  // Handle word blueprint change
  const handleWordBpChange = (newId: string) => {
    setActiveWordBpId(newId);
    onUpdateTextBlueprints(text.id, newId, activePassageBpId);
  };

  // Handle passage blueprint change
  const handlePassageBpChange = (newId: string) => {
    setActivePassageBpId(newId);
    onUpdateTextBlueprints(text.id, activeWordBpId, newId);
  };

  // Handle Text Selection for Passage Query
  const handleMouseUpOrTouchEnd = () => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        const rawSelected = selection.toString().trim();
        if (rawSelected.length > 1 && contentRef.current && contentRef.current.contains(selection.anchorNode)) {
          let extracted = extractSelectionTextFromReader(contentRef.current, selection, true);
          if (!extracted) {
            extracted = cleanCopiedReaderText(rawSelected);
          }
          setSelectedText(extracted.trim());
          return;
        }
      }
      setSelectedText('');
    }, 10);
  };

  const handleDecipherPassageClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedText) {
      const sanitized = cleanCopiedReaderText(selectedText).trim();
      onPassageSelect(sanitized, activePassageBpId);
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    }
  };

  // TTS Read Aloud
  const handleSpeakText = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (isSpeaking) {
        setIsSpeaking(false);
        return;
      }
      const rawTextToSpeak = selectedText || text.content;
      const textToSpeak = stripFormattingTags(rawTextToSpeak);
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.85;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Scroll to Top helper
  const handleScrollToTop = () => {
    const scrollContainer = document.getElementById('main-scroll-container');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    lastScrollPosRef.current = { scrollY: 0, paraIndex: 0, wordIndex: 0, lineIndex: 0 };
    saveStoredScrollState(text.id, { scrollY: 0, paraIndex: 0, wordIndex: 0, lineIndex: 0 });
  };

  // Theme Styling Classes
  const getThemeClasses = (theme: ReaderTheme) => {
    switch (theme) {
      case 'obsidian':
        return 'bg-stone-950 text-stone-200 border-stone-800';
      case 'sepia':
        return 'bg-[#fbf0d9] text-[#432c1c] border-[#e2d0b5]';
      case 'emerald':
        return 'bg-[#0f231e] text-[#d1ece5] border-[#1b3d34]';
      case 'mystic':
        return 'bg-[#151323] text-[#e0dbf7] border-[#292343]';
      case 'parchment':
      default:
        return 'bg-[#faf7f2] text-[#2c2825] border-[#e8dfd1]';
    }
  };

  const currentWordBp = blueprints.find((b) => b.id === activeWordBpId);
  const currentPassageBp = blueprints.find((b) => b.id === activePassageBpId);

  // Build set/lists of previously translated targets from annotations (memoized for reader performance)
  const translatedWordsSet = useMemo(
    () =>
      new Set(
        annotations
          .filter((a) => (!a.textId || a.textId === text.id || a.textId === 'playground-text') && a.type === 'word')
          .map((a) => a.target.trim().toLowerCase())
      ),
    [annotations, text.id]
  );

  const translatedPassages = useMemo(
    () =>
      annotations
        .filter((a) => (!a.textId || a.textId === text.id || a.textId === 'playground-text') && a.type === 'passage')
        .map((a) => a.target.trim()),
    [annotations, text.id]
  );

  const rawParagraphs = useMemo(() => splitTextIntoParagraphs(text.content), [text.content]);

  // Helper to find all occurrences of translated passages in paragraph
  const findPassageMatches = (paraText: string, passages: string[]) => {
    if (!paraText || passages.length === 0) return [];
    const lowerPara = paraText.toLowerCase();
    const allMatches: { start: number; end: number; target: string }[] = [];

    passages.forEach((pTarget) => {
      const cleanP = pTarget.trim();
      if (!cleanP || cleanP.length < 2) return;
      const lowerP = cleanP.toLowerCase();

      let pos = 0;
      while ((pos = lowerPara.indexOf(lowerP, pos)) !== -1) {
        allMatches.push({
          start: pos,
          end: pos + cleanP.length,
          target: cleanP,
        });
        pos += 1;
      }
    });

    return allMatches;
  };

  const getTopLevelMatches = (
    matches: { start: number; end: number; target: string }[],
    rangeStart: number,
    rangeEnd: number
  ) => {
    const inRange = matches.filter((m) => m.start >= rangeStart && m.end <= rangeEnd);
    if (inRange.length === 0) return [];

    inRange.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const topLevel: { start: number; end: number; target: string }[] = [];
    let lastEnd = rangeStart;

    for (const m of inRange) {
      if (m.start >= lastEnd) {
        topLevel.push(m);
        lastEnd = m.end;
      }
    }

    return topLevel;
  };

  // Render paragraphs and interactive word tokens with deterministic line & word IDs and tag formattings
  const renderParagraphs = () => {
    return rawParagraphs.map((rawPara, pIdx) => (
      <ReaderParagraphItem
        key={pIdx}
        rawPara={rawPara}
        pIdx={pIdx}
        isDarkTheme={isDarkTheme}
        readerSettings={readerSettings}
        textLanguage={text.language}
        translatedPassages={translatedPassages}
        translatedWordsSet={translatedWordsSet}
        selectedWord={selectedWord}
        selectedPassage={selectedPassage}
        hoveredPassageKey={hoveredPassageKey}
        setHoveredPassageKey={setHoveredPassageKey}
        hoveredCompositeKey={hoveredCompositeKey}
        setHoveredCompositeKey={setHoveredCompositeKey}
        onWordClick={onWordClick}
        onPassageSelect={onPassageSelect}
        setSelectedText={setSelectedText}
        activeWordBpId={activeWordBpId}
        activePassageBpId={activePassageBpId}
        mirrorData={mirrorData}
        onContextMenuWord={handleContextMenuWord}
      />
    ));
  };

  // Intercept Copy event to clean up intra-paragraph word bounding box newlines
  const handleReaderCopy = (e: React.ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    // 1. Attempt DOM-aware linear text extraction across paragraphs and words
    if (contentRef.current) {
      const isMirror = (readerSettings.mirrorDisplayMode || 'original') === 'mirror';
      const extractedText = extractSelectionTextFromReader(contentRef.current, selection, !isMirror);
      if (extractedText && extractedText.trim().length > 0) {
        e.clipboardData.setData('text/plain', extractedText);
        e.preventDefault();
        return;
      }
    }

    // 2. Fallback to cleaning raw selection string
    const rawCopied = selection.toString();
    if (!rawCopied) return;

    const cleanedText = cleanCopiedReaderText(rawCopied);
    if (cleanedText) {
      e.clipboardData.setData('text/plain', cleanedText);
      e.preventDefault();
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-28 space-y-4">
      {/* Scroll Position Restoration Notice Toast */}
      {scrollNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-stone-900/90 text-amber-200 border border-amber-600/60 px-4 py-2 rounded-full text-xs font-medium shadow-xl backdrop-blur-md flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          <span>{scrollNotice}</span>
        </div>
      )}

      {/* Top Reader Controls Header */}
      <div className="p-4 rounded-3xl bg-stone-900 border border-stone-800 text-stone-100 shadow-md space-y-3">
        {/* Row 1: Document Metadata & Utility Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/60">
                {text.language}
              </span>
              {mirrorData && (
                <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 flex items-center space-x-1">
                  <ArrowRightLeft className="w-2.5 h-2.5" />
                  <span>Calque Ready</span>
                </span>
              )}
            </div>
            <h2 className="text-lg font-serif font-bold text-amber-100 mt-1 truncate">
              {text.title}
            </h2>
            {text.author && (
              <p className="text-xs text-stone-400 truncate">By {text.author}</p>
            )}
          </div>

          {/* Action Icons: Speak, Notes, Reader Settings */}
          <div className="flex items-center space-x-2 shrink-0 self-start sm:self-center">
            {/* Speak Aloud Button */}
            <button
              onClick={handleSpeakText}
              className={`p-2 rounded-xl transition border ${
                isSpeaking
                  ? 'bg-amber-800 text-amber-100 border-amber-600 animate-pulse'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
              }`}
              title="Speak Text Aloud"
              id="btn-reader-speak"
            >
              <Volume2 className="w-4 h-4" />
            </button>

            {/* Saved Annotations Drawer Button */}
            <button
              onClick={onOpenAnnotations}
              className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium flex items-center space-x-1.5 transition border border-stone-700 relative"
              title="Saved Annotations"
              id="btn-reader-annotations"
            >
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span>Notes</span>
              {annotations.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-amber-600 text-amber-50 rounded-full font-bold">
                  {annotations.length}
                </span>
              )}
            </button>

            {/* Options Trigger */}
            <button
              onClick={() => setShowOptionsModal(true)}
              className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition"
              title="Reader Settings"
              id="btn-open-reader-options-modal"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Row 2: Reading Mode Controls & LLM Model Blueprint Selector */}
        <div className="pt-2.5 border-t border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Mirror Mode Quick Toggle Segmented Control */}
          <div className="flex items-center space-x-1 bg-stone-950 p-1 rounded-2xl border border-stone-800 shrink-0">
            <button
              onClick={() => onUpdateReaderSettings({ ...readerSettings, mirrorDisplayMode: 'original' })}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition cursor-pointer flex items-center space-x-1 ${
                (readerSettings.mirrorDisplayMode || 'original') === 'original'
                  ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Natural Original Foreign Text"
              id="btn-mode-original"
            >
              <span>Original</span>
            </button>
            <button
              onClick={() => {
                const current = readerSettings.mirrorDisplayMode || 'original';
                let nextMode: MirrorDisplayMode;
                if (current === 'mirror') {
                  nextMode = 'mirror-normalized-original';
                } else {
                  nextMode = 'mirror';
                }
                onUpdateReaderSettings({ ...readerSettings, mirrorDisplayMode: nextMode });
              }}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition cursor-pointer flex items-center space-x-1 ${
                readerSettings.mirrorDisplayMode === 'mirror'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
                  : readerSettings.mirrorDisplayMode === 'mirror-normalized-original'
                  ? 'bg-amber-700/40 text-amber-200 border border-amber-500/50 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="1:1 Word-Aligned Calque (Press 'M' to toggle between Mirror & Aligned Original)"
              id="btn-mode-mirror"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>{readerSettings.mirrorDisplayMode === 'mirror-normalized-original' ? 'Aligned Orig' : 'Mirror'}</span>
            </button>
            <button
              onClick={() => onUpdateReaderSettings({ ...readerSettings, mirrorDisplayMode: 'interlinear' })}
              className={`px-2 py-1 rounded-xl text-xs font-medium transition cursor-pointer flex items-center space-x-1 ${
                readerSettings.mirrorDisplayMode === 'interlinear'
                  ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Interlinear Gloss View"
              id="btn-mode-gloss"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gloss</span>
            </button>
            <button
              onClick={() => setIsMirrorModalOpen(true)}
              className="p-1 rounded-xl text-stone-400 hover:text-amber-300 hover:bg-stone-800 transition cursor-pointer"
              title="Mirror Translation Calque Engine (Generate / Import)"
              id="btn-open-mirror-modal"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>

          {/* Quick LLM Model Blueprint Switcher */}
          {llmModelBlueprints && llmModelBlueprints.length > 0 && onSelectModelBlueprint && (
            <div className="flex items-center space-x-2 shrink-0">
              <span className="text-[11px] text-stone-400 font-mono flex items-center space-x-1">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden xs:inline">Model:</span>
              </span>
              <ModelBlueprintSwitcher
                llmModelBlueprints={llmModelBlueprints}
                currentConfig={llmConfig || getLLMConfig()}
                onSelectModelBlueprint={onSelectModelBlueprint}
                variant="reader"
              />
            </div>
          )}
        </div>

        {/* Blueprint Selector Row */}
        <div className="pt-2 border-t border-stone-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {/* Active Word Query Blueprint */}
          <div className="flex items-center space-x-2 bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-stone-400 shrink-0 text-[11px]">Word:</span>
            <select
              value={activeWordBpId}
              onChange={(e) => handleWordBpChange(e.target.value)}
              className="bg-transparent text-amber-200 font-medium focus:outline-hidden text-xs w-full truncate"
              id="select-reader-word-bp"
            >
              {wordBlueprints.map((bp) => (
                <option key={bp.id} value={bp.id} className="bg-stone-900 text-stone-100">
                  {bp.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const webBp = wordBlueprints.find((b) => b.id === 'wp-web-assist-default' || b.name.toLowerCase().includes('web ui assist'));
                if (webBp) {
                  handleWordBpChange(webBp.id);
                }
              }}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium flex items-center space-x-1 shrink-0 transition cursor-pointer border ${
                activeWordBp?.id === 'wp-web-assist-default' || activeWordBp?.name.toLowerCase().includes('web ui assist')
                  ? 'bg-purple-900 text-purple-100 border-purple-500 shadow-xs ring-1 ring-purple-400/40'
                  : 'bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-purple-300 border-stone-800'
              }`}
              title="Select Web UI Assist blueprint for words (Claude Pro / AI Studio / ChatGPT)"
              id="btn-reader-quick-web-assist-word"
            >
              <Globe className="w-3 h-3 text-purple-400" />
              <span>Web Assist</span>
            </button>
          </div>

          {/* Active Passage Query Blueprint */}
          <div className="flex items-center space-x-2 bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-stone-400 shrink-0 text-[11px]">Passage:</span>
            <select
              value={activePassageBpId}
              onChange={(e) => handlePassageBpChange(e.target.value)}
              className="bg-transparent text-purple-200 font-medium focus:outline-hidden text-xs w-full truncate"
              id="select-reader-passage-bp"
            >
              {passageBlueprints.map((bp) => (
                <option key={bp.id} value={bp.id} className="bg-stone-900 text-stone-100">
                  {bp.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const webBp = passageBlueprints.find((b) => b.id === 'pp-web-assist-default' || b.name.toLowerCase().includes('web ui assist'));
                if (webBp) {
                  handlePassageBpChange(webBp.id);
                }
              }}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium flex items-center space-x-1 shrink-0 transition cursor-pointer border ${
                activePassageBp?.id === 'pp-web-assist-default' || activePassageBp?.name.toLowerCase().includes('web ui assist')
                  ? 'bg-purple-900 text-purple-100 border-purple-500 shadow-xs ring-1 ring-purple-400/40'
                  : 'bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-purple-300 border-stone-800'
              }`}
              title="Select Web UI Assist blueprint for passages (Claude Pro / AI Studio / ChatGPT)"
              id="btn-reader-quick-web-assist-passage"
            >
              <Globe className="w-3 h-3 text-purple-400" />
              <span>Web Assist</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Near-Selection Action Popover (Android Selection Popup Style) */}
      {selectedText && (() => {
        const cleanNorm = selectedText.trim().replace(/\s+/g, ' ').toLowerCase();
        const cleanRaw = selectedText.trim().toLowerCase();
        const isPassageCached = annotations.some((a) => {
          const matchesText = !a.textId || a.textId === text.id || a.textId === 'playground-text';
          if (!matchesText) return false;
          if (a.type !== 'passage') return false;
          const aNorm = a.target.trim().replace(/\s+/g, ' ').toLowerCase();
          const aRaw = a.target.trim().toLowerCase();
          return aNorm === cleanNorm || aRaw === cleanRaw;
        });

        return (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2 max-w-[90vw] animate-in slide-in-from-bottom-4 fade-in duration-200">
            <button
              onClick={handleDecipherPassageClick}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.stopPropagation()}
              className={`px-4 sm:px-5 py-3 rounded-full ${
                isPassageCached
                  ? 'bg-linear-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-emerald-50 border-emerald-400/60'
                  : 'bg-linear-to-r from-purple-800 to-amber-800 hover:from-purple-700 hover:to-amber-700 text-purple-50 border-purple-400/60'
              } text-xs font-semibold shadow-2xl flex items-center space-x-2 border active:scale-95 backdrop-blur-md cursor-pointer`}
              id="btn-decipher-passage-floating-bottom"
            >
              <Sparkles className={`w-4 h-4 ${isPassageCached ? 'text-emerald-300' : 'text-amber-300'}`} />
              <span>
                {isPassageCached
                  ? `View Saved Decipher (${selectedText.split(/\s+/).length} words)`
                  : `Decipher Passage (${selectedText.split(/\s+/).length} words)`}
              </span>
            </button>

            {onPassageSelectWebAssist && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const sanitized = cleanCopiedReaderText(selectedText).trim();
                  onPassageSelectWebAssist(sanitized, activePassageBpId);
                  setSelectedText('');
                  window.getSelection()?.removeAllRanges();
                }}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.stopPropagation()}
                className="px-3.5 py-3 rounded-full bg-purple-900/90 hover:bg-purple-800 text-purple-100 text-xs font-semibold shadow-2xl flex items-center space-x-1.5 border border-purple-500/60 active:scale-95 backdrop-blur-md cursor-pointer"
                title="Ask via Web UI Assist (Claude / AI Studio / ChatGPT)"
                id="btn-web-assist-passage-floating-bottom"
              >
                <Globe className="w-3.5 h-3.5 text-purple-300" />
                <span>Web Assist</span>
              </button>
            )}
          </div>
        );
      })()}

      {/* Main Interactive Reader Canvas */}
      <div
        ref={contentRef}
        onMouseUp={handleMouseUpOrTouchEnd}
        onTouchEnd={handleMouseUpOrTouchEnd}
        onCopy={handleReaderCopy}
        className={`p-6 sm:p-8 rounded-3xl border shadow-xl transition-colors duration-200 min-h-[500px] select-text pb-28 sm:pb-32 ${getThemeClasses(
          readerSettings.theme
        )}`}
      >
        {renderParagraphs()}
      </div>

      {/* Floating Jump to Top Button */}
      {showScrollTopBtn && (
        <button
          onClick={handleScrollToTop}
          className="fixed bottom-24 right-6 z-30 p-3 rounded-full bg-stone-900/90 text-amber-300 border border-stone-700 shadow-xl hover:bg-stone-800 active:scale-95 transition"
          title="Jump to Top"
          id="btn-reader-scroll-to-top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {/* Mobile & Desktop Mirror Quick-Flip & Alignment Floating Overlay */}
      <MobileMirrorOverlay
        mirrorData={mirrorData}
        displayMode={readerSettings.mirrorDisplayMode || 'original'}
        onSelectMode={(newMode) => {
          onUpdateReaderSettings({ ...readerSettings, mirrorDisplayMode: newMode });
        }}
        onOpenMirrorModal={() => setIsMirrorModalOpen(true)}
        untranslatedCount={
          (mirrorData?.untranslatedWords?.length || 0) +
          (mirrorData?.paragraphs?.flatMap((p) => p.words).filter((w) => w.keepOrig).length || 0)
        }
        showOnDesktop={readerSettings.showMirrorOverlayDesktop !== false}
        onToggleDesktopOverlay={() => {
          onUpdateReaderSettings({
            ...readerSettings,
            showMirrorOverlayDesktop: readerSettings.showMirrorOverlayDesktop === false ? true : false,
          });
        }}
        compositeCount={totalCompositeGroupsCount}
        compositePreference={mirrorData?.compositeDisplayMode || 'separated'}
        onToggleCompositePreference={handleToggleCompositeGlobalPreference}
      />

      {/* Floating Philological Manuscript Ribbon on Hovering Discontinuous Composite Word */}
      {activeHoveredCompositeInfo && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-40 bg-stone-950/95 border border-cyan-500/70 shadow-2xl shadow-stone-950/90 rounded-2xl px-4 py-2.5 text-xs text-stone-200 flex items-center space-x-3.5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-xl pointer-events-none ring-1 ring-cyan-400/25">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse flex-shrink-0 shadow-sm shadow-cyan-400/80" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-cyan-300 text-[11px] bg-cyan-950/90 border border-cyan-700/60 px-1.5 py-0.5 rounded">
                ⚡ Group #{activeHoveredCompositeInfo.composite.groupIndex || 1}
              </span>
              <span className="font-serif italic text-stone-200 text-sm font-semibold truncate">
                "{activeHoveredCompositeInfo.composite.allPartsOrig?.join(' ... ')}"
              </span>
            </div>
            <div className="flex items-center space-x-1.5 mt-1 text-[11.5px] truncate">
              <span className="text-stone-400">Unified:</span>
              <span className="font-semibold text-cyan-200 font-sans">
                "{activeHoveredCompositeInfo.composite.compoundMeaning}"
              </span>
              <span className="text-stone-500">•</span>
              <span className="text-stone-400">Literal:</span>
              <span className="text-amber-300/90 font-serif">
                "{activeHoveredCompositeInfo.composite.allPartsSeparated?.join(' ... ')}"
              </span>
            </div>
          </div>
          <div className="text-[10px] text-cyan-300/80 border-l border-stone-800 pl-3 ml-auto select-none hidden sm:block whitespace-nowrap">
            Right-click word to configure
          </div>
        </div>
      )}

      {/* Reader Settings Modal */}
      <ReaderOptionsModal
        isOpen={showOptionsModal}
        onClose={() => setShowOptionsModal(false)}
        readerSettings={readerSettings}
        onUpdateReaderSettings={onUpdateReaderSettings}
        onOpenMirrorModal={() => setIsMirrorModalOpen(true)}
      />

      {/* Mirror Translation (Etymological Calque) Engine Modal */}
      <MirrorTranslationModal
        isOpen={isMirrorModalOpen}
        onClose={() => setIsMirrorModalOpen(false)}
        text={text}
        llmConfig={llmConfig || getLLMConfig()}
        blueprints={blueprints}
        currentMirrorData={mirrorData}
        llmModelBlueprints={llmModelBlueprints}
        onSelectModelBlueprint={onSelectModelBlueprint}
        onSaveMirrorData={(updatedData) => {
          saveMirrorTranslation(updatedData);
          setMirrorData(updatedData);
          if (currentUser) {
            syncMirrorTranslationToCloud(currentUser.uid, updatedData);
          }
        }}
        onDeleteMirrorData={() => {
          deleteMirrorTranslation(text.id);
          setMirrorData(null);
          if (currentUser) {
            deleteMirrorTranslationFromCloud(currentUser.uid, text.id);
          }
        }}
      />

      {/* Reader Custom Context Menu (Keep in Original & Deep Interactivity) */}
      <ReaderContextMenu
        menuState={contextMenu}
        onClose={() => setContextMenu(null)}
        onToggleKeepOrigSingle={handleToggleKeepOrigSingle}
        onToggleKeepOrigGlobal={handleToggleKeepOrigGlobal}
        onSaveWordTranslation={handleSaveWordTranslation}
        onSavePassageReplacement={handleSavePassageReplacement}
        onDeletePassageReplacement={handleDeletePassageReplacement}
        onTogglePreferCompound={handleTogglePreferCompound}
        onEditCompositeCompoundMeaning={handleEditCompositeCompoundMeaning}
        onUnlinkCompositeWord={handleUnlinkCompositeWord}
        onDecipherWord={(w) => onWordClick(w, activeWordBpId)}
        onDecipherWordWithWebAssist={(w) =>
          onWordClickWebAssist ? onWordClickWebAssist(w, activeWordBpId) : onWordClick(w, activeWordBpId)
        }
        onDecipherPassage={(p) => onPassageSelect(p, activePassageBpId)}
        onDecipherPassageWithWebAssist={(p) =>
          onPassageSelectWebAssist ? onPassageSelectWebAssist(p, activePassageBpId) : onPassageSelect(p, activePassageBpId)
        }
        onSpeak={(t) => {
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(t);
            window.speechSynthesis.speak(u);
          }
        }}
        activeWordBlueprintName={activeWordBp?.name}
        activePassageBlueprintName={activePassageBp?.name}
      />
    </div>
  );
};
