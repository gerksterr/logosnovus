import React, { useEffect, useRef, useState } from 'react';
import { 
  Languages, 
  Sparkles, 
  Copy, 
  Volume2, 
  Edit3, 
  Globe, 
  Check, 
  X, 
  Layers, 
  ArrowRightLeft,
  RotateCcw,
  BookOpen,
  Trash2,
  BookmarkCheck,
  Type,
  Zap,
  Link,
  Unlink
} from 'lucide-react';
import { MirrorWordPair, MirrorPassageReplacement, MirrorCompositeLink } from '../types';

export interface ContextMenuState {
  x: number;
  y: number;
  word: string;
  cleanWord: string;
  pIdx: number;
  wIdx: number;
  isWordKeepOrig: boolean;
  isAllKeepOrig: boolean;
  mirrorPair?: MirrorWordPair;
  selectedText?: string;
  selectedRange?: {
    pIdx: number;
    startWIdx: number;
    endWIdx: number;
    origText: string;
    wordCount: number;
  };
  activePassageReplacement?: MirrorPassageReplacement;
  matchedExistingTranslation?: {
    target: string;
    summary?: string;
    blueprintName?: string;
  };
  hasMirrorData: boolean;
}

export interface ReaderContextMenuProps {
  menuState: ContextMenuState | null;
  activeWordBlueprintName?: string;
  activePassageBlueprintName?: string;
  onClose: () => void;
  onToggleKeepOrigSingle: (pIdx: number, wIdx: number) => void;
  onToggleKeepOrigGlobal: (cleanWord: string) => void;
  onSaveWordTranslation: (pIdx: number, wIdx: number, newTrans: string) => void;
  onSavePassageReplacement: (
    pIdx: number,
    startWIdx: number,
    endWIdx: number,
    origText: string,
    customTrans: string
  ) => void;
  onDeletePassageReplacement: (replacementId: string) => void;
  onDecipherWord: (cleanWord: string) => void;
  onDecipherWordWithWebAssist?: (cleanWord: string) => void;
  onDecipherPassage?: (passageText: string) => void;
  onDecipherPassageWithWebAssist?: (passageText: string) => void;
  onSpeak: (text: string) => void;
  onTogglePreferCompound?: (pIdx: number, wIdx: number) => void;
  onEditCompositeCompoundMeaning?: (pIdx: number, groupId: string, newMeaning: string) => void;
  onUnlinkCompositeWord?: (pIdx: number, wIdx: number) => void;
}

export const ReaderContextMenu: React.FC<ReaderContextMenuProps> = (props) => {
  if (!props.menuState) return null;
  return <ReaderContextMenuInner {...props} menuState={props.menuState} />;
};

