import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Sparkles, 
  UploadCloud, 
  ArrowRightLeft, 
  Edit3, 
  Cpu, 
  Zap, 
  History, 
  Bookmark, 
  CheckCircle2 
} from 'lucide-react';
import { 
  TextItem, 
  LLMConfig, 
  MirrorTranslationData, 
  CalqueHistoryEntry,
  CalquePromptTemplate,
  QueryBlueprint,
  LanguageItem,
  TranslationChatMessage,
  LLMModelBlueprint
} from '../types';
import { ModelBlueprintSwitcher } from './ModelBlueprintSwitcher';
import { CalqueAiGenerationTab } from './mirror/CalqueAiGenerationTab';
import { CalquePromptBuilderTab } from './mirror/CalquePromptBuilderTab';
import { CalqueImportTab } from './mirror/CalqueImportTab';
import { CalqueHistoryTab } from './mirror/CalqueHistoryTab';
import { CalqueAlignmentEditorTab } from './mirror/CalqueAlignmentEditorTab';
import { CalqueCompositesTab } from './mirror/CalqueCompositesTab';
import { CalqueInspectorModal } from './mirror/CalqueInspectorModal';
import { CalquePromptModal } from './mirror/CalquePromptModal';
import { 
  buildTokenOptimizedMirrorPrompt, 
  parseMirrorCalqueText, 
  DEFAULT_SAMPLE_MIRROR_TRANSLATIONS,
  serializeMirrorDataToRawText
} from '../utils/mirrorTranslationUtils';
import { executeLLMQueryStream, executeTranslationChatStream } from '../services/llmService';
import {
  getStoredCalqueHistory,
  saveCalqueHistoryEntry,
  deleteCalqueHistoryEntry,
  clearCalqueHistory,
  getStoredCalquePrompts,
  saveCalquePrompt,
  deleteCalquePrompt,
  DEFAULT_CALQUE_PROMPTS,
  getStoredBlueprints,
  getStoredLanguages,
  resolveLLMConfigForBlueprint,
  saveLanguageWordGloss,
  applyLanguageGlossDictionaryToAllTexts,
  updateCalqueHistoryConversation,
  saveMirrorTranslation,
  getStoredDecipherChat,
  saveDecipherChat
} from '../services/storageService';

interface MirrorTranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  text: TextItem;
  llmConfig: LLMConfig;
  blueprints?: QueryBlueprint[];
  languages?: LanguageItem[];
  currentMirrorData: MirrorTranslationData | null;
  onSaveMirrorData: (data: MirrorTranslationData) => void;
  onDeleteMirrorData?: () => void;
  llmModelBlueprints?: LLMModelBlueprint[];
  onSelectModelBlueprint?: (model: LLMModelBlueprint) => void;
}

