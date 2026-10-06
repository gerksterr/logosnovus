import React, { useState, useEffect, useRef } from 'react';
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
  BookOpen,
  MessageSquare,
  Send,
  Bot,
  User,
  Globe,
  SlidersHorizontal,
  Zap
} from 'lucide-react';
import { QueryResult, BlueprintType, Annotation, QueryBlueprint, TranslationChatMessage, LLMConfig, LLMModelBlueprint } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { executeTranslationChatStream, resolveLLMConfigForBlueprint } from '../services/llmService';
import { getStoredDecipherChat, saveDecipherChat } from '../services/storageService';
import { ModelBlueprintSwitcher } from './ModelBlueprintSwitcher';
import { TranslationChatInput } from './TranslationChatInput';
import { WebAssistWorkspace } from './WebAssistWorkspace';
// [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
import { 
  getLegacyChatForTarget, 
  assignLegacyChatToAnnotation, 
  dismissLegacyChat 
} from '../services/legacyChatMigrationService';

interface DecipherBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type: BlueprintType;
  targetText: string;
  blueprintName: string;
  activeBlueprintId?: string;
  result: QueryResult | null;
  isLoading: boolean;
  onSaveAnnotation: () => void;
  onApplyWebAssistResult?: (responseText: string, siteName: string, siteUrl?: string) => void;
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
  applicableBlueprints?: QueryBlueprint[];
  onSelectBlueprint?: (blueprintId: string) => void;
  onUpdateAnnotationConversation?: (annotationId: string, conversation: TranslationChatMessage[]) => void;
  llmConfig?: LLMConfig;
  llmModelBlueprints?: LLMModelBlueprint[];
  onSelectModelBlueprint?: (model: LLMModelBlueprint) => void;
}

const QUICK_CHAT_SUGGESTIONS = [
  'Analyze the morphology and grammatical syntax in detail',
  'What is the historical etymology and root breakdown?',
  'Explain any esoteric, symbolic, or philosophical significance',
  'Provide 3 alternative translation nuances in context'
];

