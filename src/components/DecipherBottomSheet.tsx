import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  BookmarkPlus, 
  Check, 
  Copy, 
  Volume2, 
  Code2, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle,
  RefreshCw,
  Square,
  Clock,
  Cpu,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Minimize2,
  Maximize2,
  BookOpen
} from 'lucide-react';
import { QueryResult, BlueprintType, Annotation } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface DecipherBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type: BlueprintType;
  targetText: string;
  blueprintName: string;
  result: QueryResult | null;
  isLoading: boolean;
  onSaveAnnotation: () => void;
  isSaved?: boolean;
  onRetry?: () => void;
  onHalt?: () => void;
  rawQueryPrompt?: string;
  isCached?: boolean;
  onForceReTranslate?: () => void;
  onRunCustomPrompt?: (customPrompt: string) => void;
  savedTranslations?: Annotation[];
  onDeleteSingleTranslation?: (annotationId: string) => void;
  createdAtDate?: string;
}

export const DecipherBottomSheet: React.FC<DecipherBottomSheetProps> = ({
  isOpen,
  onClose,
  type,
  targetText,
  blueprintName,
  result,
  isLoading,
  onSaveAnnotation,
  isSaved = false,
  onRetry,
  onHalt,
  rawQueryPrompt,
  isCached = false,
  onForceReTranslate,
  onRunCustomPrompt,
  savedTranslations = [],
  onDeleteSingleTranslation,
  createdAtDate,
}) => {
  const [copied, setCopied] = useState(false);
  const [showQueryCode, setShowQueryCode] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPromptText, setEditedPromptText] = useState(rawQueryPrompt || '');
  const [showRawJsonDebugger, setShowRawJsonDebugger] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);

  useEffect(() => {
    if (rawQueryPrompt) {
      setEditedPromptText(rawQueryPrompt);
    }
  }, [rawQueryPrompt]);

  // Reset version index to 0 (latest) when a new query / target starts
  useEffect(() => {
    setSelectedVersionIndex(0);
  }, [targetText, savedTranslations.length]);

  // Lock background text container scrolling while decipher translation window is open
  useEffect(() => {
    if (isOpen) {
      const originalBodyOverflow = document.body.style.overflow;
      const mainContainer = document.getElementById('main-scroll-container');
      const originalMainOverflow = mainContainer ? mainContainer.style.overflow : '';

      document.body.style.overflow = 'hidden';
      if (mainContainer) {
        mainContainer.style.overflow = 'hidden';
      }

      return () => {
        document.body.style.overflow = originalBodyOverflow;
        if (mainContainer) {
          mainContainer.style.overflow = originalMainOverflow;
        }
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Active translation to display
  const hasMultipleSaved = savedTranslations && savedTranslations.length > 0;
  const currentSavedAnnotation = hasMultipleSaved ? savedTranslations[selectedVersionIndex] : null;

  const displayedText = isLoading
    ? (result?.text || '')
    : (isCached && hasMultipleSaved && currentSavedAnnotation)
      ? currentSavedAnnotation.result
      : (result?.text || (hasMultipleSaved && currentSavedAnnotation ? currentSavedAnnotation.result : ''));

  const displayedModel = isLoading
    ? (result?.modelUsed || 'AI Model')
    : (isCached && hasMultipleSaved && currentSavedAnnotation)
      ? (currentSavedAnnotation.modelUsed || result?.modelUsed || 'AI Model')
      : (result?.modelUsed || currentSavedAnnotation?.modelUsed || 'AI Model');

  const displayedProvider = isLoading
    ? (result?.providerUsed || 'AI Provider')
    : (isCached && hasMultipleSaved && currentSavedAnnotation)
      ? (currentSavedAnnotation.providerUsed || result?.providerUsed || 'AI Provider')
      : (result?.providerUsed || currentSavedAnnotation?.providerUsed || 'AI Provider');

  const displayedDate = isLoading
    ? new Date().toISOString()
    : (isCached && hasMultipleSaved && currentSavedAnnotation)
      ? currentSavedAnnotation.createdAt
      : (createdAtDate || new Date().toISOString());

  const displayedPrompt = isLoading
    ? rawQueryPrompt
    : (isCached && hasMultipleSaved && currentSavedAnnotation)
      ? (currentSavedAnnotation.queryUsed || rawQueryPrompt)
      : rawQueryPrompt;

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Just now';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleCopy = () => {
    if (displayedText) {
      navigator.clipboard.writeText(displayedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSpeakTarget = () => {
    if ('speechSynthesis' in window && targetText) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(targetText);
      utterance.rate = 0.9;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleDeleteCurrentVersion = () => {
    if (currentSavedAnnotation && onDeleteSingleTranslation) {
      if (confirm(`Delete translation version (${formatDate(currentSavedAnnotation.createdAt)}) for "${targetText}"?`)) {
        onDeleteSingleTranslation(currentSavedAnnotation.id);
        if (selectedVersionIndex >= savedTranslations.length - 1) {
          setSelectedVersionIndex(Math.max(0, savedTranslations.length - 2));
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end items-center overflow-hidden">
      {/* Full-screen backdrop overlay covering everything outside the sheet panel */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300 cursor-pointer" 
        onClick={(e) => {
          e.stopPropagation();
          // If the user is actively customizing the prompt, do not close on outside click to prevent data loss
          if (!isEditingPrompt) {
            onClose();
          }
        }} 
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
        id="decipher-sheet-backdrop" 
      />

      {/* Sheet Content Panel */}
      <div 
        className="relative z-10 w-full max-w-2xl bg-stone-900 text-stone-100 rounded-t-3xl shadow-2xl border-t border-stone-700/80 max-h-[86vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
        id="decipher-sheet-panel"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Drag handle / quick dismiss to read text bar */}
        <div 
          className="w-full flex justify-center py-2 bg-stone-900 cursor-pointer hover:bg-stone-800/60 transition"
          onClick={onClose}
        >
          <div className="w-12 h-1.5 rounded-full bg-stone-700/80" />
        </div>

        {/* Header */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-stone-800 flex items-center justify-between bg-stone-900/95">
          <div className="flex items-center space-x-2.5 overflow-hidden flex-1 mr-2">
            <div className={`p-2 rounded-xl text-amber-200 border shrink-0 ${
              type === 'word' 
                ? 'bg-amber-950/80 border-amber-800/60' 
                : 'bg-purple-950/80 border-purple-800/60'
            }`}>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  type === 'word' 
                    ? 'bg-amber-900/60 text-amber-300 border border-amber-700/40' 
                    : 'bg-purple-900/60 text-purple-300 border border-purple-700/40'
                }`}>
                  {type === 'word' ? 'Word Etymology' : 'Passage Symbolism'}
                </span>
                <span className="text-xs text-stone-400 truncate max-w-[140px]">
                  {blueprintName}
                </span>
              </div>
              <h3 dir="auto" className="text-base sm:text-lg font-serif font-semibold text-amber-100 truncate mt-0.5" style={{ unicodeBidi: 'plaintext' }}>
                "{targetText}"
              </h3>
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Read Text Button */}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-amber-200 text-xs font-medium flex items-center space-x-1.5 border border-stone-700 transition"
              id="btn-sheet-minimize-read"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Read Text</span>
            </button>

            {/* Pronounce Target */}
            <button
              onClick={handleSpeakTarget}
              className={`p-2 rounded-xl transition border ${
                isSpeaking ? 'bg-amber-800 text-amber-200 border-amber-600 animate-pulse' : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
              }`}
              title="Pronounce Target"
              id="btn-sheet-speak-target"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Multiple Translations Version Switcher Toolbar */}
        {hasMultipleSaved && savedTranslations.length > 1 && !isLoading && (
          <div className="px-4 sm:px-5 py-2 bg-stone-950 border-b border-stone-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-stone-300 font-medium">
              <Layers className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Translation <strong className="text-amber-300 font-semibold">{selectedVersionIndex + 1}</strong> of {savedTranslations.length}
                {selectedVersionIndex === 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-bold">
                    Latest
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setSelectedVersionIndex((prev) => Math.max(0, prev - 1))}
                disabled={selectedVersionIndex === 0}
                className="p-1 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 hover:text-amber-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Newer version"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setSelectedVersionIndex((prev) => Math.min(savedTranslations.length - 1, prev + 1))}
                disabled={selectedVersionIndex === savedTranslations.length - 1}
                className="p-1 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 hover:text-amber-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Older version"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {onDeleteSingleTranslation && currentSavedAnnotation && (
                <button
                  onClick={handleDeleteCurrentVersion}
                  className="ml-2 px-2 py-1 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 hover:text-red-100 text-[11px] border border-red-800/50 flex items-center space-x-1 transition"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                  <span className="hidden sm:inline">Delete This Version</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Response Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4 font-sans text-stone-200 leading-relaxed text-sm">
          {result?.error ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 space-y-3">
              <div className="flex items-center space-x-2 text-red-300 font-medium text-sm">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Query Execution Error</span>
              </div>
              <p className="text-xs text-red-200/90 leading-normal">
                {result.error}
              </p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 text-red-100 text-xs font-medium flex items-center space-x-1.5 transition border border-red-700/50 cursor-pointer"
                  id="btn-sheet-retry"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Query</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stable Metadata Header: Serving Model, Date, Provider, Actions */}
              <div className="p-3 rounded-2xl bg-stone-950 border border-stone-800/90 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/70 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Serving Model Badge */}
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-stone-900 text-amber-300 border border-stone-800 font-mono text-[11px]">
                      <Cpu className="w-3.5 h-3.5 text-amber-400" />
                      <span>Model: <strong className="text-stone-100 font-normal">{displayedModel}</strong></span>
                    </span>

                    {/* Provider Badge */}
                    <span className="text-stone-400 text-[11px]">
                      via <strong className="text-stone-300 font-medium">{displayedProvider}</strong>
                    </span>

                    {isCached && !isLoading && (
                      <span className="inline-flex items-center space-x-1 text-[10px] bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-700/60 font-medium">
                        <span>Recalled Translation</span>
                      </span>
                    )}

                    {isLoading && (
                      <span className="inline-flex items-center space-x-1 text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded-full border border-amber-700/60 animate-pulse">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>Streaming real-time...</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowRawJsonDebugger(!showRawJsonDebugger)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center space-x-1 border transition shadow-xs cursor-pointer ${
                        showRawJsonDebugger 
                          ? 'bg-purple-800 text-purple-100 border-purple-600' 
                          : 'bg-stone-800 hover:bg-stone-700 text-purple-300 border-purple-800/60'
                      }`}
                      id="btn-sheet-toggle-json"
                    >
                      <Code2 className="w-3 h-3 text-purple-300" />
                      <span>Raw JSON</span>
                    </button>

                    {onForceReTranslate && !isLoading && (
                      <button
                        onClick={onForceReTranslate}
                        className="px-2.5 py-1 rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-100 text-[11px] font-medium flex items-center space-x-1 border border-amber-700/60 transition shadow-xs cursor-pointer"
                        id="btn-sheet-retranslate"
                      >
                        <RefreshCw className="w-3 h-3 text-amber-300" />
                        <span>New Translation</span>
                      </button>
                    )}

                    {isLoading && onHalt && (
                      <button
                        onClick={onHalt}
                        className="px-2 py-0.5 rounded-lg bg-red-950 hover:bg-red-900 text-red-300 text-[10px] font-medium flex items-center space-x-1 border border-red-800 transition cursor-pointer"
                        id="btn-halt-inline-stream"
                      >
                        <Square className="w-2.5 h-2.5 fill-red-400 text-red-400" />
                        <span>Halt</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Date Recalled/Stored */}
                <div className="flex items-center justify-between text-[11px] text-stone-400 pt-0.5">
                  <div className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-stone-500" />
                    <span>Translation Date: <strong className="text-stone-300 font-normal">{formatDate(displayedDate)}</strong></span>
                  </div>

                  {hasMultipleSaved && savedTranslations.length > 1 && (
                    <span className="text-[10px] text-stone-500">
                      Version {selectedVersionIndex + 1} of {savedTranslations.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Initial Loading Skeleton / State (prior to first streamed token) */}
              {isLoading && !displayedText && (
                <div className="py-6 space-y-4">
                  <div className="flex items-center space-x-3 text-amber-200/90 text-sm">
                    <div className="w-5 h-5 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin shrink-0" />
                    <span className="font-serif">Deciphering "{targetText}" via {displayedModel}...</span>
                  </div>
                  <div className="space-y-2.5 pt-1 animate-pulse">
                    <div className="h-4 bg-stone-800/80 rounded-md w-3/4" />
                    <div className="h-4 bg-stone-800/60 rounded-md w-full" />
                    <div className="h-4 bg-stone-800/50 rounded-md w-5/6" />
                  </div>
                  <div className="flex items-center space-x-2 pt-3">
                    <button
                      onClick={onClose}
                      className="px-3.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-200 text-xs font-medium flex items-center space-x-1.5 border border-stone-700 shadow-xs transition cursor-pointer"
                      id="btn-minimize-while-loading"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>Read Text While Loading</span>
                    </button>
                    {onHalt && (
                      <button
                        onClick={onHalt}
                        className="px-3 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-200 text-xs font-medium flex items-center space-x-1.5 border border-red-700/60 transition cursor-pointer"
                        id="btn-halt-initial-stream"
                      >
                        <Square className="w-3 h-3 fill-red-400 text-red-400" />
                        <span>Halt</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Formatted Markdown Output with KaTeX & Math ($$) Support */}
              {displayedText && (
                <div className="text-stone-200 leading-relaxed font-sans text-sm">
                  <MarkdownRenderer content={displayedText} />
                  {isLoading && (
                    <span className="inline-block w-2 h-4 ml-1 bg-amber-400 animate-pulse align-middle" />
                  )}
                </div>
              )}

              {/* Expandable Query Prompt & Raw JSON Debugger */}
              <div className="pt-2 border-t border-stone-800/80 space-y-2">
                {displayedPrompt && (
                  <div>
                    <div className="flex items-center justify-between py-1">
                      <button
                        onClick={() => setShowQueryCode(!showQueryCode)}
                        className="flex items-center space-x-1.5 text-xs text-stone-400 hover:text-amber-300"
                        id="btn-toggle-raw-query-prompt"
                      >
                        <Code2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>View exact message / prompt sent to LLM</span>
                        {showQueryCode ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {showQueryCode && !isEditingPrompt && onRunCustomPrompt && (
                        <button
                          onClick={() => setIsEditingPrompt(true)}
                          className="text-[10px] bg-amber-950 hover:bg-amber-900 text-amber-200 px-2 py-0.5 rounded-lg border border-amber-700/60 transition"
                          id="btn-enable-edit-prompt"
                        >
                          Edit Prompt Template
                        </button>
                      )}
                    </div>

                    {showQueryCode && (
                      <div className="mt-2 p-3 rounded-lg bg-stone-950 border border-stone-800 space-y-2">
                        {isEditingPrompt ? (
                          <div className="space-y-2">
                            <textarea
                              rows={5}
                              value={editedPromptText}
                              onChange={(e) => setEditedPromptText(e.target.value)}
                              className="w-full p-2.5 rounded-lg bg-stone-900 border border-amber-700/60 font-mono text-[11px] text-amber-200 leading-relaxed focus:outline-hidden"
                              id="textarea-edit-raw-prompt"
                            />
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => setIsEditingPrompt(false)}
                                className="px-2.5 py-1 rounded-lg bg-stone-800 text-stone-300 text-[11px]"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  setIsEditingPrompt(false);
                                  if (onRunCustomPrompt && editedPromptText.trim()) {
                                    onRunCustomPrompt(editedPromptText.trim());
                                  }
                                }}
                                className="px-3 py-1 rounded-lg bg-amber-700 hover:bg-amber-600 text-amber-50 text-[11px] font-medium flex items-center space-x-1"
                                id="btn-run-edited-prompt"
                              >
                                <Sparkles className="w-3 h-3 text-amber-200" />
                                <span>Run Custom Prompt</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="font-mono text-[11px] text-amber-200/80 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                            {displayedPrompt}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Raw JSON Answer Debugger View */}
                <div>
                  <button
                    onClick={() => setShowRawJsonDebugger(!showRawJsonDebugger)}
                    className="flex items-center justify-between w-full text-xs text-stone-400 hover:text-purple-300 py-1"
                    id="btn-toggle-raw-json-debugger"
                  >
                    <span className="flex items-center space-x-1.5">
                      <Code2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>View raw JSON call / response payloads (Debug mode)</span>
                    </span>
                    {showRawJsonDebugger ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showRawJsonDebugger && (
                    <div className="mt-2 p-3 rounded-xl bg-stone-950 border border-purple-900/50 font-mono text-[11px] text-purple-200/90 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto space-y-3 relative">
                      <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                        <span className="text-amber-400 font-bold font-sans text-xs flex items-center space-x-1.5">
                          <Code2 className="w-4 h-4 text-purple-400" />
                          <span>Raw JSON Call & Answer Debugger</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const fullJson = JSON.stringify(
                              {
                                metadata: {
                                  targetText,
                                  type,
                                  blueprintName,
                                  date: displayedDate,
                                  servingModel: displayedModel,
                                  provider: displayedProvider,
                                },
                                request: {
                                  prompt: displayedPrompt,
                                  requestPayload: result?.rawRequestPayload || null,
                                },
                                answer: {
                                  provider: displayedProvider,
                                  model: displayedModel,
                                  rawTextOutput: displayedText,
                                  rawResponsePayload: result?.rawResponsePayload || null,
                                },
                              },
                              null,
                              2
                            );
                            navigator.clipboard.writeText(fullJson);
                            alert('Raw JSON copied to clipboard!');
                          }}
                          className="px-2 py-0.5 rounded bg-purple-950 hover:bg-purple-900 text-purple-200 text-[10px] border border-purple-700/60 transition cursor-pointer"
                          id="btn-copy-raw-json"
                        >
                          Copy Raw JSON
                        </button>
                      </div>

                      <div>
                        <span className="text-amber-400 font-bold">// Query Payload Sent to Model:</span>
                        <pre className="mt-1 text-[10px] text-stone-300 overflow-x-auto bg-stone-900 p-2 rounded-lg border border-stone-800">
                          {JSON.stringify(
                            {
                              type,
                              targetText,
                              blueprintName,
                              prompt: displayedPrompt,
                              requestPayload: result?.rawRequestPayload || null,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>

                      <div className="pt-2 border-t border-stone-800">
                        <span className="text-emerald-400 font-bold">// Raw Model Answer Payload:</span>
                        <pre className="mt-1 text-[10px] text-stone-300 overflow-x-auto bg-stone-900 p-2 rounded-lg border border-stone-800">
                          {JSON.stringify(
                            {
                              provider: displayedProvider,
                              model: displayedModel,
                              date: displayedDate,
                              rawTextOutput: displayedText,
                              rawResponsePayload: result?.rawResponsePayload || null,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        {!isLoading && displayedText && !result?.error && (
          <div className="p-3.5 sm:p-4 border-t border-stone-800 bg-stone-900/95 flex items-center justify-between space-x-3">
            <button
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium flex items-center space-x-1.5 transition border border-stone-700"
              id="btn-sheet-copy"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-stone-400" />}
              <span>{copied ? 'Copied' : 'Copy Result'}</span>
            </button>

            <button
              onClick={onSaveAnnotation}
              className="flex-1 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center space-x-2 shadow-md transition bg-amber-700 hover:bg-amber-600 text-amber-50 active:scale-[0.98]"
              id="btn-sheet-save-annotation"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span>{isSaved ? 'Save As Additional Translation' : 'Save to Text Annotations'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