const ReaderContextMenuInner: React.FC<ReaderContextMenuProps & { menuState: ContextMenuState }> = ({
  menuState,
  activeWordBlueprintName,
  activePassageBlueprintName,
  onClose,
  onToggleKeepOrigSingle,
  onToggleKeepOrigGlobal,
  onSaveWordTranslation,
  onSavePassageReplacement,
  onDeletePassageReplacement,
  onDecipherWord,
  onDecipherWordWithWebAssist,
  onDecipherPassage,
  onDecipherPassageWithWebAssist,
  onSpeak,
  onTogglePreferCompound,
  onEditCompositeCompoundMeaning,
  onUnlinkCompositeWord,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isEditingWordInline, setIsEditingWordInline] = useState(false);
  const [isEditingPassageInline, setIsEditingPassageInline] = useState(false);
  const [isEditingCompositeInline, setIsEditingCompositeInline] = useState(false);

  const [editedWordTrans, setEditedWordTrans] = useState(menuState.mirrorPair?.trans || '');
  const [editedPassageTrans, setEditedPassageTrans] = useState(
    menuState.activePassageReplacement?.customTrans || ''
  );
  const [editedCompositeMeaning, setEditedCompositeMeaning] = useState(
    menuState.mirrorPair?.composite?.compoundMeaning || ''
  );
  const [copied, setCopied] = useState(false);

  // Position the menu and clamp inside viewport
  const [coords, setCoords] = useState({ x: menuState.x, y: menuState.y });

  useEffect(() => {
    const updatePosition = () => {
      if (!menuRef.current) return;
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 12;
      let newX = menuState.x;
      let newY = menuState.y;

      if (newX + rect.width > window.innerWidth - padding) {
        newX = window.innerWidth - rect.width - padding;
      }
      if (newY + rect.height > window.innerHeight - padding) {
        newY = window.innerHeight - rect.height - padding;
      }
      if (newX < padding) newX = padding;
      if (newY < padding) newY = padding;

      setCoords({ x: newX, y: newY });
    };

    updatePosition();
    const timer = setTimeout(updatePosition, 10);
    return () => clearTimeout(timer);
  }, [menuState.x, menuState.y, isEditingWordInline, isEditingPassageInline, isEditingCompositeInline]);

  // Click outside and escape key dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [onClose]);

  const handleCopy = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 800);
  };

  const handleSaveWordEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editedWordTrans.trim()) {
      onSaveWordTranslation(menuState.pIdx, menuState.wIdx, editedWordTrans.trim());
    }
    setIsEditingWordInline(false);
    onClose();
  };

  const handleSavePassageEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetRange = menuState.selectedRange || {
      pIdx: menuState.pIdx,
      startWIdx: menuState.activePassageReplacement?.startWIdx ?? menuState.wIdx,
      endWIdx: menuState.activePassageReplacement?.endWIdx ?? menuState.wIdx,
      origText: menuState.activePassageReplacement?.origText ?? menuState.word,
      wordCount: 1,
    };

    if (editedPassageTrans.trim()) {
      onSavePassageReplacement(
        targetRange.pIdx,
        targetRange.startWIdx,
        targetRange.endWIdx,
        targetRange.origText,
        editedPassageTrans.trim()
      );
    }
    setIsEditingPassageInline(false);
    onClose();
  };

  const handleSaveCompositeEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (menuState.mirrorPair?.composite && onEditCompositeCompoundMeaning && editedCompositeMeaning.trim()) {
      onEditCompositeCompoundMeaning(
        menuState.pIdx,
        menuState.mirrorPair.composite.id,
        editedCompositeMeaning.trim()
      );
    }
    setIsEditingCompositeInline(false);
    onClose();
  };

  const composite = menuState.mirrorPair?.composite;
  const isMultiWordSelection = Boolean(
    menuState.selectedRange && menuState.selectedRange.wordCount > 1
  );
  const isSelectionActive = Boolean(
    menuState.selectedText && menuState.selectedText.trim().length > 1
  );

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${coords.x}px`,
        top: `${coords.y}px`,
      }}
      className="z-50 w-80 max-w-[94vw] bg-stone-900/98 backdrop-blur-md border border-stone-700/80 rounded-2xl shadow-2xl text-stone-200 text-xs py-2 animate-in fade-in zoom-in-95 duration-150 select-none cursor-default font-sans overflow-y-auto max-h-[85vh]"
      id="reader-custom-context-menu"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Info */}
      <div className="px-3.5 py-2 border-b border-stone-800 flex items-center justify-between">
        <div className="space-y-0.5 overflow-hidden pr-2">
          <div className="flex items-center space-x-1.5">
            <span className="font-serif font-bold text-amber-200 text-sm truncate">
              {menuState.activePassageReplacement
                ? menuState.activePassageReplacement.origText
                : isMultiWordSelection
                ? menuState.selectedRange!.origText
                : menuState.word}
            </span>
            {composite && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-950/90 text-cyan-300 border border-cyan-600/70 font-mono flex items-center space-x-1 shrink-0">
                <Zap className="w-2.5 h-2.5 text-cyan-400" />
                <span>Pair ⚡{composite.groupIndex || 1}</span>
              </span>
            )}
            {menuState.activePassageReplacement && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-600/60 font-mono flex items-center space-x-1 shrink-0">
                <Edit3 className="w-2.5 h-2.5" />
                <span>Custom Span</span>
              </span>
            )}
            {!menuState.activePassageReplacement && menuState.isWordKeepOrig && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-mono flex items-center space-x-1 shrink-0">
                <Globe className="w-2.5 h-2.5" />
                <span>Original</span>
              </span>
            )}
          </div>
          <div className="text-[11px] text-stone-400 truncate flex items-center space-x-1">
            {composite ? (
              <span className="text-cyan-300 truncate">
                Compound: <strong className="font-semibold text-cyan-100 font-mono">"{composite.compoundMeaning}"</strong> (Gloss: "{composite.separatedMeaning}")
              </span>
            ) : menuState.activePassageReplacement ? (
              <span className="text-amber-300">
                Custom Mirror: <strong className="font-mono">"{menuState.activePassageReplacement.customTrans}"</strong>
              </span>
            ) : menuState.isWordKeepOrig ? (
              <span className="text-emerald-400">Untranslated in Mirror Mode</span>
            ) : menuState.mirrorPair?.trans ? (
              <span>
                Mirror Calque: <strong className="text-amber-300 font-mono">"{menuState.mirrorPair.trans}"</strong>
              </span>
            ) : (
              <span>Original Language</span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition"
          title="Close menu"
          id="btn-context-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 1. DISCONTINUOUS COMPOSITE WORD ACTIONS (Separable Verbs / Tmesis) */}
      {composite && (
        <div className="py-1 bg-cyan-950/30 border-b border-cyan-900/60 my-0.5">
          <div className="px-3.5 pt-1 pb-0.5 text-[10px] uppercase font-mono tracking-wider text-cyan-400 font-semibold flex items-center justify-between">
            <span className="flex items-center space-x-1">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>Separable Composite Word</span>
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-900/80 text-cyan-200 border border-cyan-700/50">
              Part {composite.partIndex + 1} of {composite.totalParts}
            </span>
          </div>

          {/* Composite Overview Card */}
          <div className="px-3.5 py-1.5 space-y-1.5">
            <div className="bg-black/50 p-2 rounded-xl border border-cyan-800/40 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-stone-400">Linked Words:</span>
                <span className="font-serif font-bold text-amber-200">
                  {composite.allPartsOrig?.join(' ... ') || menuState.word}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-stone-400">Separated Meanings:</span>
                <span className="font-mono text-stone-300">
                  {composite.allPartsSeparated?.map((s) => `"${s}"`).join(' + ') || `"${composite.separatedMeaning}"`}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-0.5 border-t border-cyan-900/40">
                <span className="text-cyan-400 font-semibold">Compound Meaning:</span>
                <span className="font-mono font-bold text-cyan-200">
                  "{composite.compoundMeaning}"
                </span>
              </div>
            </div>

            {/* Inline Edit Composite Compound Meaning */}
            {isEditingCompositeInline ? (
              <form onSubmit={handleSaveCompositeEdit} className="space-y-1.5 pt-1">
                <label className="text-[10px] text-cyan-300 font-mono">
                  Edit Unified Compound Meaning:
                </label>
                <input
                  type="text"
                  value={editedCompositeMeaning}
                  onChange={(e) => setEditedCompositeMeaning(e.target.value)}
                  autoFocus
                  placeholder="e.g. distinguishes, yields, attaches"
                  className="w-full bg-stone-900 border border-cyan-500 rounded-lg px-2 py-1 text-xs text-cyan-100 font-sans focus:outline-hidden focus:ring-1 focus:ring-cyan-400"
                />
                <div className="flex items-center justify-end space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setIsEditingCompositeInline(false)}
                    className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded text-xs"
                  >
                    Save Compound
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center space-x-1 pt-0.5">
                {onTogglePreferCompound && (
                  <button
                    onClick={() => {
                      onTogglePreferCompound(menuState.pIdx, menuState.wIdx);
                      onClose();
                    }}
                    className={`flex-1 px-2 py-1 rounded-lg text-[11px] font-medium flex items-center justify-center space-x-1 transition cursor-pointer ${
                      menuState.mirrorPair?.preferCompoundInMirror
                        ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                        : 'bg-stone-800 text-cyan-300 hover:bg-stone-750 border border-cyan-800/60'
                    }`}
                    title="Toggle whether mirror mode shows compound meaning or separated literal gloss"
                    id="btn-context-toggle-composite-pref"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>
                      {menuState.mirrorPair?.preferCompoundInMirror ? 'Showing Compound' : 'Showing Literal'}
                    </span>
                  </button>
                )}

                <button
                  onClick={() => setIsEditingCompositeInline(true)}
                  className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-cyan-300 border border-cyan-800/60 transition cursor-pointer"
                  title="Edit compound meaning"
                  id="btn-context-edit-composite"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>

                {onUnlinkCompositeWord && (
                  <button
                    onClick={() => {
                      onUnlinkCompositeWord(menuState.pIdx, menuState.wIdx);
                      onClose();
                    }}
                    className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition cursor-pointer"
                    title="Unlink from composite group"
                    id="btn-context-unlink-composite"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Decipher Combined Lemma Action */}
            <button
              onClick={() => {
                const combinedLemma = composite.allPartsOrig?.join(' ') || menuState.cleanWord;
                onDecipherWord(combinedLemma);
                onClose();
              }}
              className="w-full px-2.5 py-1.5 rounded-lg bg-cyan-900/40 hover:bg-cyan-850 text-cyan-200 border border-cyan-700/50 text-[11px] font-medium flex items-center justify-between group transition cursor-pointer"
              id="btn-context-decipher-composite"
            >
              <span className="flex items-center space-x-1.5 truncate">
                <Sparkles className="w-3 h-3 text-cyan-300 group-hover:scale-110 transition-transform" />
                <span className="truncate">Decipher combined "{composite.allPartsOrig?.join(' ... ')}"</span>
              </span>
              <span className="text-[10px] text-cyan-400 font-mono">Blueprint</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. TRANSLATED PASSAGE BELOW WORD (Immediate one-tap access for phone & touch) */}
      {menuState.matchedExistingTranslation && (
        <div className="py-1 bg-amber-950/40 border-b border-amber-900/60">
          <div className="px-3.5 pt-1 pb-0.5 text-[10px] uppercase font-mono tracking-wider text-amber-400 font-semibold flex items-center justify-between">
            <span className="flex items-center space-x-1">
              <BookmarkCheck className="w-3 h-3 text-amber-400" />
              <span>Passage Translation Under Cursor</span>
            </span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-800/60 text-amber-200">
              Saved Decipher
            </span>
          </div>
          <button
            onClick={() => {
              if (onDecipherPassage && menuState.matchedExistingTranslation) {
                onDecipherPassage(menuState.matchedExistingTranslation.target);
                onClose();
              }
            }}
            className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-amber-900/50 text-left transition group cursor-pointer"
            id="btn-context-view-existing-passage-translation"
          >
            <BookOpen className="w-4 h-4 text-amber-300 shrink-0 group-hover:scale-110 transition-transform" />
            <div className="overflow-hidden">
              <div className="font-semibold text-amber-100 group-hover:text-amber-50 truncate">
                View Translation for this Passage
              </div>
              <div className="text-[11px] text-amber-300/80 truncate italic">
                "{menuState.matchedExistingTranslation.target}"
              </div>
            </div>
          </button>
        </div>
      )}

      {/* 3. CUSTOM PASSAGE TRANSLATION (Highlight & Replace multi-word passages) */}
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] uppercase font-mono tracking-wider text-amber-400/70">
          Custom Passage Calque
        </div>

        {/* If word is currently part of an active custom passage replacement */}
        {menuState.activePassageReplacement && !isEditingPassageInline && (
          <div className="px-3.5 py-1.5 space-y-1.5 bg-amber-950/30 rounded-xl mx-2 border border-amber-700/40 my-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-amber-300 font-mono font-medium">
                Active Custom Replacement
              </span>
              <span className="text-[10px] text-stone-400">
                {menuState.activePassageReplacement.origText.split(/\s+/).length} words
              </span>
            </div>
            <p className="text-xs text-amber-100 font-serif italic bg-black/40 p-1.5 rounded-lg border border-amber-800/40">
              "{menuState.activePassageReplacement.customTrans}"
            </p>
            <div className="flex items-center space-x-1.5 pt-1">
              <button
                onClick={() => {
                  setEditedPassageTrans(menuState.activePassageReplacement!.customTrans);
                  setIsEditingPassageInline(true);
                }}
                className="flex-1 px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-200 text-[11px] font-medium flex items-center justify-center space-x-1 cursor-pointer transition"
                id="btn-context-edit-custom-passage"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit Custom Text</span>
              </button>
              <button
                onClick={() => {
                  onDeletePassageReplacement(menuState.activePassageReplacement!.id);
                  onClose();
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-200 text-[11px] font-medium flex items-center space-x-1 cursor-pointer transition"
                title="Delete custom replacement and restore default word calques"
                id="btn-context-delete-custom-passage"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}

        {/* If user highlighted a passage (multiple words) and wants to create/edit custom replacement */}
        {(isMultiWordSelection || isEditingPassageInline) && (
          <div>
            {!isEditingPassageInline ? (
              <button
                onClick={() => {
                  setEditedPassageTrans(menuState.selectedText || '');
                  setIsEditingPassageInline(true);
                }}
                className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-stone-800/90 text-left transition group cursor-pointer"
                id="btn-context-create-passage-replacement"
              >
                <Type className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
                <div className="overflow-hidden">
                  <div className="font-medium text-stone-200 group-hover:text-amber-100 truncate">
                    Replace Passage Translation...
                  </div>
                  <div className="text-[10px] text-stone-500 truncate">
                    Set custom mirror text for {menuState.selectedRange?.wordCount || 'selected'} words
                  </div>
                </div>
              </button>
            ) : (
              <form onSubmit={handleSavePassageEdit} className="px-3.5 py-2 space-y-2 bg-stone-950/80 border-y border-stone-800">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-amber-300 font-mono">
                    Custom Mirror Text for Passage:
                  </label>
                  <span className="text-[9px] text-stone-400">
                    {menuState.selectedRange?.wordCount || 1} words
                  </span>
                </div>
                <div className="text-[11px] text-stone-400 italic bg-stone-900 p-1 rounded font-serif truncate">
                  "{menuState.selectedRange?.origText || menuState.activePassageReplacement?.origText || menuState.word}"
                </div>
                <textarea
                  value={editedPassageTrans}
                  onChange={(e) => setEditedPassageTrans(e.target.value)}
                  autoFocus
                  rows={2}
                  placeholder="Enter custom English mirror translation for this passage..."
                  className="w-full bg-stone-900 border border-amber-500/70 rounded-lg p-2 text-xs text-amber-100 focus:outline-hidden focus:ring-1 focus:ring-amber-400 resize-none font-sans"
                />
                <div className="flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingPassageInline(false)}
                    className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-semibold flex items-center space-x-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Custom Text</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-stone-800 my-1" />

      {/* 4. WORD-LEVEL MIRROR SETTINGS (Keep in Original, Inline Edit) */}
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] uppercase font-mono tracking-wider text-amber-400/70">
          Word Calque Settings
        </div>

        {/* Toggle Single Word Occurrence */}
        <button
          onClick={() => {
            onToggleKeepOrigSingle(menuState.pIdx, menuState.wIdx);
            onClose();
          }}
          className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-stone-800/90 text-left transition group cursor-pointer"
          id="btn-context-toggle-keep-orig-single"
        >
          <div className="flex items-center space-x-2.5">
            <Globe className={`w-4 h-4 ${menuState.isWordKeepOrig ? 'text-amber-400' : 'text-stone-400 group-hover:text-amber-300'}`} />
            <div>
              <div className="font-medium text-stone-200 group-hover:text-amber-100">
                {menuState.isWordKeepOrig ? 'Translate this word in mirror mode' : 'Leave this word in original language'}
              </div>
              <div className="text-[10px] text-stone-500">
                {menuState.isWordKeepOrig ? 'Restore English mirror translation' : 'Do not translate in Mirror Mode'}
              </div>
            </div>
          </div>
          {menuState.isWordKeepOrig && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
        </button>

        {/* Toggle Global (All occurrences of this word) */}
        {menuState.cleanWord && (
          <button
            onClick={() => {
              onToggleKeepOrigGlobal(menuState.cleanWord);
              onClose();
            }}
            className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-stone-800/90 text-left transition group cursor-pointer"
            id="btn-context-toggle-keep-orig-global"
          >
            <div className="flex items-center space-x-2.5">
              <Layers className={`w-4 h-4 ${menuState.isAllKeepOrig ? 'text-emerald-400' : 'text-stone-400 group-hover:text-emerald-300'}`} />
              <div>
                <div className="font-medium text-stone-200 group-hover:text-emerald-100">
                  {menuState.isAllKeepOrig
                    ? `Translate all "${menuState.cleanWord}" in mirror mode`
                    : `Leave all "${menuState.cleanWord}" in original language`}
                </div>
                <div className="text-[10px] text-stone-500">
                  {menuState.isAllKeepOrig
                    ? 'Allow mirror translation across entire text'
                    : 'Keep every occurrence in original language'}
                </div>
              </div>
            </div>
            {menuState.isAllKeepOrig && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
          </button>
        )}

        {/* Inline Edit Word Calque */}
        {!isEditingWordInline ? (
          <button
            onClick={() => setIsEditingWordInline(true)}
            className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-stone-800/90 text-left transition group cursor-pointer"
            id="btn-context-edit-word-trans"
          >
            <Edit3 className="w-4 h-4 text-stone-400 group-hover:text-amber-300" />
            <div>
              <div className="font-medium text-stone-200 group-hover:text-amber-100">
                Edit single word calque...
              </div>
              <div className="text-[10px] text-stone-500">
                Custom calque word mapping
              </div>
            </div>
          </button>
        ) : (
          <form onSubmit={handleSaveWordEdit} className="px-3.5 py-2 space-y-2 bg-stone-950/60 border-y border-stone-800">
            <label className="text-[10px] text-amber-300 font-mono">
              Mirror translation for "{menuState.word}":
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={editedWordTrans}
                onChange={(e) => setEditedWordTrans(e.target.value)}
                autoFocus
                placeholder="e.g. spirit, violence-deed"
                className="w-full bg-stone-900 border border-amber-500/70 rounded-lg px-2 py-1 text-xs text-amber-100 focus:outline-hidden focus:ring-1 focus:ring-amber-400 font-sans"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-semibold"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditingWordInline(false)}
                className="px-1.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-400 rounded-lg text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="border-t border-stone-800 my-1" />

      {/* 5. DECIPHER & BLUEPRINT ACTIONS */}
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] uppercase font-mono tracking-wider text-amber-400/70">
          Decipher & Blueprint
        </div>

        {/* Decipher Word */}
        <button
          onClick={() => {
            onDecipherWord(menuState.cleanWord || menuState.word);
            onClose();
          }}
          className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-stone-800/90 text-left transition group cursor-pointer"
          id="btn-context-decipher-word"
        >
          <Sparkles className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
          <div className="truncate">
            <div className="font-medium text-stone-200 group-hover:text-amber-100 truncate">
              Decipher "{menuState.cleanWord || menuState.word}"
            </div>
            <div className="text-[10px] text-stone-500 truncate">
              with {activeWordBlueprintName || 'Active Blueprint'}
            </div>
          </div>
        </button>

        {/* Ask Word via Web UI Assist */}
        {onDecipherWordWithWebAssist && (
          <button
            onClick={() => {
              onDecipherWordWithWebAssist(menuState.cleanWord || menuState.word);
              onClose();
            }}
            className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-purple-950/40 text-left transition group cursor-pointer border border-transparent hover:border-purple-800/40 rounded-lg mx-0.5"
            id="btn-context-web-assist-word"
          >
            <Globe className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform shrink-0" />
            <div className="truncate">
              <div className="font-medium text-purple-200 group-hover:text-purple-100 truncate flex items-center space-x-1.5">
                <span>Ask via Web UI Assist</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-900/80 text-purple-300 font-mono">Claude / ChatGPT / AI Studio</span>
              </div>
              <div className="text-[10px] text-stone-400 truncate">
                Copy prompt & launch web browser AI
              </div>
            </div>
          </button>
        )}

        {/* Decipher Selected Passage if any */}
        {isSelectionActive && onDecipherPassage && (
          <button
            onClick={() => {
              if (menuState.selectedText) {
                onDecipherPassage(menuState.selectedText);
                onClose();
              }
            }}
            className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-stone-800/90 text-left transition group cursor-pointer"
            id="btn-context-decipher-passage"
          >
            <BookOpen className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
            <div className="truncate">
              <div className="font-medium text-stone-200 group-hover:text-amber-100 truncate">
                Decipher Selected Passage
              </div>
              <div className="text-[10px] text-stone-500 truncate italic">
                "{menuState.selectedText?.slice(0, 30)}..."
              </div>
            </div>
          </button>
        )}

        {/* Ask Selected Passage via Web UI Assist */}
        {isSelectionActive && onDecipherPassageWithWebAssist && (
          <button
            onClick={() => {
              if (menuState.selectedText) {
                onDecipherPassageWithWebAssist(menuState.selectedText);
                onClose();
              }
            }}
            className="w-full px-3.5 py-2 flex items-center space-x-2.5 hover:bg-purple-950/40 text-left transition group cursor-pointer border border-transparent hover:border-purple-800/40 rounded-lg mx-0.5"
            id="btn-context-web-assist-passage"
          >
            <Globe className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform shrink-0" />
            <div className="truncate">
              <div className="font-medium text-purple-200 group-hover:text-purple-100 truncate flex items-center space-x-1.5">
                <span>Ask Passage via Web UI Assist</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-900/80 text-purple-300 font-mono">Claude / ChatGPT</span>
              </div>
              <div className="text-[10px] text-stone-400 truncate italic">
                "{menuState.selectedText?.slice(0, 30)}..."
              </div>
            </div>
          </button>
        )}
      </div>

      <div className="border-t border-stone-800 my-1" />

      {/* 6. AUDIO & CLIPBOARD UTILITIES */}
      <div className="py-1 space-y-0.5">
        <button
          onClick={() => {
            onSpeak(menuState.word);
            onClose();
          }}
          className="w-full px-3.5 py-1.5 flex items-center space-x-2.5 hover:bg-stone-800/90 text-left transition group cursor-pointer"
          id="btn-context-speak"
        >
          <Volume2 className="w-4 h-4 text-stone-400 group-hover:text-amber-300" />
          <span className="text-stone-300 group-hover:text-stone-100">Listen / Pronounce</span>
        </button>

        <button
          onClick={() => handleCopy(menuState.cleanWord || menuState.word)}
          className="w-full px-3.5 py-1.5 flex items-center space-x-2.5 hover:bg-stone-800/90 text-left transition group cursor-pointer"
          id="btn-context-copy-word"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4 text-stone-400 group-hover:text-amber-300" />
          )}
          <span className="text-stone-300 group-hover:text-stone-100">
            {copied ? 'Copied word!' : 'Copy original word'}
          </span>
        </button>

        {menuState.mirrorPair?.trans && (
          <button
            onClick={() => handleCopy(menuState.mirrorPair!.trans)}
            className="w-full px-3.5 py-1.5 flex items-center space-x-2.5 hover:bg-stone-800/90 text-left transition group cursor-pointer"
            id="btn-context-copy-trans"
          >
            <ArrowRightLeft className="w-4 h-4 text-stone-400 group-hover:text-amber-300" />
            <span className="text-stone-300 group-hover:text-stone-100">
              Copy mirror translation
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