export const DecipherBottomSheet: React.FC<DecipherBottomSheetProps> = ({
  isOpen,
  onClose,
  type,
  targetText,
  blueprintName,
  activeBlueprintId,
  result,
  isLoading,
  onSaveAnnotation,
  onApplyWebAssistResult,
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
  applicableBlueprints = [],
  onSelectBlueprint,
  onUpdateAnnotationConversation,
  llmConfig,
  llmModelBlueprints,
  onSelectModelBlueprint,
}) => {
  const [copied, setCopied] = useState(false);
  const [showQueryCode, setShowQueryCode] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPromptText, setEditedPromptText] = useState(rawQueryPrompt || '');
  const [showRawJsonDebugger, setShowRawJsonDebugger] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [showBlueprintPicker, setShowBlueprintPicker] = useState(false);
  const [isWebAssistOpen, setIsWebAssistOpen] = useState(false);

  // Active Blueprint & Active Model Blueprint resolution
  const activeBlueprint = applicableBlueprints.find((b) => b.id === activeBlueprintId);
  const activeModel = llmModelBlueprints?.find((m) => m.id === activeBlueprint?.modelBlueprintId) ||
    llmModelBlueprints?.find((m) => m.provider === 'web-assist' && (result?.modelUsed === m.modelName || result?.providerUsed === 'web-assist'));
  const isWebAssistProvider = result?.providerUsed === 'web-assist' || activeModel?.provider === 'web-assist';

  // Active translation to display
  const hasMultipleSaved = savedTranslations && savedTranslations.length > 0;
  const currentSavedAnnotation = hasMultipleSaved ? savedTranslations[selectedVersionIndex] : null;

  const displayedText = isLoading
    ? (result?.text || '')
    : (isCached && hasMultipleSaved && currentSavedAnnotation)
      ? currentSavedAnnotation.result
      : (result?.text || (hasMultipleSaved && currentSavedAnnotation ? currentSavedAnnotation.result : ''));

  // Automatically activate Web UI Assist when provider is web-assist and no translation text yet
  useEffect(() => {
    if (result?.providerUsed === 'web-assist' && (!displayedText || !displayedText.trim())) {
      setIsWebAssistOpen(true);
    }
  }, [result?.providerUsed, displayedText]);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<TranslationChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
  const [pendingLegacyChat, setPendingLegacyChat] = useState<TranslationChatMessage[] | null>(null);

  useEffect(() => {
    if (rawQueryPrompt) {
      setEditedPromptText(rawQueryPrompt);
    }
  }, [rawQueryPrompt]);

  // Deterministic unique key generator for unsaved translations
  const getTranslationChatKey = (target: string, text: string): string => {
    let hash = 0;
    const str = `${target.trim()}::${text.trim()}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return `unsaved_trans_${Math.abs(hash).toString(36)}`;
  };

  // Reset version index when target changes or saved translations count updates
  useEffect(() => {
    setSelectedVersionIndex(0);
  }, [targetText, savedTranslations.length]);

  // Sync active conversation when version changes, annotations update, or loading status changes.
  // CRITICAL: Translation chats belong to a particular translation!
  // When a new translation is requested (isLoading = true), chat history is cleared.
  // When loaded, only the conversation belonging to this specific translation is restored.
  // [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]: Auto-applies 1:1 legacy chats or triggers picker
  useEffect(() => {
    if (isLoading) {
      setChatMessages([]);
      setChatInput('');
      setPendingLegacyChat(null);
      return;
    }

    const currentAnn = savedTranslations[selectedVersionIndex];
    if (currentAnn) {
      // Check annotation's own conversation first, then fallback to its unique annotation key
      if (currentAnn.conversation && currentAnn.conversation.length > 0) {
        setChatMessages(currentAnn.conversation);
        setIsChatOpen(true);
        const legacy = getLegacyChatForTarget(targetText);
        setPendingLegacyChat(legacy && legacy.length > 0 ? legacy : null);
      } else {
        const cached = getStoredDecipherChat(`ann_${currentAnn.id}`);
        if (cached && cached.length > 0) {
          setChatMessages(cached);
          setIsChatOpen(true);
          const legacy = getLegacyChatForTarget(targetText);
          setPendingLegacyChat(legacy && legacy.length > 0 ? legacy : null);
        } else {
          // [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
          // Check if there is an unmigrated legacy chat for this targetText
          const legacy = getLegacyChatForTarget(targetText);
          if (legacy && legacy.length > 0) {
            if (savedTranslations.length === 1) {
              // Exactly one translation exists! Apply it automatically!
              assignLegacyChatToAnnotation(targetText, currentAnn.id);
              if (onUpdateAnnotationConversation) {
                onUpdateAnnotationConversation(currentAnn.id, legacy);
              }
              setChatMessages(legacy);
              setIsChatOpen(true);
              setPendingLegacyChat(null);
            } else {
              // Multiple translations exist! Offer the user to pick which translation it belongs to
              setChatMessages([]);
              setPendingLegacyChat(legacy);
              setIsChatOpen(true);
            }
          } else {
            setChatMessages([]);
            setPendingLegacyChat(null);
          }
        }
      }
    } else if (displayedText && displayedText.trim()) {
      // Standalone unsaved translation result: isolated strictly to its content hash
      const transKey = getTranslationChatKey(targetText, displayedText);
      const cached = getStoredDecipherChat(transKey);
      if (cached && cached.length > 0) {
        setChatMessages(cached);
        setIsChatOpen(true);
        setPendingLegacyChat(null);
      } else {
        // [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
        const legacy = getLegacyChatForTarget(targetText);
        if (legacy && legacy.length > 0) {
          saveDecipherChat(transKey, legacy);
          dismissLegacyChat(targetText);
          setChatMessages(legacy);
          setIsChatOpen(true);
        } else {
          setChatMessages([]);
        }
        setPendingLegacyChat(null);
      }
    } else {
      setChatMessages([]);
      setPendingLegacyChat(null);
    }
  }, [selectedVersionIndex, savedTranslations, targetText, displayedText, isLoading]);

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

  // Auto-scroll chat
  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatStreaming, isChatOpen]);

  if (!isOpen) return null;

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

  const displayedBlueprintName = currentSavedAnnotation?.blueprintName || blueprintName;

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

  // Post-Translation Chat Execution
  const handleSendChatMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || chatInput).trim();
    if (!textToSend || isChatStreaming) return;

    const userMsg: TranslationChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    const assistantMsgId = `msg-${Date.now() + 1}`;
    const initialAssistantMsg: TranslationChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...chatMessages, userMsg, initialAssistantMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsChatStreaming(true);

    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    // Resolve LLM Config
    const currentBp = applicableBlueprints.find((b) => b.id === activeBlueprintId);
    const { config } = resolveLLMConfigForBlueprint(currentBp?.modelBlueprintId, llmConfig);

    try {
      const res = await executeTranslationChatStream(
        targetText,
        displayedText,
        [...chatMessages, userMsg],
        config,
        (chunk) => {
          setChatMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: chunk } : m))
          );
        },
        controller.signal
      );

      const finalMessages = updatedMessages.map((m) =>
        m.id === assistantMsgId ? { ...m, content: res.text || m.content } : m
      );
      setChatMessages(finalMessages);

      // Save conversation strictly scoped to this particular translation
      if (currentSavedAnnotation) {
        saveDecipherChat(`ann_${currentSavedAnnotation.id}`, finalMessages);
        if (onUpdateAnnotationConversation) {
          onUpdateAnnotationConversation(currentSavedAnnotation.id, finalMessages);
        }
      } else if (displayedText) {
        const transKey = getTranslationChatKey(targetText, displayedText);
        saveDecipherChat(transKey, finalMessages);
      }
    } catch (err: any) {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Error: ${err?.message || 'Chat request failed.'}` }
            : m
        )
      );
    } finally {
      setIsChatStreaming(false);
      chatAbortControllerRef.current = null;
    }
  };

  const handleHaltChatStream = () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
      setIsChatStreaming(false);
    }
  };

  const handleClearChat = () => {
    setChatMessages([]);
    if (currentSavedAnnotation) {
      saveDecipherChat(`ann_${currentSavedAnnotation.id}`, []);
      if (onUpdateAnnotationConversation) {
        onUpdateAnnotationConversation(currentSavedAnnotation.id, []);
      }
    } else if (displayedText) {
      const transKey = getTranslationChatKey(targetText, displayedText);
      saveDecipherChat(transKey, []);
    }
  };

  // [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
  const handleAssignLegacyMigration = (annotationId: string, versionIdx: number) => {
    if (!pendingLegacyChat || pendingLegacyChat.length === 0) return;
    const msgs = pendingLegacyChat;
    assignLegacyChatToAnnotation(targetText, annotationId);
    if (onUpdateAnnotationConversation) {
      onUpdateAnnotationConversation(annotationId, msgs);
    }
    setSelectedVersionIndex(versionIdx);
    setChatMessages(msgs);
    setIsChatOpen(true);
    setPendingLegacyChat(null);
  };

  const handleDismissLegacyMigration = () => {
    dismissLegacyChat(targetText);
    setPendingLegacyChat(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end items-center overflow-hidden">
      {/* Full-screen backdrop overlay */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 cursor-pointer" 
        onClick={(e) => {
          e.stopPropagation();
          if (!isEditingPrompt && !isChatStreaming) {
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
        className="relative z-10 w-full max-w-2xl bg-stone-900 text-stone-100 rounded-t-3xl shadow-2xl border-t border-stone-700/80 max-h-[88vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
        id="decipher-sheet-panel"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div 
          className="w-full flex justify-center py-2 bg-stone-900 cursor-pointer hover:bg-stone-800/60 transition"
          onClick={onClose}
        >
          <div className="w-12 h-1.5 rounded-full bg-stone-700/80" />
        </div>

        {/* Header with Blueprint Switcher */}
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
                  {type === 'word' ? 'Word Decipher' : 'Passage Analysis'}
                </span>

                {/* Blueprint Selector Button */}
                {applicableBlueprints.length > 0 && onSelectBlueprint ? (
                  <div className="relative">
                    <button
                      onClick={() => setShowBlueprintPicker(!showBlueprintPicker)}
                      className="text-xs text-amber-200 hover:text-amber-100 bg-stone-800/80 hover:bg-stone-800 px-2 py-0.5 rounded-lg border border-amber-800/50 flex items-center space-x-1 transition"
                      title="Switch Blueprint"
                      id="btn-switch-blueprint"
                    >
                      <span className="truncate max-w-[130px] font-medium">{displayedBlueprintName}</span>
                      <ChevronDown className="w-3 h-3 text-amber-400 shrink-0" />
                    </button>

                    {/* Blueprint Dropdown */}
                    {showBlueprintPicker && (
                      <div className="absolute left-0 top-full mt-1.5 w-64 bg-stone-950 border border-stone-700 rounded-2xl shadow-2xl p-2 z-50 space-y-1">
                        <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-2 py-1 border-b border-stone-800">
                          Applicable Blueprints
                        </div>
                        <div className="max-h-52 overflow-y-auto space-y-1">
                          {applicableBlueprints.map((bp) => (
                            <button
                              key={bp.id}
                              onClick={() => {
                                setShowBlueprintPicker(false);
                                onSelectBlueprint(bp.id);
                              }}
                              className={`w-full text-left p-2 rounded-xl text-xs flex flex-col space-y-0.5 transition ${
                                bp.name === displayedBlueprintName
                                  ? 'bg-amber-900/80 text-amber-100 border border-amber-700 font-semibold'
                                  : 'hover:bg-stone-800 text-stone-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{bp.name}</span>
                                {bp.language && bp.language !== 'all' && (
                                  <span className="text-[9px] bg-stone-800 text-stone-400 px-1.5 py-0.2 rounded">
                                    {bp.language}
                                  </span>
                                )}
                              </div>
                              {bp.description && (
                                <span className="text-[10px] text-stone-400 italic line-clamp-1">
                                  {bp.description}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-stone-400 truncate max-w-[140px]">
                    {displayedBlueprintName}
                  </span>
                )}
              </div>

              <h3 dir="auto" className="text-base sm:text-lg font-serif font-semibold text-amber-100 truncate mt-0.5" style={{ unicodeBidi: 'plaintext' }}>
                "{targetText}"
              </h3>
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-amber-200 text-xs font-medium flex items-center space-x-1.5 border border-stone-700 transition"
              id="btn-sheet-minimize-read"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Read Text</span>
            </button>

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
                {currentSavedAnnotation?.blueprintName && (
                  <span className="ml-2 text-stone-400 text-[11px]">
                    via <strong className="text-amber-200 font-medium">{currentSavedAnnotation.blueprintName}</strong>
                  </span>
                )}
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
              {/* Primary Mode Switcher: Direct LLM API vs Web UI Assist */}
              <div className="p-1.5 rounded-2xl bg-stone-950 border border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs shadow-inner">
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setIsWebAssistOpen(false)}
                    className={`px-3 py-1.5 rounded-xl font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                      !isWebAssistOpen
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-xs'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
                    }`}
                    id="btn-sheet-mode-api"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Direct LLM Model</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isLoading && onHalt) onHalt();
                      setIsWebAssistOpen(true);
                    }}
                    className={`px-3 py-1.5 rounded-xl font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                      isWebAssistOpen
                        ? 'bg-purple-900/90 text-purple-100 border border-purple-500/60 shadow-md ring-1 ring-purple-400/40'
                        : 'text-purple-300 hover:text-purple-100 hover:bg-purple-950/50'
                    }`}
                    id="btn-sheet-mode-web-assist"
                  >
                    <Globe className="w-3.5 h-3.5 text-purple-400" />
                    <span>Web UI Assist</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-950 text-purple-300 border border-purple-800/60 font-mono hidden xs:inline">
                      Claude / AI Studio / ChatGPT
                    </span>
                  </button>
                </div>

                <div className="text-[11px] text-stone-400 pr-2">
                  {isWebAssistOpen ? (
                    <span className="text-purple-300 flex items-center space-x-1 font-mono">
                      <span>Web subscription bridge</span>
                    </span>
                  ) : (
                    <span className="text-stone-400 font-mono">
                      Direct API query
                    </span>
                  )}
                </div>
              </div>

              {/* Stable Metadata Header: Serving Model, Date, Provider, Blueprint */}
              <div className="p-3 rounded-2xl bg-stone-950 border border-stone-800/90 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/70 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Blueprint Name Badge */}
                    <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-950/70 text-amber-300 border border-amber-800/50 font-medium text-[11px]">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Blueprint: <strong>{displayedBlueprintName}</strong></span>
                    </span>

                    {/* Serving Model Badge or Switcher */}
                    {llmModelBlueprints && llmModelBlueprints.length > 0 && onSelectModelBlueprint ? (
                      <ModelBlueprintSwitcher
                        llmModelBlueprints={llmModelBlueprints}
                        currentConfig={llmConfig || { provider: displayedProvider, modelName: displayedModel }}
                        onSelectModelBlueprint={onSelectModelBlueprint}
                        variant="compact"
                      />
                    ) : (
                      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-stone-900 text-cyan-300 border border-stone-800 font-mono text-[11px]">
                        <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Model: <strong className="text-stone-100 font-normal">{displayedModel}</strong></span>
                      </span>
                    )}

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
                      type="button"
                      onClick={() => setIsWebAssistOpen(!isWebAssistOpen)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center space-x-1 border transition shadow-xs cursor-pointer ${
                        isWebAssistOpen 
                          ? 'bg-purple-900 text-purple-100 border-purple-600 shadow-md ring-1 ring-purple-400/50' 
                          : 'bg-stone-800 hover:bg-stone-700 text-purple-300 border-purple-800/60'
                      }`}
                      id="btn-sheet-toggle-web-assist"
                      title="Open Web UI Assist workflow (Claude Pro, Google AI Studio, ChatGPT)"
                    >
                      <Globe className="w-3 h-3 text-purple-300" />
                      <span>Web UI Assist</span>
                    </button>

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
                        onClick={() => {
                          setChatMessages([]);
                          setIsChatOpen(false);
                          setChatInput('');
                          onForceReTranslate();
                        }}
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

              {/* Web UI Assist Workflow Panel */}
              {isWebAssistOpen && (
                <div className="pt-1">
                  <WebAssistWorkspace
                    prompt={rawQueryPrompt || editedPromptText || ''}
                    targetText={targetText}
                    blueprintName={displayedBlueprintName}
                    initialSiteUrl={activeModel?.webSiteUrl}
                    initialSiteName={activeModel?.webSiteName || activeModel?.name}
                    onApplyResponse={(responseText, siteName, siteUrl) => {
                      if (onApplyWebAssistResult) {
                        onApplyWebAssistResult(responseText, siteName, siteUrl);
                      } else {
                        onSaveAnnotation();
                      }
                      setIsWebAssistOpen(false);
                    }}
                    onCancel={() => setIsWebAssistOpen(false)}
                  />
                </div>
              )}

              {/* Initial Loading Skeleton */}
              {isLoading && !displayedText && !isWebAssistOpen && (
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
                </div>
              )}

              {/* Formatted Markdown Output with KaTeX & Math Support */}
              {displayedText && (
                <div className="text-stone-200 leading-relaxed font-sans text-sm">
                  <MarkdownRenderer content={displayedText} />
                  {isLoading && (
                    <span className="inline-block w-2 h-4 ml-1 bg-amber-400 animate-pulse align-middle" />
                  )}
                </div>
              )}

              {/* ======================================================== */}
              {/* POST-TRANSLATION INTERACTIVE MULTI-TURN LLM CHAT SECTION */}
              {/* ======================================================== */}
              {!isLoading && displayedText && (
                <div className="pt-3 border-t border-stone-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setIsChatOpen(!isChatOpen)}
                      className="flex items-center space-x-2 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition"
                      id="btn-toggle-post-chat"
                    >
                      <MessageSquare className="w-4 h-4 text-cyan-400" />
                      <span>Chat with LLM about this translation</span>
                      {chatMessages.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-950 text-cyan-200 border border-cyan-800">
                          {chatMessages.length} messages
                        </span>
                      )}
                      {isChatOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isChatOpen && chatMessages.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearChat}
                        className="text-[10px] text-stone-400 hover:text-red-300 px-2 py-0.5 rounded-lg border border-stone-800 hover:border-red-900 bg-stone-900 transition cursor-pointer"
                        title="Clear conversation for this translation"
                      >
                        Clear chat
                      </button>
                    )}
                  </div>

                  {isChatOpen && (
                    <div className="rounded-2xl bg-stone-950 border border-cyan-900/60 p-3.5 space-y-3">
                      {/* [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS] Legacy Chat Picker */}
                      {pendingLegacyChat && pendingLegacyChat.length > 0 && hasMultipleSaved && (
                        <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-600/70 space-y-2.5 text-xs shadow-md">
                          <div className="flex items-center justify-between text-amber-200">
                            <div className="flex items-center space-x-2 font-semibold">
                              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                              <span>Migrate Previous Chat ({pendingLegacyChat.length} messages)</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleDismissLegacyMigration}
                              className="text-[10px] text-stone-400 hover:text-stone-200 underline cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </div>
                          <p className="text-[11px] text-stone-300 leading-relaxed">
                            A conversation from an earlier version was found for <strong className="text-amber-200 font-medium">"{targetText}"</strong>. Which translation version does this chat belong to?
                          </p>
                          <div className="space-y-1.5 pt-1">
                            {savedTranslations.map((ann, idx) => (
                              <div
                                key={ann.id}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border transition ${
                                  selectedVersionIndex === idx
                                    ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/40'
                                    : 'bg-stone-900 border-stone-800 hover:border-amber-800/60'
                                }`}
                              >
                                <div className="space-y-0.5 truncate max-w-full sm:max-w-[70%]">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-semibold text-amber-300">Version {idx + 1}</span>
                                    <span className="text-[10px] text-stone-400">
                                      ({ann.blueprintName || 'Translation'} &bull; {formatDate(ann.createdAt)})
                                    </span>
                                    {selectedVersionIndex === idx && (
                                      <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                                        Current
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-stone-300/80 truncate font-mono">
                                    {ann.result.slice(0, 70)}...
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAssignLegacyMigration(ann.id, idx)}
                                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs flex items-center justify-center space-x-1 transition shadow-xs shrink-0 cursor-pointer"
                                >
                                  <span>Assign to Version {idx + 1}</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suggestion Chips */}
                      {chatMessages.length === 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-stone-400">Quick inquiries:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {QUICK_CHAT_SUGGESTIONS.map((s, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSendChatMessage(s)}
                                className="px-2.5 py-1 rounded-xl bg-stone-900 hover:bg-cyan-950 text-stone-300 hover:text-cyan-200 text-[11px] border border-stone-800 hover:border-cyan-800/80 text-left transition"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Chat Messages List */}
                      {chatMessages.length > 0 && (
                        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                          {chatMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex items-start space-x-2 text-xs ${
                                msg.role === 'user' ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              {msg.role === 'assistant' && (
                                <div className="p-1 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400 shrink-0 mt-0.5">
                                  <Bot className="w-3.5 h-3.5" />
                                </div>
                              )}

                              <div
                                className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                                  msg.role === 'user'
                                    ? 'bg-amber-900/80 text-amber-50 rounded-tr-xs border border-amber-700/60'
                                    : 'bg-stone-900 text-stone-200 rounded-tl-xs border border-stone-800'
                                }`}
                              >
                                {msg.role === 'assistant' ? (
                                  <MarkdownRenderer content={msg.content || '...'} />
                                ) : (
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                )}
                              </div>

                              {msg.role === 'user' && (
                                <div className="p-1 rounded-lg bg-amber-950 border border-amber-800 text-amber-400 shrink-0 mt-0.5">
                                  <User className="w-3.5 h-3.5" />
                                </div>
                              )}
                            </div>
                          ))}
                          <div ref={chatEndRef} />
                        </div>
                      )}

                      {/* Chat Input Bar */}
                      <div className="pt-2 border-t border-stone-800/80">
                        <TranslationChatInput
                          id="decipher-chat-input"
                          value={chatInput}
                          onChange={setChatInput}
                          onSend={() => handleSendChatMessage()}
                          isStreaming={isChatStreaming}
                          onHalt={handleHaltChatStream}
                          placeholder="Ask a follow-up question about this translation..."
                          theme="cyan"
                        />
                      </div>
                    </div>
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
                                  setChatMessages([]);
                                  setIsChatOpen(false);
                                  setChatInput('');
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
                                  blueprintName: displayedBlueprintName,
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
                              blueprintName: displayedBlueprintName,
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