export const MirrorTranslationModal: React.FC<MirrorTranslationModalProps> = ({
  isOpen,
  onClose,
  text,
  llmConfig,
  blueprints: propBlueprints,
  languages: propLanguages,
  currentMirrorData,
  onSaveMirrorData,
  onDeleteMirrorData,
  llmModelBlueprints,
  onSelectModelBlueprint,
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'prompt' | 'import' | 'history' | 'editor' | 'composites'>('ai');
  const [isGenerating, setIsGenerating] = useState(false);
  const calqueAbortControllerRef = useRef<AbortController | null>(null);
  const [streamText, setStreamText] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedCalqueId, setCopiedCalqueId] = useState<string | null>(null);
  const [editableMirrorData, setEditableMirrorData] = useState<MirrorTranslationData | null>(currentMirrorData);
  const [editingWordPair, setEditingWordPair] = useState<{ 
    pIdx: number; 
    wIdx: number; 
    trans: string;
    compoundMeaning?: string;
  } | null>(null);

  // Blueprints & Languages
  const allBlueprints = useMemo(() => propBlueprints || getStoredBlueprints(), [propBlueprints]);
  const applicableBlueprints = useMemo(() => {
    const tLang = (text?.language || '').toLowerCase().trim();
    const filtered = allBlueprints.filter(
      (b) => !b.language || b.language === 'all' || b.language.toLowerCase().trim() === tLang
    );
    return filtered.length > 0 ? filtered : allBlueprints;
  }, [allBlueprints, text?.language]);

  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>(
    applicableBlueprints[0]?.id || 'bp-calque-engine'
  );

  // History & Prompt Management State
  const [historySubTab, setHistorySubTab] = useState<'calques' | 'prompts'>('calques');
  const [calqueHistory, setCalqueHistory] = useState<CalqueHistoryEntry[]>([]);
  const [calquePrompts, setCalquePrompts] = useState<CalquePromptTemplate[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('prompt-default-token-optimized');
  const [searchHistoryTerm, setSearchHistoryTerm] = useState('');
  const [expandedPromptHistoryIds, setExpandedPromptHistoryIds] = useState<Record<string, boolean>>({});
  const [inspectingCalque, setInspectingCalque] = useState<CalqueHistoryEntry | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Inspector Post-Translation Chat State
  const [chatInput, setChatInput] = useState('');
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [inspectorConversation, setInspectorConversation] = useState<TranslationChatMessage[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Active Translation Editor Post-Translation LLM Chat State
  const [editorChatInput, setEditorChatInput] = useState('');
  const [isEditorChatStreaming, setIsEditorChatStreaming] = useState(false);
  const [editorChatError, setEditorChatError] = useState<string | null>(null);
  const [editorConversation, setEditorConversation] = useState<TranslationChatMessage[]>([]);
  const editorChatScrollRef = useRef<HTMLDivElement>(null);

  // Raw JSON Request & Max Tokens Limit State
  const [showRawJsonEditor, setShowRawJsonEditor] = useState(false);
  const [calqueMaxTokens, setCalqueMaxTokens] = useState<number | undefined>(() => llmConfig.maxTokens || 4096);
  const [rawJsonCustomPayload, setRawJsonCustomPayload] = useState<string>('');
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);
  const [isRawJsonManuallyEdited, setIsRawJsonManuallyEdited] = useState(false);

  // Sync inspect conversations
  useEffect(() => {
    if (inspectingCalque) {
      setInspectorConversation(inspectingCalque.conversation || []);
      setChatError(null);
    }
  }, [inspectingCalque]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [inspectorConversation, isChatStreaming]);

  // Sync active editor conversations strictly per translation calque entry
  useEffect(() => {
    if (editableMirrorData) {
      if (editableMirrorData.conversation && editableMirrorData.conversation.length > 0) {
        setEditorConversation(editableMirrorData.conversation);
      } else {
        const calqueKey = `calque_${editableMirrorData.historyEntryId || editableMirrorData.id}`;
        const cached = getStoredDecipherChat(calqueKey);
        if (cached && cached.length > 0) {
          setEditorConversation(cached);
        } else {
          setEditorConversation([]);
        }
      }
    } else {
      setEditorConversation([]);
    }
  }, [editableMirrorData?.id, editableMirrorData?.historyEntryId, text.id]);

  useEffect(() => {
    if (editorChatScrollRef.current) {
      editorChatScrollRef.current.scrollTop = editorChatScrollRef.current.scrollHeight;
    }
  }, [editorConversation, isEditorChatStreaming]);

  // Custom Prompt Creation / Editing State
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptFormTitle, setPromptFormTitle] = useState('');
  const [promptFormDesc, setPromptFormDesc] = useState('');
  const [promptFormBody, setPromptFormBody] = useState('');
  const [promptFormSys, setPromptFormSys] = useState('');

  // Snapshot Note State
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);
  const [snapshotTitle, setSnapshotTitle] = useState('');
  const [snapshotNote, setSnapshotNote] = useState('');

  // Load History & Prompts on Open or text change
  const refreshHistoryAndPrompts = () => {
    if (!text?.id) return;
    const history = getStoredCalqueHistory(text.id) || [];
    const prompts = getStoredCalquePrompts() || DEFAULT_CALQUE_PROMPTS;
    setCalquePrompts(prompts);

    // If history is empty for this text but we have an active or default sample calque, seed an initial history entry
    if (history.length === 0 && currentMirrorData && currentMirrorData.rawCalqueText) {
      const pCount = Array.isArray(currentMirrorData.paragraphs) ? currentMirrorData.paragraphs : [];
      const wordCount = pCount.reduce((sum, p) => sum + (p?.words?.length || 0), 0);
      const compositeCount = pCount.flatMap(p => p?.words || []).filter(w => w?.composite?.partIndex === 0).length;

      const initialEntry: CalqueHistoryEntry = {
        id: `calque_hist_init_${Date.now()}`,
        textId: text.id,
        title: currentMirrorData.sourceModel ? `Initial Calque (${currentMirrorData.sourceModel})` : 'Default Sample Calque',
        createdAt: currentMirrorData.updatedAt || new Date().toISOString(),
        source: 'sample-default',
        modelUsed: currentMirrorData.sourceModel || 'default-seed',
        rawCalqueText: currentMirrorData.rawCalqueText,
        promptUsed: buildTokenOptimizedMirrorPrompt(text.content || '', text.language).userInstructionPrompt,
        wordCount,
        compositeCount,
        mirrorData: currentMirrorData,
      };
      saveCalqueHistoryEntry(initialEntry);
      setCalqueHistory([initialEntry]);
    } else {
      setCalqueHistory(history);
    }
  };

  useEffect(() => {
    setEditableMirrorData(currentMirrorData);
    if (currentMirrorData?.rawCalqueText) {
      setPasteText(currentMirrorData.rawCalqueText);
    } else if (text?.id) {
      const defaultSample = DEFAULT_SAMPLE_MIRROR_TRANSLATIONS[text.id];
      setPasteText(defaultSample || '');
    }
    if (isOpen && text?.id) {
      refreshHistoryAndPrompts();
    }
  }, [currentMirrorData, text?.id, isOpen]);

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inspectingCalque) {
          setInspectingCalque(null);
        } else if (editingWordPair) {
          setEditingWordPair(null);
        } else if (!isGenerating) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, inspectingCalque, editingWordPair, isGenerating, onClose]);

  // Flash action notification
  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 2500);
  };

  // Base prompt object
  const textContent = text?.content || '';
  const textLang = text?.language;
  const promptObj = useMemo(() => {
    return buildTokenOptimizedMirrorPrompt(textContent, textLang);
  }, [textContent, textLang]);
  
  // Find active prompt template
  const activePromptTemplate = useMemo(() => {
    if (!Array.isArray(calquePrompts) || calquePrompts.length === 0) {
      return DEFAULT_CALQUE_PROMPTS[0];
    }
    return calquePrompts.find((p) => p.id === selectedPromptId) || calquePrompts[0] || DEFAULT_CALQUE_PROMPTS[0];
  }, [calquePrompts, selectedPromptId]);

  // Assemble user prompt to send to LLM
  const currentPromptPayload = useMemo(() => {
    const template = activePromptTemplate;
    if (!template || template.id === 'prompt-default-token-optimized') {
      return {
        prompt: promptObj.prompt,
        userInstruction: promptObj.userInstructionPrompt,
        systemInstruction: promptObj.systemInstruction,
      };
    }
    const fullUserPrompt = `${template.prompt}\n\nTARGET TEXT:\n"""\n${textContent}\n"""\n\nProvide the word-for-word calque output below:`;
    return {
      prompt: fullUserPrompt,
      userInstruction: fullUserPrompt,
      systemInstruction: template.systemInstruction || promptObj.systemInstruction,
    };
  }, [activePromptTemplate, promptObj, textContent]);

  const approxTokens = Math.round((currentPromptPayload?.userInstruction?.length || 0) / 4);

  // Active LLM Model Config
  const activeResolvedLLMConfig = useMemo(() => {
    return llmConfig;
  }, [llmConfig]);

  const handleHaltGeneration = () => {
    if (calqueAbortControllerRef.current) {
      calqueAbortControllerRef.current.abort();
      calqueAbortControllerRef.current = null;
    }
    setIsGenerating(false);
    showFeedback('Calque generation halted.');
  };

  // Generate default raw JSON payload based on current prompt, model, and token limit
  const generateDefaultRawJson = (tokens?: number) => {
    const eff = activeResolvedLLMConfig;
    const provider = eff?.provider || 'built-in-gemini';
    const model = eff?.modelName || 'gemini-3.7-flash';
    const effectiveTokens = tokens !== undefined ? tokens : calqueMaxTokens;

    if (provider === 'built-in-gemini' || provider === 'custom-gemini') {
      const payload: any = {
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: currentPromptPayload.prompt }],
          },
        ],
        systemInstruction: {
          parts: [{ text: currentPromptPayload.systemInstruction || 'You are an expert philological calque translator.' }],
        },
        generationConfig: {
          temperature: eff?.temperature ?? 0.3,
        },
      };
      if (effectiveTokens) {
        payload.generationConfig.maxOutputTokens = effectiveTokens;
      }
      return JSON.stringify(payload, null, 2);
    } else {
      const payload: any = {
        model,
        messages: [
          {
            role: 'system',
            content: currentPromptPayload.systemInstruction || 'You are an expert philological calque translator.',
          },
          {
            role: 'user',
            content: currentPromptPayload.prompt,
          },
        ],
        stream: true,
        temperature: eff?.temperature ?? 0.3,
      };
      if (effectiveTokens) {
        payload.max_tokens = effectiveTokens;
      }
      return JSON.stringify(payload, null, 2);
    }
  };

  // Sync default raw JSON when prompt or model changes unless manually customized
  useEffect(() => {
    if (!isRawJsonManuallyEdited) {
      setRawJsonCustomPayload(generateDefaultRawJson());
      setRawJsonError(null);
    }
  }, [currentPromptPayload, activeResolvedLLMConfig, isRawJsonManuallyEdited, calqueMaxTokens]);

  const handleSelectTokenPreset = (tokenCount?: number) => {
    setCalqueMaxTokens(tokenCount);
    if (!isRawJsonManuallyEdited) {
      setRawJsonCustomPayload(generateDefaultRawJson(tokenCount));
    } else {
      try {
        const parsed = JSON.parse(rawJsonCustomPayload);
        if (tokenCount !== undefined) {
          if (parsed.max_tokens !== undefined || parsed.messages) {
            parsed.max_tokens = tokenCount;
          }
          if (parsed.generationConfig) {
            parsed.generationConfig.maxOutputTokens = tokenCount;
          } else if (parsed.contents) {
            parsed.maxOutputTokens = tokenCount;
          }
        } else {
          delete parsed.max_tokens;
          delete parsed.maxOutputTokens;
          if (parsed.generationConfig) delete parsed.generationConfig.maxOutputTokens;
        }
        setRawJsonCustomPayload(JSON.stringify(parsed, null, 2));
        setRawJsonError(null);
      } catch {
        // If JSON invalid, keep manual edits
      }
    }
  };

  const handleResetRawJson = () => {
    setIsRawJsonManuallyEdited(false);
    setRawJsonCustomPayload(generateDefaultRawJson());
    setRawJsonError(null);
  };

  const handleBeautifyRawJson = () => {
    try {
      const parsed = JSON.parse(rawJsonCustomPayload);
      setRawJsonCustomPayload(JSON.stringify(parsed, null, 2));
      setRawJsonError(null);
    } catch (err: any) {
      setRawJsonError(err.message);
    }
  };

  // AI Direct Generation
  const handleGenerateAI = async () => {
    if (!text?.id) return;
    setIsGenerating(true);
    setGenerationError(null);
    setStreamText('');

    const controller = new AbortController();
    calqueAbortControllerRef.current = controller;

    try {
      let accumulated = '';
      const promptToRun = currentPromptPayload;

      let effectivePayloadToUse: any = undefined;
      let effectiveTokensToUse = calqueMaxTokens;

      if (showRawJsonEditor && rawJsonCustomPayload.trim()) {
        try {
          const parsed = JSON.parse(rawJsonCustomPayload);
          effectivePayloadToUse = parsed;
          if (parsed.max_tokens) effectiveTokensToUse = Number(parsed.max_tokens);
          if (parsed.maxOutputTokens) effectiveTokensToUse = Number(parsed.maxOutputTokens);
          if (parsed.generationConfig?.maxOutputTokens) effectiveTokensToUse = Number(parsed.generationConfig.maxOutputTokens);
        } catch (err: any) {
          setGenerationError(`Invalid Raw JSON Request: ${err.message}. Please fix JSON syntax or disable Raw JSON Request Editor before generating.`);
          setIsGenerating(false);
          return;
        }
      }

      const effectiveConfig: LLMConfig = {
        ...activeResolvedLLMConfig,
        maxTokens: effectiveTokensToUse,
        customRequestPayload: effectivePayloadToUse,
      };

      const modelIdentifier = `${effectiveConfig?.provider || 'gemini'}:${effectiveConfig?.modelName || 'gemini-3.7-flash'}`;

      const result = await executeLLMQueryStream(
        promptToRun.prompt,
        effectiveConfig,
        (chunk) => {
          accumulated = chunk;
          setStreamText(chunk);
        },
        promptToRun.systemInstruction,
        controller.signal
      );

      if (result.error) {
        setGenerationError(result.error);
      } else {
        const generatedRaw = result.text || accumulated;
        const parsedData = parseMirrorCalqueText(
          textContent,
          generatedRaw,
          text.id,
          modelIdentifier,
          currentMirrorData
        );

        const pCount = Array.isArray(parsedData.paragraphs) ? parsedData.paragraphs : [];
        const compositeCount = pCount.flatMap((p) => p?.words || []).filter((w) => w?.composite?.partIndex === 0).length;
        const wordCount = pCount.reduce((acc, p) => acc + (p?.words?.length || 0), 0);

        // Record in Calque History
        const newHistoryEntry: CalqueHistoryEntry = {
          id: `calque_hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          textId: text.id,
          title: `AI Calque (${effectiveConfig?.modelName || 'LLM'})`,
          createdAt: new Date().toISOString(),
          source: 'ai-generation',
          modelUsed: modelIdentifier,
          rawCalqueText: generatedRaw,
          promptUsed: promptToRun.userInstruction,
          systemInstruction: promptToRun.systemInstruction,
          compositeCount,
          wordCount,
          mirrorData: parsedData,
          conversation: [],
        };

        const updatedHistory = saveCalqueHistoryEntry(newHistoryEntry);
        setCalqueHistory(updatedHistory);

        parsedData.historyEntryId = newHistoryEntry.id;
        setEditableMirrorData(parsedData);
        setEditorConversation([]);
        setEditorChatInput('');
        setEditorChatError(null);
        onSaveMirrorData(parsedData);
        showFeedback(`New calque generated and saved to history!`);
        setActiveTab('editor');
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        showFeedback('Calque generation halted.');
      } else {
        setGenerationError(err.message || 'An unexpected error occurred during generation.');
      }
    } finally {
      setIsGenerating(false);
      calqueAbortControllerRef.current = null;
    }
  };

  // Active Translation Editor Post-Translation LLM Chat
  const handleSendEditorChat = async () => {
    if (!editorChatInput.trim() || !editableMirrorData || isEditorChatStreaming) return;
    const userMsgText = editorChatInput.trim();
    setEditorChatInput('');
    setEditorChatError(null);

    const newUserMsg: TranslationChatMessage = {
      id: `chat-${Date.now()}-user`,
      role: 'user',
      content: userMsgText,
      timestamp: new Date().toISOString(),
    };

    const newAssistantMsgId = `chat-${Date.now()}-assistant`;
    const initialAssistantMsg: TranslationChatMessage = {
      id: newAssistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    const updatedHistory = [...editorConversation, newUserMsg, initialAssistantMsg];
    setEditorConversation(updatedHistory);
    setIsEditorChatStreaming(true);

    try {
      const rawText = editableMirrorData.rawCalqueText || serializeMirrorDataToRawText(editableMirrorData);
      const chatConfig = resolveLLMConfigForBlueprint(editableMirrorData.modelBlueprintId, llmConfig);
      let accumulated = '';
      const result = await executeTranslationChatStream(
        rawText,
        userMsgText,
        chatConfig,
        editorConversation,
        (chunk) => {
          accumulated = chunk;
          setEditorConversation((prev) =>
            prev.map((msg) => (msg.id === newAssistantMsgId ? { ...msg, content: chunk } : msg))
          );
        },
        promptObj.systemInstruction
      );

      if (result.error) {
        setEditorChatError(result.error);
      }

      const finalMessages = updatedHistory.map((m) =>
        m.id === newAssistantMsgId ? { ...m, content: result.text || accumulated } : m
      );
      setEditorConversation(finalMessages);

      // Save conversation into MirrorTranslationData
      const updatedMirror: MirrorTranslationData = {
        ...editableMirrorData,
        conversation: finalMessages,
        updatedAt: new Date().toISOString(),
      };
      setEditableMirrorData(updatedMirror);
      onSaveMirrorData(updatedMirror);
      saveMirrorTranslation(updatedMirror);
      const calqueKey = `calque_${editableMirrorData.historyEntryId || editableMirrorData.id}`;
      saveDecipherChat(calqueKey, finalMessages);

      // Also persist to history entry if linked
      if (editableMirrorData.historyEntryId) {
        const allHist = updateCalqueHistoryConversation(editableMirrorData.historyEntryId, finalMessages);
        setCalqueHistory(allHist.filter((item) => item.textId === text.id));
      }
    } catch (err: any) {
      setEditorChatError(err.message || 'Chat query failed');
    } finally {
      setIsEditorChatStreaming(false);
    }
  };

  const handleClearEditorChat = () => {
    setEditorConversation([]);
    if (editableMirrorData) {
      const updatedMirror: MirrorTranslationData = {
        ...editableMirrorData,
        conversation: [],
        updatedAt: new Date().toISOString(),
      };
      setEditableMirrorData(updatedMirror);
      onSaveMirrorData(updatedMirror);
      saveMirrorTranslation(updatedMirror);
      const calqueKey = `calque_${editableMirrorData.historyEntryId || editableMirrorData.id}`;
      saveDecipherChat(calqueKey, []);
      if (editableMirrorData.historyEntryId) {
        const allHist = updateCalqueHistoryConversation(editableMirrorData.historyEntryId, []);
        setCalqueHistory(allHist.filter((item) => item.textId === text.id));
      }
    }
  };

  // Post-Translation Interactive LLM Chat
  const handleSendCalqueChat = async () => {
    if (!chatInput.trim() || !inspectingCalque || isChatStreaming) return;
    const userMessageText = chatInput.trim();
    setChatInput('');
    setChatError(null);

    const newUserMsg: TranslationChatMessage = {
      id: `chat-${Date.now()}-user`,
      role: 'user',
      content: userMessageText,
      timestamp: new Date().toISOString(),
    };

    const newAssistantMsgId = `chat-${Date.now()}-assistant`;
    const initialAssistantMsg: TranslationChatMessage = {
      id: newAssistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    const updatedHistory = [...inspectorConversation, newUserMsg, initialAssistantMsg];
    setInspectorConversation(updatedHistory);
    setIsChatStreaming(true);

    try {
      const chatConfig = resolveLLMConfigForBlueprint(inspectingCalque.modelBlueprintId, llmConfig);
      let accumulated = '';
      const result = await executeTranslationChatStream(
        inspectingCalque.rawCalqueText,
        userMessageText,
        chatConfig,
        inspectorConversation,
        (chunk) => {
          accumulated = chunk;
          setInspectorConversation((prev) =>
            prev.map((msg) => (msg.id === newAssistantMsgId ? { ...msg, content: chunk } : msg))
          );
        },
        inspectingCalque.systemInstruction || promptObj.systemInstruction
      );

      if (result.error) {
        setChatError(result.error);
      }

      const finalMessages = updatedHistory.map((m) =>
        m.id === newAssistantMsgId ? { ...m, content: result.text || accumulated } : m
      );
      setInspectorConversation(finalMessages);
      const updatedAllHist = updateCalqueHistoryConversation(inspectingCalque.id, finalMessages);
      setCalqueHistory(updatedAllHist.filter((item) => item.textId === text.id));

      // Update in-memory state
      setInspectingCalque({
        ...inspectingCalque,
        conversation: finalMessages,
      });
    } catch (err: any) {
      setChatError(err.message || 'Chat query failed');
    } finally {
      setIsChatStreaming(false);
    }
  };

  // Sync glosses to all texts of same language
  const handleSyncGlossesToLanguage = () => {
    if (!text.language) return;
    const count = applyLanguageGlossDictionaryToAllTexts(text.language);
    showFeedback(`Synced gloss dictionary across ${count} ${text.language} texts!`);
  };

  // Copy Prompt for External LLMs
  const handleCopyPrompt = (promptText?: string) => {
    const textToCopy = promptText || currentPromptPayload.userInstruction;
    navigator.clipboard.writeText(textToCopy);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2200);
    showFeedback('Prompt copied to clipboard');
  };

  // Copy Calque text
  const handleCopyCalqueText = (id: string, textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedCalqueId(id);
    setTimeout(() => setCopiedCalqueId(null), 2200);
    showFeedback('Calque text copied');
  };

  // Import / Apply Pasted Mirror Text
  const handleApplyPastedText = () => {
    if (!pasteText.trim() || !text?.id) return;
    const parsedData = parseMirrorCalqueText(
      textContent,
      pasteText.trim(),
      text.id,
      'manual-import',
      editableMirrorData
    );

    const pCount = Array.isArray(parsedData.paragraphs) ? parsedData.paragraphs : [];
    const compositeCount = pCount.flatMap((p) => p?.words || []).filter((w) => w?.composite?.partIndex === 0).length;
    const wordCount = pCount.reduce((acc, p) => acc + (p?.words?.length || 0), 0);

    const newHistoryEntry: CalqueHistoryEntry = {
      id: `calque_hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      textId: text.id,
      title: 'Imported / Pasted Calque',
      createdAt: new Date().toISOString(),
      source: 'manual-import',
      modelUsed: 'manual-import',
      rawCalqueText: pasteText.trim(),
      compositeCount,
      wordCount,
      mirrorData: parsedData,
      conversation: [],
    };

    const updatedHistory = saveCalqueHistoryEntry(newHistoryEntry);
    setCalqueHistory(updatedHistory);

    parsedData.historyEntryId = newHistoryEntry.id;
    setEditableMirrorData(parsedData);
    onSaveMirrorData(parsedData);
    showFeedback('Calque imported and activated');
    setActiveTab('editor');
  };

  // Apply Calque from Web UI Assist (Claude Pro, Google AI Studio, ChatGPT)
  const handleApplyWebAssistCalque = (responseText: string, siteName: string, _siteUrl?: string) => {
    if (!responseText.trim() || !text?.id) return;
    const modelIdentifier = `${siteName} (Web)`;
    const parsedData = parseMirrorCalqueText(
      textContent,
      responseText.trim(),
      text.id,
      modelIdentifier,
      editableMirrorData
    );

    const pCount = Array.isArray(parsedData.paragraphs) ? parsedData.paragraphs : [];
    const compositeCount = pCount.flatMap((p) => p?.words || []).filter((w) => w?.composite?.partIndex === 0).length;
    const wordCount = pCount.reduce((acc, p) => acc + (p?.words?.length || 0), 0);

    const newHistoryEntry: CalqueHistoryEntry = {
      id: `calque_hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      textId: text.id,
      title: `Web Assist Calque (${siteName})`,
      createdAt: new Date().toISOString(),
      source: 'web-assist',
      modelUsed: modelIdentifier,
      rawCalqueText: responseText.trim(),
      promptUsed: currentPromptPayload.userInstruction,
      systemInstruction: currentPromptPayload.systemInstruction,
      compositeCount,
      wordCount,
      mirrorData: parsedData,
      conversation: [],
    };

    const updatedHistory = saveCalqueHistoryEntry(newHistoryEntry);
    setCalqueHistory(updatedHistory);

    parsedData.historyEntryId = newHistoryEntry.id;
    setEditableMirrorData(parsedData);
    setEditorConversation([]);
    setEditorChatInput('');
    setEditorChatError(null);
    onSaveMirrorData(parsedData);
    saveMirrorTranslation(parsedData);
    showFeedback(`Calque imported from ${siteName} and activated!`);
    setActiveTab('editor');
  };

  // Save current editable alignment as named snapshot
  const handleSaveCurrentSnapshot = () => {
    if (!editableMirrorData || !text?.id) return;
    const rawText = editableMirrorData.rawCalqueText || serializeMirrorDataToRawText(editableMirrorData);
    const pCount = Array.isArray(editableMirrorData.paragraphs) ? editableMirrorData.paragraphs : [];
    const compositeCount = pCount.flatMap((p) => p?.words || []).filter((w) => w?.composite?.partIndex === 0).length;
    const wordCount = pCount.reduce((acc, p) => acc + (p?.words?.length || 0), 0);

    const newEntry: CalqueHistoryEntry = {
      id: `calque_hist_snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      textId: text.id,
      title: snapshotTitle.trim() || `Manual Snapshot (${new Date().toLocaleTimeString()})`,
      createdAt: new Date().toISOString(),
      source: 'manual-snapshot',
      modelUsed: editableMirrorData.sourceModel || 'manual-editor',
      rawCalqueText: rawText,
      notes: snapshotNote.trim() || undefined,
      compositeCount,
      wordCount,
      mirrorData: editableMirrorData,
      conversation: editorConversation || [],
    };

    const updatedHistory = saveCalqueHistoryEntry(newEntry);
    setCalqueHistory(updatedHistory);
    setIsTakingSnapshot(false);
    setSnapshotTitle('');
    setSnapshotNote('');
    showFeedback('Snapshot saved to history');
  };

  // Activate past calque from history
  const handleActivateHistoryCalque = (entry: CalqueHistoryEntry) => {
    if (!text?.id || !entry) return;
    let targetMirrorData = entry.mirrorData;
    if (!targetMirrorData && entry.rawCalqueText) {
      targetMirrorData = parseMirrorCalqueText(
        textContent,
        entry.rawCalqueText,
        text.id,
        entry.modelUsed || 'history-restored'
      );
    }
    if (targetMirrorData) {
      targetMirrorData.historyEntryId = entry.id;
      if (entry.conversation && entry.conversation.length > 0) {
        targetMirrorData.conversation = entry.conversation;
        setEditorConversation(entry.conversation);
      } else {
        targetMirrorData.conversation = [];
        setEditorConversation([]);
      }
      setEditableMirrorData(targetMirrorData);
      onSaveMirrorData(targetMirrorData);
      saveMirrorTranslation(targetMirrorData);
      showFeedback(`Activated calque "${entry.title || 'Snapshot'}"`);
    }
  };

  // Delete history entry
  const handleDeleteHistoryEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteCalqueHistoryEntry(id);
    setCalqueHistory(updated);
    showFeedback('Calque entry deleted');
  };

  // Clear all calque history
  const handleClearAllCalqueHistory = () => {
    if (window.confirm('Clear all received calque history for this text?')) {
      clearCalqueHistory(text.id);
      setCalqueHistory([]);
      showFeedback('Calque history cleared');
    }
  };

  // Open Create Prompt Modal
  const handleOpenCreatePrompt = () => {
    setIsCreatingPrompt(true);
    setEditingPromptId(null);
    setPromptFormTitle('');
    setPromptFormDesc('');
    setPromptFormBody(promptObj.userInstructionPrompt);
    setPromptFormSys(promptObj.systemInstruction);
  };

  // Open Edit Prompt Modal
  const handleOpenEditPrompt = (prompt: CalquePromptTemplate) => {
    setIsCreatingPrompt(true);
    setEditingPromptId(prompt.id);
    setPromptFormTitle(prompt.title);
    setPromptFormDesc(prompt.description || '');
    setPromptFormBody(prompt.prompt);
    setPromptFormSys(prompt.systemInstruction || '');
  };

  // Save Prompt Template
  const handleSavePromptTemplate = () => {
    if (!promptFormTitle.trim() || !promptFormBody.trim()) return;
    const newPrompt: CalquePromptTemplate = {
      id: editingPromptId || `prompt-custom-${Date.now()}`,
      title: promptFormTitle.trim(),
      description: promptFormDesc.trim() || undefined,
      prompt: promptFormBody.trim(),
      systemInstruction: promptFormSys.trim() || undefined,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    const updated = saveCalquePrompt(newPrompt);
    setCalquePrompts(updated);
    setSelectedPromptId(newPrompt.id);
    setIsCreatingPrompt(false);
    showFeedback(`Saved prompt template "${newPrompt.title}"`);
  };

  // Delete custom prompt template
  const handleDeletePromptTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteCalquePrompt(id);
    setCalquePrompts(updated);
    if (selectedPromptId === id) {
      setSelectedPromptId(DEFAULT_CALQUE_PROMPTS[0].id);
    }
    showFeedback('Prompt template deleted');
  };

  // Save individual word translation in alignment editor
  const handleSaveWordEdit = () => {
    if (!editingWordPair || !editableMirrorData || !Array.isArray(editableMirrorData.paragraphs)) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[editingWordPair.pIdx];
    if (targetPara && Array.isArray(targetPara.words) && targetPara.words[editingWordPair.wIdx]) {
      const updatedWords = [...targetPara.words];
      const currentW = updatedWords[editingWordPair.wIdx];
      
      let updatedComposite = currentW.composite;
      if (editingWordPair.compoundMeaning && updatedComposite) {
        updatedComposite = {
          ...updatedComposite,
          compoundMeaning: editingWordPair.compoundMeaning.trim(),
        };
      }

      updatedWords[editingWordPair.wIdx] = {
        ...currentW,
        trans: editingWordPair.trans,
        composite: updatedComposite,
      };

      if (updatedComposite && editingWordPair.compoundMeaning) {
        const groupId = updatedComposite.id;
        for (let i = 0; i < updatedWords.length; i++) {
          if (updatedWords[i].composite?.id === groupId) {
            updatedWords[i] = {
              ...updatedWords[i],
              composite: {
                ...updatedWords[i].composite!,
                compoundMeaning: editingWordPair.compoundMeaning.trim(),
              },
            };
          }
        }
      }

      targetPara.words = updatedWords;
      const updatedData: MirrorTranslationData = {
        ...editableMirrorData,
        paragraphs: updatedParas,
        updatedAt: new Date().toISOString(),
      };
      setEditableMirrorData(updatedData);
      onSaveMirrorData(updatedData);

      // Persist to language-wide gloss dictionary
      if (text.language && currentW?.orig) {
        saveLanguageWordGloss({
          orig: currentW.orig,
          cleanOrig: currentW.cleanOrig || currentW.orig.toLowerCase().trim(),
          trans: editingWordPair.trans.trim(),
          language: text.language,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    setEditingWordPair(null);
  };

  // Insert gap
  const handleInsertGap = (pIdx: number, wIdx: number) => {
    if (!editableMirrorData || !Array.isArray(editableMirrorData.paragraphs)) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (!targetPara || !Array.isArray(targetPara.words)) return;

    const words = [...targetPara.words];
    for (let i = words.length - 1; i > wIdx; i--) {
      words[i] = {
        ...words[i],
        trans: words[i - 1]?.trans || '',
      };
    }
    if (words[wIdx]) {
      words[wIdx] = {
        ...words[wIdx],
        trans: '-',
      };
    }
    targetPara.words = words;

    const updatedData: MirrorTranslationData = {
      ...editableMirrorData,
      paragraphs: updatedParas,
      updatedAt: new Date().toISOString(),
    };
    setEditableMirrorData(updatedData);
    onSaveMirrorData(updatedData);
  };

  // Shift left
  const handleShiftLeft = (pIdx: number, wIdx: number) => {
    if (!editableMirrorData || !Array.isArray(editableMirrorData.paragraphs)) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (!targetPara || !Array.isArray(targetPara.words)) return;

    const words = [...targetPara.words];
    for (let i = wIdx; i < words.length - 1; i++) {
      words[i] = {
        ...words[i],
        trans: words[i + 1]?.trans || '',
      };
    }
    if (words.length > 0) {
      words[words.length - 1] = {
        ...words[words.length - 1],
        trans: '',
      };
    }
    targetPara.words = words;

    const updatedData: MirrorTranslationData = {
      ...editableMirrorData,
      paragraphs: updatedParas,
      updatedAt: new Date().toISOString(),
    };
    setEditableMirrorData(updatedData);
    onSaveMirrorData(updatedData);
  };

  // Unlink composite group
  const handleUnlinkGroup = (pIdx: number, groupId: string) => {
    if (!editableMirrorData || !Array.isArray(editableMirrorData.paragraphs)) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (!targetPara || !Array.isArray(targetPara.words)) return;

    targetPara.words = targetPara.words.map((w) => {
      if (w.composite && w.composite.id === groupId) {
        const { composite, preferCompoundInMirror, ...rest } = w;
        return rest;
      }
      return w;
    });

    const updatedData: MirrorTranslationData = {
      ...editableMirrorData,
      paragraphs: updatedParas,
      updatedAt: new Date().toISOString(),
    };
    setEditableMirrorData(updatedData);
    onSaveMirrorData(updatedData);
  };

  // Toggle Global Composite Display Mode
  const handleToggleGlobalCompositeMode = () => {
    if (!editableMirrorData) return;
    const nextMode = editableMirrorData.compositeDisplayMode === 'compound' ? 'separated' : 'compound';
    const updatedData: MirrorTranslationData = {
      ...editableMirrorData,
      compositeDisplayMode: nextMode,
      updatedAt: new Date().toISOString(),
    };
    setEditableMirrorData(updatedData);
    onSaveMirrorData(updatedData);
  };

  // Filtered History
  const filteredCalqueHistory = useMemo(() => {
    if (!Array.isArray(calqueHistory)) return [];
    if (!searchHistoryTerm.trim()) return calqueHistory;
    const term = searchHistoryTerm.toLowerCase();
    return calqueHistory.filter((item) => 
      (item?.title && item.title.toLowerCase().includes(term)) ||
      (item?.blueprintName && item.blueprintName.toLowerCase().includes(term)) ||
      (item?.modelUsed && item.modelUsed.toLowerCase().includes(term)) ||
      (item?.rawCalqueText && item.rawCalqueText.toLowerCase().includes(term)) ||
      (item?.notes && item.notes.toLowerCase().includes(term)) ||
      (item?.promptUsed && item.promptUsed.toLowerCase().includes(term))
    );
  }, [calqueHistory, searchHistoryTerm]);

  // Quick stats
  const totalOriginalWords = useMemo(() => {
    if (!editableMirrorData || !Array.isArray(editableMirrorData.paragraphs)) return 0;
    return editableMirrorData.paragraphs.reduce((acc, p) => acc + (p?.words?.length || 0), 0);
  }, [editableMirrorData]);
  
  // Collect all unique composite groups across paragraphs
  const compositeGroups = useMemo(() => {
    const groups: {
      pIdx: number;
      groupId: string;
      groupIndex: number;
      sentenceIndex?: number;
      rawTagId?: string;
      parts: { wIdx: number; orig: string; trans: string }[];
      compoundMeaning: string;
      preferCompound?: boolean;
    }[] = [];

    if (editableMirrorData && Array.isArray(editableMirrorData.paragraphs)) {
      editableMirrorData.paragraphs.forEach((para, pIdx) => {
        if (!para || !Array.isArray(para.words)) return;
        const groupMap = new Map<string, {
          groupId: string;
          groupIndex: number;
          sentenceIndex?: number;
          rawTagId?: string;
          parts: { wIdx: number; orig: string; trans: string }[];
          compoundMeaning: string;
          preferCompound?: boolean;
        }>();

        para.words.forEach((w, wIdx) => {
          if (w && w.composite && w.composite.id) {
            const gId = w.composite.id;
            if (!groupMap.has(gId)) {
              groupMap.set(gId, {
                groupId: gId,
                groupIndex: w.composite.groupIndex || 1,
                sentenceIndex: w.composite.sentenceIndex,
                rawTagId: w.composite.rawTagId,
                parts: [],
                compoundMeaning: w.composite.compoundMeaning || '',
                preferCompound: w.preferCompoundInMirror,
              });
            }
            groupMap.get(gId)!.parts.push({
              wIdx,
              orig: w.orig || '',
              trans: w.trans || '',
            });
          }
        });

        groupMap.forEach((val) => {
          groups.push({
            pIdx,
            ...val,
          });
        });
      });
    }

    return groups;
  }, [editableMirrorData]);

  if (!isOpen || !text) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-stone-900 border border-stone-800 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh] animate-fade-in relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Action Feedback */}
        {actionFeedback && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-emerald-900 text-emerald-100 px-4 py-1.5 rounded-full text-xs font-semibold shadow-2xl border border-emerald-500/60 flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/70">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-serif text-lg font-bold text-stone-100">Mirror Translation & Calque Engine</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
                  {text.language}
                </span>
                {compositeGroups.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 text-[10px] font-mono border border-cyan-700/60 flex items-center space-x-1">
                    <Zap className="w-2.5 h-2.5 text-cyan-400" />
                    <span>{compositeGroups.length} composite groups</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-400">
                1:1 morphological calque, separable verb notation, prompt blueprints, and received calque history.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 p-1.5 rounded-xl hover:bg-stone-800 transition cursor-pointer"
            id="btn-close-mirror-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-stone-800 px-5 pt-3 bg-stone-900/90 gap-1.5 overflow-x-auto select-none">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center space-x-2 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              activeTab === 'ai'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
            id="tab-btn-mirror-ai"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate with AI</span>
          </button>

          <button
            onClick={() => setActiveTab('prompt')}
            className={`flex items-center space-x-2 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              activeTab === 'prompt'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
            id="tab-btn-mirror-prompt"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Token Prompt Builder</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center space-x-2 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              activeTab === 'import'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
            id="tab-btn-mirror-import"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Import Calque</span>
          </button>

          {/* CALQUE & PROMPT HISTORY TAB */}
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center space-x-1.5 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
            id="tab-btn-mirror-history"
          >
            <History className="w-3.5 h-3.5" />
            <span>Calques & Prompts History</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-stone-800 text-amber-300 text-[10px] font-mono border border-stone-700">
              {calqueHistory.length}
            </span>
          </button>

          {editableMirrorData && (
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center space-x-2 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'editor'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
              id="tab-btn-mirror-editor"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Alignment Grid ({totalOriginalWords})</span>
            </button>
          )}

          {editableMirrorData && compositeGroups.length > 0 && (
            <button
              onClick={() => setActiveTab('composites')}
              className={`flex items-center space-x-2 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'composites'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
              id="tab-btn-mirror-composites"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Separable Verbs ({compositeGroups.length})</span>
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-sm text-stone-300">
          
          {/* TAB 1: AI Direct Generation */}
          {activeTab === 'ai' && (
            <CalqueAiGenerationTab
              llmConfig={llmConfig}
              llmModelBlueprints={llmModelBlueprints}
              onSelectModelBlueprint={onSelectModelBlueprint}
              approxTokens={approxTokens}
              calquePrompts={calquePrompts}
              selectedPromptId={selectedPromptId}
              setSelectedPromptId={setSelectedPromptId}
              onManageTemplates={() => {
                setHistorySubTab('prompts');
                setActiveTab('history');
              }}
              showRawJsonEditor={showRawJsonEditor}
              setShowRawJsonEditor={setShowRawJsonEditor}
              rawJsonCustomPayload={rawJsonCustomPayload}
              setRawJsonCustomPayload={setRawJsonCustomPayload}
              isRawJsonManuallyEdited={isRawJsonManuallyEdited}
              setIsRawJsonManuallyEdited={setIsRawJsonManuallyEdited}
              generateDefaultRawJson={generateDefaultRawJson}
              rawJsonError={rawJsonError}
              setRawJsonError={setRawJsonError}
              onBeautifyRawJson={handleBeautifyRawJson}
              onResetRawJson={handleResetRawJson}
              calqueMaxTokens={calqueMaxTokens}
              onSelectTokenPreset={handleSelectTokenPreset}
              isGenerating={isGenerating}
              onHaltGeneration={handleHaltGeneration}
              onGenerateAI={handleGenerateAI}
              editableMirrorData={editableMirrorData}
              calqueHistoryCount={calqueHistory.length}
              onViewPastCalques={() => {
                setHistorySubTab('calques');
                setActiveTab('history');
              }}
              streamText={streamText}
              generationError={generationError}
            />
          )}

          {/* TAB 2: Token Prompt Builder / External LLM */}
          {activeTab === 'prompt' && (
            <CalquePromptBuilderTab
              calquePrompts={calquePrompts}
              selectedPromptId={selectedPromptId}
              setSelectedPromptId={setSelectedPromptId}
              onOpenCreatePrompt={handleOpenCreatePrompt}
              onCopyPrompt={handleCopyPrompt}
              copiedPrompt={copiedPrompt}
              currentPromptPayload={currentPromptPayload}
              textTitle={text?.title}
              onApplyWebAssistCalque={handleApplyWebAssistCalque}
            />
          )}

          {/* TAB 3: Import / Paste Calque */}
          {activeTab === 'import' && (
            <CalqueImportTab
              pasteText={pasteText}
              setPasteText={setPasteText}
              textId={text?.id}
              defaultSampleTranslations={DEFAULT_SAMPLE_MIRROR_TRANSLATIONS}
              onApplyPastedText={handleApplyPastedText}
            />
          )}

          {/* TAB 4: CALQUES & PROMPTS HISTORY */}
          {activeTab === 'history' && (
            <CalqueHistoryTab
              historySubTab={historySubTab}
              setHistorySubTab={setHistorySubTab}
              editableMirrorData={editableMirrorData}
              isTakingSnapshot={isTakingSnapshot}
              setIsTakingSnapshot={setIsTakingSnapshot}
              snapshotTitle={snapshotTitle}
              setSnapshotTitle={setSnapshotTitle}
              snapshotNote={snapshotNote}
              setSnapshotNote={setSnapshotNote}
              onSaveCurrentSnapshot={handleSaveCurrentSnapshot}
              calqueHistory={calqueHistory}
              filteredCalqueHistory={filteredCalqueHistory}
              onClearAllCalqueHistory={handleClearAllCalqueHistory}
              onOpenCreatePrompt={handleOpenCreatePrompt}
              searchHistoryTerm={searchHistoryTerm}
              setSearchHistoryTerm={setSearchHistoryTerm}
              expandedPromptHistoryIds={expandedPromptHistoryIds}
              setExpandedPromptHistoryIds={setExpandedPromptHistoryIds}
              onActivateHistoryCalque={handleActivateHistoryCalque}
              onInspectCalque={(item) => {
                setInspectingCalque(item);
                setInspectorConversation(item.conversation || []);
              }}
              onCopyCalqueText={handleCopyCalqueText}
              copiedCalqueId={copiedCalqueId}
              onDeleteHistoryEntry={handleDeleteHistoryEntry}
              onCopyPrompt={handleCopyPrompt}
              calquePrompts={calquePrompts}
              onOpenEditPrompt={handleOpenEditPrompt}
              onDeletePromptTemplate={handleDeletePromptTemplate}
              onSelectPromptForAI={(p) => {
                setSelectedPromptId(p.id);
                setActiveTab('ai');
                showFeedback(`Selected template "${p.title}"`);
              }}
            />
          )}

          {/* TAB 5: Alignment Grid Editor */}
          {activeTab === 'editor' && editableMirrorData && (
            <CalqueAlignmentEditorTab
              editableMirrorData={editableMirrorData}
              onSyncGlossesToLanguage={handleSyncGlossesToLanguage}
              targetLanguage={text.language}
              onToggleSnapshot={() => setIsTakingSnapshot(!isTakingSnapshot)}
              editingWordPair={editingWordPair}
              setEditingWordPair={setEditingWordPair}
              onToggleKeepOriginal={(pIdx, wIdx) => {
                const w = editableMirrorData.paragraphs[pIdx]?.words[wIdx];
                if (w?.cleanOrig) {
                  const clean = w.cleanOrig.toLowerCase();
                  const currentList = editableMirrorData.untranslatedWords || [];
                  const updatedList = currentList.includes(clean)
                    ? currentList.filter((x) => x !== clean)
                    : [...currentList, clean];
                  const updatedData: MirrorTranslationData = {
                    ...editableMirrorData,
                    untranslatedWords: updatedList,
                    updatedAt: new Date().toISOString(),
                  };
                  setEditableMirrorData(updatedData);
                  onSaveMirrorData(updatedData);
                  showFeedback(`Toggled untranslated original for "${w.orig}"`);
                }
              }}
              onInsertGap={handleInsertGap}
              onShiftLeft={handleShiftLeft}
              onSaveWordEdit={handleSaveWordEdit}
              editorConversation={editorConversation}
              onClearEditorChat={handleClearEditorChat}
              editorChatScrollRef={editorChatScrollRef}
              isEditorChatStreaming={isEditorChatStreaming}
              editorChatError={editorChatError}
              editorChatInput={editorChatInput}
              setEditorChatInput={setEditorChatInput}
              onSendEditorChat={handleSendEditorChat}
            />
          )}

          {/* TAB 6: Separable Verbs & Composite Groups */}
          {activeTab === 'composites' && editableMirrorData && (
            <CalqueCompositesTab
              editableMirrorData={editableMirrorData}
              compositeGroups={compositeGroups}
              onToggleGlobalCompositeMode={handleToggleGlobalCompositeMode}
              onUnlinkGroup={handleUnlinkGroup}
            />
          )}
        </div>

        {/* Full Inspector Modal for Detailed History Calque View + Interactive Chat */}
        {inspectingCalque && (
          <CalqueInspectorModal
            inspectingCalque={inspectingCalque}
            onClose={() => setInspectingCalque(null)}
            targetLanguage={text.language}
            textContent={textContent}
            inspectorConversation={inspectorConversation}
            chatScrollRef={chatScrollRef}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendCalqueChat={handleSendCalqueChat}
            isChatStreaming={isChatStreaming}
            chatError={chatError}
            onClearConversation={() => {
              setInspectorConversation([]);
              if (inspectingCalque) {
                updateCalqueHistoryConversation(inspectingCalque.id, []);
                setInspectingCalque({ ...inspectingCalque, conversation: [] });
              }
            }}
            onActivateCalque={(item) => {
              handleActivateHistoryCalque(item);
              setInspectingCalque(null);
            }}
          />
        )}

        {/* Custom Prompt Creation / Edit Modal */}
        {isCreatingPrompt && (
          <CalquePromptModal
            isOpen={isCreatingPrompt}
            onClose={() => setIsCreatingPrompt(false)}
            editingPromptId={editingPromptId}
            promptFormTitle={promptFormTitle}
            setPromptFormTitle={setPromptFormTitle}
            promptFormDesc={promptFormDesc}
            setPromptFormDesc={setPromptFormDesc}
            promptFormSys={promptFormSys}
            setPromptFormSys={setPromptFormSys}
            promptFormBody={promptFormBody}
            setPromptFormBody={setPromptFormBody}
            onSavePromptTemplate={handleSavePromptTemplate}
          />
        )}

        {/* Save Snapshot Modal */}
        {isTakingSnapshot && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bookmark className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-stone-100 text-sm">Save Calque Snapshot</span>
                </div>
                <button onClick={() => setIsTakingSnapshot(false)} className="text-stone-400 hover:text-stone-200 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-stone-300">Snapshot Title:</label>
                  <input
                    type="text"
                    value={snapshotTitle}
                    onChange={(e) => setSnapshotTitle(e.target.value)}
                    placeholder={`e.g. Iteration ${calqueHistory.length + 1} with custom glosses`}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-200 focus:outline-hidden focus:border-amber-500"
                    autoFocus
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-stone-300">Notes (Optional):</label>
                  <textarea
                    value={snapshotNote}
                    onChange={(e) => setSnapshotNote(e.target.value)}
                    placeholder="Notes on nuances, case choices, or reasoning for this snapshot..."
                    rows={3}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl p-3 text-xs text-stone-200 focus:outline-hidden focus:border-amber-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-800">
                <button
                  onClick={() => setIsTakingSnapshot(false)}
                  className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCurrentSnapshot}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs cursor-pointer shadow-xs"
                >
                  Save to History
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/60 flex items-center justify-between">
          <div className="text-xs text-stone-500 flex items-center space-x-2">
            <span>Tip: Press </span>
            <kbd className="px-1.5 py-0.5 rounded bg-stone-800 text-amber-300 font-mono text-[10px] border border-stone-700">M</kbd>
            <span> in the reader to switch between Original and Mirror instantly.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition cursor-pointer"
            id="btn-done-mirror-modal"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
