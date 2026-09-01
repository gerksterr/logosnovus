import React, { useState, useEffect, useRef } from 'react';
import { 
  TextItem, 
  QueryBlueprint, 
  Annotation, 
  LLMConfig, 
  ReaderSettings, 
  QueryResult, 
  BlueprintType,
  ActiveDecipherQuery
} from './types';
import { 
  initStorage, 
  saveTextItem, 
  deleteTextItem, 
  saveBlueprintItem, 
  deleteBlueprintItem, 
  getStoredAnnotations, 
  saveAnnotation, 
  deleteAnnotation, 
  saveLLMConfig, 
  saveReaderSettings,
  saveTexts,
  saveBlueprints,
  getStoredScrollPositions,
  saveStoredScrollPosition,
  getStoredMirrorTranslations
} from './services/storageService';
import { executeLLMQueryStream, buildQueryPrompt } from './services/llmService';
import { 
  auth, 
  onAuthStateChanged, 
  User 
} from './services/firebase';
import { 
  saveAllToCloud, 
  loadAllFromCloud, 
  syncTextToCloud, 
  deleteTextFromCloud, 
  syncBlueprintToCloud, 
  deleteBlueprintFromCloud, 
  syncAnnotationToCloud, 
  deleteAnnotationFromCloud, 
  syncSettingsToCloud, 
  syncScrollPositionToCloud, 
  getCloudSyncMeta, 
  CloudUserData 
} from './services/cloudSyncService';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { LibraryView } from './components/LibraryView';
import { TextReaderView } from './components/TextReaderView';
import { PlaygroundView } from './components/PlaygroundView';
import { TextEditorModal } from './components/TextEditorModal';
import { BlueprintManagerView } from './components/BlueprintManagerView';
import { SettingsView } from './components/SettingsView';
import { DecipherBottomSheet } from './components/DecipherBottomSheet';
import { ActiveQueriesDock } from './components/ActiveQueriesDock';
import { AnnotationsDrawer } from './components/AnnotationsDrawer';
import { CloudSyncModal } from './components/CloudSyncModal';
import { normalizeForMatch, stripHebrewVowels, cleanCopiedReaderText } from './utils/textUtils';
import { DEFAULT_BLUEPRINTS, SAMPLE_TEXTS } from './data/seedData';

type TabType = 'library' | 'reader' | 'playground' | 'blueprints' | 'settings';

export default function App() {
  const [activeTab, setActiveTabState] = useState<TabType>('library');
  
  // Data State
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [blueprints, setBlueprints] = useState<QueryBlueprint[]>([]);
  const [activeText, setActiveText] = useState<TextItem | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'built-in-gemini',
    modelName: 'gemini-3.7-flash',
  });
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>({
    fontSize: 18,
    lineHeight: 1.8,
    fontFamily: 'serif',
    theme: 'obsidian',
    autoDecipherSelection: true,
  });

  // Google Cloud Auth & Sync State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState(false);
  const [lastSyncedTimestamp, setLastSyncedTimestamp] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // Modal & Drawer UI State
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false);
  const [textToEdit, setTextToEdit] = useState<TextItem | null>(null);
  const [isAnnotationsOpen, setIsAnnotationsOpen] = useState(false);

  // Decipher Sheet State
  const [isDecipherSheetOpen, setIsDecipherSheetOpen] = useState(false);
  const [decipherTarget, setDecipherTarget] = useState<{
    type: BlueprintType;
    targetText: string;
    blueprintId: string;
  } | null>(null);
  const [decipherResult, setDecipherResult] = useState<QueryResult | null>(null);
  const [isDecipherLoading, setIsDecipherLoading] = useState(false);
  const [rawQueryPrompt, setRawQueryPrompt] = useState<string>('');
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedPassage, setSelectedPassage] = useState<string | null>(null);
  const [isResultFromCache, setIsResultFromCache] = useState(false);

  // Multi-query background execution management
  const [activeQueries, setActiveQueries] = useState<ActiveDecipherQuery[]>([]);
  const [currentViewingQueryId, setCurrentViewingQueryId] = useState<string | null>(null);
  const currentViewingQueryIdRef = useRef<string | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Keep ref in sync
  useEffect(() => {
    currentViewingQueryIdRef.current = currentViewingQueryId;
  }, [currentViewingQueryId]);

  // Browser History Back-Button Listener & Tab Navigation Ref
  const isPoppingStateRef = useRef(false);

  const openDecipherSheet = () => {
    setIsDecipherSheetOpen(true);
  };

  // Close the decipher bottom sheet and remove finished queries from the active notifications dock
  const handleCloseDecipherSheet = () => {
    setIsDecipherSheetOpen(false);
    setSelectedWord(null);
    setSelectedPassage(null);

    const viewedQueryId = currentViewingQueryIdRef.current || currentViewingQueryId;
    currentViewingQueryIdRef.current = null;
    setCurrentViewingQueryId(null);

    // If an already loaded/finished translation is closed, make its ready notification disappear regardless of where it was opened from
    const targetTextLower = decipherTarget?.targetText?.trim().toLowerCase();
    const targetTextNorm = decipherTarget?.targetText ? normalizeForMatch(decipherTarget.targetText) : '';

    setActiveQueries((prev) => {
      return prev.filter((q) => {
        // Keep in-progress background queries
        if (q.status === 'loading') return true;

        // If it was the explicitly viewed query ID, dismiss its notification
        if (viewedQueryId && q.id === viewedQueryId) return false;

        // If it matches the decipherTarget that was just closed and is ready/completed/errored, dismiss it
        if (targetTextLower) {
          const qTextLower = q.targetText?.trim().toLowerCase();
          const qTextNorm = q.targetText ? normalizeForMatch(q.targetText) : '';
          if (
            (qTextLower === targetTextLower || (targetTextNorm && qTextNorm === targetTextNorm)) &&
            (!decipherTarget || q.type === decipherTarget.type)
          ) {
            return false;
          }
        }

        return true;
      });
    });
  };

  const navigateToTab = (newTab: TabType, textItem?: TextItem | null, pushToHistory = true) => {
    setActiveTabState(newTab);
    if (textItem !== undefined) {
      setActiveText(textItem);
    }
    if (pushToHistory && !isPoppingStateRef.current) {
      window.history.pushState(
        { tab: newTab, textId: textItem ? textItem.id : activeText?.id },
        ''
      );
    }
  };

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const meta = await getCloudSyncMeta(user.uid);
          if (meta?.lastSyncedAt) {
            setLastSyncedTimestamp(meta.lastSyncedAt);
          }
        } catch (e) {
          console.error('Error fetching cloud meta on auth change:', e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Desktop Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input, textarea or contenteditable
      const target = e.target as HTMLElement;
      if (
        target && 
        (target.tagName === 'INPUT' || 
         target.tagName === 'TEXTAREA' || 
         target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (isCloudSyncModalOpen) setIsCloudSyncModalOpen(false);
        else if (isDecipherSheetOpen) handleCloseDecipherSheet();
        else if (isAnnotationsOpen) setIsAnnotationsOpen(false);
        else if (isTextEditorOpen) setIsTextEditorOpen(false);
      } else if (e.key === '1') {
        navigateToTab('library');
      } else if (e.key === '2' && activeText) {
        navigateToTab('reader');
      } else if (e.key === '3') {
        navigateToTab('playground');
      } else if (e.key === '4') {
        navigateToTab('blueprints');
      } else if (e.key === '5') {
        navigateToTab('settings');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCloudSyncModalOpen, 
    isDecipherSheetOpen, 
    isAnnotationsOpen, 
    isTextEditorOpen, 
    activeText
  ]);

  // Maintain and sync browser history with active tab & text
  useEffect(() => {
    window.history.replaceState(
      { tab: activeTab, textId: activeText?.id },
      ''
    );
  }, [activeTab, activeText?.id]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      isPoppingStateRef.current = true;
      
      // If any modal/drawer is open when browser back is pressed, close it and stay on current text/tab
      if (isDecipherSheetOpen) {
        handleCloseDecipherSheet();
        isPoppingStateRef.current = false;
        return;
      }
      if (isCloudSyncModalOpen) {
        setIsCloudSyncModalOpen(false);
        isPoppingStateRef.current = false;
        return;
      }
      if (isAnnotationsOpen) {
        setIsAnnotationsOpen(false);
        isPoppingStateRef.current = false;
        return;
      }
      if (isTextEditorOpen) {
        setIsTextEditorOpen(false);
        isPoppingStateRef.current = false;
        return;
      }

      // Restore history tab state only if an explicit tab was saved in history
      if (event.state && event.state.tab) {
        setActiveTabState(event.state.tab as TabType);
        if (event.state.textId && texts.length > 0) {
          const matched = texts.find((t) => t.id === event.state.textId);
          if (matched) setActiveText(matched);
        }
      }
      isPoppingStateRef.current = false;
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isCloudSyncModalOpen, isDecipherSheetOpen, isAnnotationsOpen, isTextEditorOpen, texts]);

  // Load Initial Storage Data
  useEffect(() => {
    const data = initStorage();
    setTexts(data.texts);
    setBlueprints(data.blueprints);
    setLlmConfig(data.llmConfig);
    setReaderSettings(data.readerSettings);

    if (data.texts.length > 0) {
      setActiveText(data.texts[0]);
    }
  }, []);

  // Sync annotations when activeText changes
  useEffect(() => {
    if (activeText) {
      setAnnotations(getStoredAnnotations(activeText.id));
    }
  }, [activeText]);

  // Handler: Select a text to view in reader
  const handleSelectText = (text: TextItem) => {
    navigateToTab('reader', text);
    setSelectedWord(null);
  };

  // Handler: Save or Edit text item (with automatic Google Cloud sync)
  const handleSaveText = (savedText: TextItem) => {
    const updatedTexts = saveTextItem(savedText);
    setTexts(updatedTexts);
    setActiveText(savedText);

    if (currentUser) {
      syncTextToCloud(currentUser.uid, savedText);
    }
  };

  // Handler: Delete text item
  const handleDeleteText = (id: string) => {
    if (confirm('Delete this text from your library?')) {
      const updatedTexts = deleteTextItem(id);
      setTexts(updatedTexts);
      if (activeText?.id === id) {
        const nextActive = updatedTexts.length > 0 ? updatedTexts[0] : null;
        setActiveText(nextActive);
        if (updatedTexts.length === 0) navigateToTab('library');
      }

      if (currentUser) {
        deleteTextFromCloud(currentUser.uid, id);
      }
    }
  };

  // Handler: Save Query Blueprint
  const handleSaveBlueprint = (bp: QueryBlueprint) => {
    const updatedBp = saveBlueprintItem(bp);
    setBlueprints(updatedBp);

    if (currentUser) {
      syncBlueprintToCloud(currentUser.uid, bp);
    }
  };

  // Handler: Delete Query Blueprint
  const handleDeleteBlueprint = (id: string) => {
    if (confirm('Delete this query blueprint?')) {
      const updatedBp = deleteBlueprintItem(id);
      setBlueprints(updatedBp);

      if (currentUser) {
        deleteBlueprintFromCloud(currentUser.uid, id);
      }
    }
  };

  // Handler: Update Text-Assigned Blueprints from Reader
  const handleUpdateTextBlueprints = (textId: string, wordBpId: string, passageBpId: string) => {
    if (!activeText) return;
    const updated: TextItem = {
      ...activeText,
      wordBlueprintId: wordBpId,
      passageBlueprintId: passageBpId,
      updatedAt: new Date().toISOString(),
    };
    handleSaveText(updated);
  };

  // Execute Query Action with Real-time Streaming & Concurrent Multi-Query Support
  const runDecipherQuery = async (
    type: BlueprintType,
    targetText: string,
    blueprintId: string
  ) => {
    const queryId = `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const controller = new AbortController();
    abortControllersRef.current.set(queryId, controller);

    const blueprint = blueprints.find((b) => b.id === blueprintId) || blueprints[0];
    const bpTemplate = blueprint ? blueprint.template : (type === 'word' ? '{word}' : '{text}');
    const prompt = buildQueryPrompt(bpTemplate, targetText, type);

    const newQuery: ActiveDecipherQuery = {
      id: queryId,
      targetText,
      type,
      blueprintId,
      blueprintName: blueprint ? blueprint.name : (type === 'word' ? 'Word Etymology' : 'Passage Symbolism'),
      prompt,
      status: 'loading',
      streamText: '',
      startedAt: Date.now(),
    };

    setActiveQueries((prev) => [newQuery, ...prev.filter((q) => q.id !== queryId)]);
    currentViewingQueryIdRef.current = queryId;
    setCurrentViewingQueryId(queryId);

    setIsResultFromCache(false);
    setDecipherTarget({ type, targetText, blueprintId });
    setRawQueryPrompt(prompt);
    setIsDecipherLoading(true);
    setDecipherResult({
      text: '',
      providerUsed: llmConfig.provider,
      modelUsed: llmConfig.modelName,
    });
    openDecipherSheet();

    try {
      const res = await executeLLMQueryStream(
        prompt,
        llmConfig,
        (chunkText) => {
          // Update query in activeQueries list
          setActiveQueries((prev) =>
            prev.map((q) =>
              q.id === queryId ? { ...q, streamText: chunkText } : q
            )
          );
          // If the sheet is actively showing this query, update decipherResult
          if (currentViewingQueryIdRef.current === queryId) {
            setDecipherResult({
              text: chunkText,
              providerUsed: llmConfig.provider,
              modelUsed: llmConfig.modelName,
            });
          }
        },
        undefined,
        controller.signal
      );

      if (res.error) {
        setActiveQueries((prev) =>
          prev.map((q) =>
            q.id === queryId
              ? { ...q, status: 'error', error: res.error, result: res }
              : q
          )
        );
        if (currentViewingQueryIdRef.current === queryId) {
          setDecipherResult((prev) => ({
            text: prev?.text || '',
            providerUsed: res.providerUsed,
            modelUsed: res.modelUsed,
            rawRequestPayload: res.rawRequestPayload,
            rawResponsePayload: res.rawResponsePayload,
            error: res.error,
          }));
        }
      } else {
        setActiveQueries((prev) =>
          prev.map((q) =>
            q.id === queryId
              ? { ...q, status: 'completed', result: res, streamText: res.text }
              : q
          )
        );
        if (currentViewingQueryIdRef.current === queryId) {
          setDecipherResult(res);
        }

        // Auto-save annotation so that every deciphered word/passage is persistently stored
        if (res.text && res.text.trim()) {
          const textId = activeText ? activeText.id : 'playground-text';
          const bp = blueprints.find((b) => b.id === blueprintId);
          const autoAnn: Annotation = {
            id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            textId: textId,
            type: type,
            target: targetText,
            blueprintName: bp ? bp.name : 'Quick Decipher',
            queryUsed: prompt,
            result: res.text,
            createdAt: new Date().toISOString(),
            modelUsed: res.modelUsed || llmConfig.modelName,
            providerUsed: res.providerUsed || llmConfig.provider,
          };

          const updatedAnns = saveAnnotation(autoAnn);
          if (activeText) {
            setAnnotations(updatedAnns.filter((a) => a.textId === activeText.id));
            setTexts((prevTexts) =>
              prevTexts.map((t) =>
                t.id === activeText.id ? { ...t, updatedAt: autoAnn.createdAt } : t
              )
            );
          } else {
            setAnnotations(updatedAnns);
          }

          if (currentUser) {
            syncAnnotationToCloud(currentUser.uid, autoAnn).then((syncedIso) => {
              if (syncedIso) {
                setLastSyncedTimestamp(syncedIso);
              }
            });
          }
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'An error occurred during query execution.';
      setActiveQueries((prev) =>
        prev.map((q) =>
          q.id === queryId ? { ...q, status: 'error', error: errMsg } : q
        )
      );
      if (currentViewingQueryIdRef.current === queryId) {
        setDecipherResult((prev) => ({
          text: prev?.text || '',
          providerUsed: llmConfig.provider,
          modelUsed: llmConfig.modelName,
          error: errMsg,
        }));
      }
    } finally {
      if (currentViewingQueryIdRef.current === queryId) {
        setIsDecipherLoading(false);
      }
      abortControllersRef.current.delete(queryId);
    }
  };

  // Execute a custom user-edited raw prompt directly
  const runCustomPromptQuery = async (customPrompt: string) => {
    const queryId = `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const controller = new AbortController();
    abortControllersRef.current.set(queryId, controller);

    const targetName = decipherTarget?.targetText || 'Custom Query';
    const newQuery: ActiveDecipherQuery = {
      id: queryId,
      targetText: targetName,
      type: decipherTarget?.type || 'word',
      blueprintId: decipherTarget?.blueprintId || 'custom',
      blueprintName: 'Custom Prompt',
      prompt: customPrompt,
      status: 'loading',
      streamText: '',
      startedAt: Date.now(),
    };

    setActiveQueries((prev) => [newQuery, ...prev.filter((q) => q.id !== queryId)]);
    currentViewingQueryIdRef.current = queryId;
    setCurrentViewingQueryId(queryId);

    setIsResultFromCache(false);
    setRawQueryPrompt(customPrompt);
    setIsDecipherLoading(true);
    setDecipherResult({
      text: '',
      providerUsed: llmConfig.provider,
      modelUsed: llmConfig.modelName,
    });

    try {
      const res = await executeLLMQueryStream(
        customPrompt,
        llmConfig,
        (chunkText) => {
          setActiveQueries((prev) =>
            prev.map((q) =>
              q.id === queryId ? { ...q, streamText: chunkText } : q
            )
          );
          if (currentViewingQueryIdRef.current === queryId) {
            setDecipherResult({
              text: chunkText,
              providerUsed: llmConfig.provider,
              modelUsed: llmConfig.modelName,
            });
          }
        },
        undefined,
        controller.signal
      );

      if (res.error) {
        setActiveQueries((prev) =>
          prev.map((q) =>
            q.id === queryId
              ? { ...q, status: 'error', error: res.error, result: res }
              : q
          )
        );
        if (currentViewingQueryIdRef.current === queryId) {
          setDecipherResult((prev) => ({
            text: prev?.text || '',
            providerUsed: res.providerUsed,
            modelUsed: res.modelUsed,
            rawRequestPayload: res.rawRequestPayload,
            rawResponsePayload: res.rawResponsePayload,
            error: res.error,
          }));
        }
      } else {
        setActiveQueries((prev) =>
          prev.map((q) =>
            q.id === queryId
              ? { ...q, status: 'completed', result: res, streamText: res.text }
              : q
          )
        );
        if (currentViewingQueryIdRef.current === queryId) {
          setDecipherResult(res);
        }

        if (res.text && res.text.trim() && decipherTarget) {
          const textId = activeText ? activeText.id : 'playground-text';
          const bp = blueprints.find((b) => b.id === decipherTarget.blueprintId);
          const autoAnn: Annotation = {
            id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            textId: textId,
            type: decipherTarget.type,
            target: decipherTarget.targetText,
            blueprintName: bp ? bp.name : 'Custom Query',
            queryUsed: customPrompt,
            result: res.text,
            createdAt: new Date().toISOString(),
            modelUsed: res.modelUsed || llmConfig.modelName,
            providerUsed: res.providerUsed || llmConfig.provider,
          };

          const updatedAnns = saveAnnotation(autoAnn);
          if (activeText) {
            setAnnotations(updatedAnns.filter((a) => a.textId === activeText.id));
            setTexts((prevTexts) =>
              prevTexts.map((t) =>
                t.id === activeText.id ? { ...t, updatedAt: autoAnn.createdAt } : t
              )
            );
          } else {
            setAnnotations(updatedAnns);
          }

          if (currentUser) {
            syncAnnotationToCloud(currentUser.uid, autoAnn).then((syncedIso) => {
              if (syncedIso) {
                setLastSyncedTimestamp(syncedIso);
              }
            });
          }
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'An error occurred during query execution.';
      setActiveQueries((prev) =>
        prev.map((q) =>
          q.id === queryId ? { ...q, status: 'error', error: errMsg } : q
        )
      );
      if (currentViewingQueryIdRef.current === queryId) {
        setDecipherResult((prev) => ({
          text: prev?.text || '',
          providerUsed: llmConfig.provider,
          modelUsed: llmConfig.modelName,
          error: errMsg,
        }));
      }
    } finally {
      if (currentViewingQueryIdRef.current === queryId) {
        setIsDecipherLoading(false);
      }
      abortControllersRef.current.delete(queryId);
    }
  };

  // Halt currently active streaming request
  const handleHaltQuery = () => {
    const targetQueryId = currentViewingQueryIdRef.current || currentViewingQueryId;
    if (targetQueryId && abortControllersRef.current.has(targetQueryId)) {
      abortControllersRef.current.get(targetQueryId)?.abort();
      abortControllersRef.current.delete(targetQueryId);
      setActiveQueries((prev) =>
        prev.map((q) =>
          q.id === targetQueryId
            ? { ...q, status: 'error', error: 'Deciphering halted by user.' }
            : q
        )
      );
    }
    setIsDecipherLoading(false);
  };

  // Halt specific query by ID from the ActiveQueriesDock
  const handleHaltQueryById = (queryId: string) => {
    if (abortControllersRef.current.has(queryId)) {
      abortControllersRef.current.get(queryId)?.abort();
      abortControllersRef.current.delete(queryId);
    }
    setActiveQueries((prev) =>
      prev.map((q) =>
        q.id === queryId
          ? { ...q, status: 'error', error: 'Deciphering halted by user.' }
          : q
      )
    );
    if (currentViewingQueryIdRef.current === queryId) {
      setIsDecipherLoading(false);
    }
  };

  // Dismiss a finished or errored query from the dock
  const handleDismissQueryById = (queryId: string) => {
    if (abortControllersRef.current.has(queryId)) {
      abortControllersRef.current.get(queryId)?.abort();
      abortControllersRef.current.delete(queryId);
    }
    setActiveQueries((prev) => prev.filter((q) => q.id !== queryId));
    if (currentViewingQueryIdRef.current === queryId) {
      currentViewingQueryIdRef.current = null;
      setCurrentViewingQueryId(null);
      setIsDecipherLoading(false);
    }
  };

  // Select / expand query from the dock into the main bottom sheet
  const handleSelectQueryFromDock = (query: ActiveDecipherQuery) => {
    currentViewingQueryIdRef.current = query.id;
    setCurrentViewingQueryId(query.id);
    if (query.type === 'word') {
      setSelectedWord(query.targetText);
      setSelectedPassage(null);
    } else {
      setSelectedPassage(query.targetText);
      setSelectedWord(null);
    }
    setDecipherTarget({
      type: query.type,
      targetText: query.targetText,
      blueprintId: query.blueprintId,
    });
    setRawQueryPrompt(query.prompt);
    setIsResultFromCache(false);
    setIsDecipherLoading(query.status === 'loading');
    setDecipherResult(
      query.result || {
        text: query.streamText || '',
        providerUsed: llmConfig.provider,
        modelUsed: llmConfig.modelName,
        error: query.error,
      }
    );
    openDecipherSheet();
  };

  // Handle Single Word Click/Tap
  const handleWordClick = (word: string, blueprintId: string) => {
    setSelectedWord(word);
    setSelectedPassage(null);
    const clean = word.trim().toLowerCase();
    const cleanNorm = normalizeForMatch(word);

    // 1. Is there an active query already loading in the background for this exact word?
    const existingLoading = activeQueries.find(
      (q) =>
        q.type === 'word' &&
        q.status === 'loading' &&
        (q.targetText.trim().toLowerCase() === clean || normalizeForMatch(q.targetText) === cleanNorm)
    );
    if (existingLoading) {
      handleSelectQueryFromDock(existingLoading);
      return;
    }

    // 2. Check if word has existing saved annotations for current text (sorted latest first)
    const matching = annotations
      .filter(
        (a) =>
          a.type === 'word' &&
          (!activeText || a.textId === activeText.id || a.textId === 'playground-text') &&
          (a.target.trim().toLowerCase() === clean || normalizeForMatch(a.target) === cleanNorm)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (matching.length > 0) {
      const latest = matching[0];
      currentViewingQueryIdRef.current = null;
      setCurrentViewingQueryId(null);
      setDecipherTarget({ type: 'word', targetText: word, blueprintId });
      setRawQueryPrompt(latest.queryUsed || `[Stored Annotation Query for ${word}]`);
      setDecipherResult({
        text: latest.result,
        providerUsed: latest.providerUsed || 'Stored Cache',
        modelUsed: latest.modelUsed || latest.blueprintName || 'Saved Annotation',
      });
      setIsResultFromCache(true);
      setIsDecipherLoading(false);
      openDecipherSheet();
      return;
    }

    // 3. Is there an active query in the dock that recently completed for this word?
    const existingFinished = activeQueries.find(
      (q) =>
        q.type === 'word' &&
        (q.targetText.trim().toLowerCase() === clean || normalizeForMatch(q.targetText) === cleanNorm)
    );
    if (existingFinished && (existingFinished.result || existingFinished.streamText)) {
      handleSelectQueryFromDock(existingFinished);
      return;
    }

    // 4. Otherwise, run a new query
    setIsResultFromCache(false);
    runDecipherQuery('word', word, blueprintId);
  };

  // Handle Passage Selection (with cached annotation check for exact passage match)
  const handlePassageSelect = (passage: string, blueprintId: string) => {
    setSelectedPassage(passage);
    setSelectedWord(null);
    const cleanNorm = normalizeForMatch(passage);
    const cleanRaw = passage.trim().toLowerCase();

    // 1. Is there an active query already loading in the background for this exact passage?
    const existingLoading = activeQueries.find(
      (q) =>
        q.type === 'passage' &&
        q.status === 'loading' &&
        (q.targetText.trim().toLowerCase() === cleanRaw || normalizeForMatch(q.targetText) === cleanNorm)
    );
    if (existingLoading) {
      handleSelectQueryFromDock(existingLoading);
      return;
    }

    // 2. Check if passage has existing saved annotations for current text (exact or unpointed match)
    const cleanUnpointed = stripHebrewVowels(cleanNorm);

    const matching = annotations
      .filter((a) => {
        const matchesText = !activeText || a.textId === activeText.id || a.textId === 'playground-text';
        if (!matchesText) return false;
        if (a.type !== 'passage') return false;

        const aNorm = normalizeForMatch(a.target);
        const aRaw = a.target.trim().toLowerCase();
        const aUnpointed = stripHebrewVowels(aNorm);

        return aNorm === cleanNorm || aRaw === cleanRaw || (cleanUnpointed.length >= 2 && aUnpointed === cleanUnpointed);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (matching.length > 0) {
      const latest = matching[0];
      currentViewingQueryIdRef.current = null;
      setCurrentViewingQueryId(null);
      setDecipherTarget({ type: 'passage', targetText: passage, blueprintId });
      setRawQueryPrompt(latest.queryUsed || `[Stored Annotation Query for Passage]`);
      setDecipherResult({
        text: latest.result,
        providerUsed: latest.providerUsed || 'Stored Cache',
        modelUsed: latest.modelUsed || latest.blueprintName || 'Saved Annotation',
      });
      setIsResultFromCache(true);
      setIsDecipherLoading(false);
      openDecipherSheet();
      return;
    }

    // 3. Is there an active query in the dock that recently completed for this passage?
    const existingFinished = activeQueries.find(
      (q) =>
        q.type === 'passage' &&
        (q.targetText.trim().toLowerCase() === cleanRaw || normalizeForMatch(q.targetText) === cleanNorm)
    );
    if (existingFinished && (existingFinished.result || existingFinished.streamText)) {
      handleSelectQueryFromDock(existingFinished);
      return;
    }

    // 4. Otherwise, run a new query
    setIsResultFromCache(false);
    runDecipherQuery('passage', passage, blueprintId);
  };

  // Handle Save Annotation to Local and Cloud
  const handleSaveAnnotation = () => {
    if (!decipherTarget || !decipherResult?.text) return;
    const bp = blueprints.find((b) => b.id === decipherTarget.blueprintId);

    const newAnnotation: Annotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      textId: activeText ? activeText.id : 'playground-text',
      type: decipherTarget.type,
      target: decipherTarget.targetText,
      blueprintName: bp ? bp.name : 'Custom Query',
      queryUsed: rawQueryPrompt,
      result: decipherResult.text,
      createdAt: new Date().toISOString(),
      modelUsed: decipherResult.modelUsed || llmConfig.modelName,
      providerUsed: decipherResult.providerUsed || llmConfig.provider,
    };

    const updated = saveAnnotation(newAnnotation);
    if (activeText) {
      setAnnotations(updated.filter((a) => a.textId === activeText.id));
      setTexts((prevTexts) =>
        prevTexts.map((t) =>
          t.id === activeText.id ? { ...t, updatedAt: newAnnotation.createdAt } : t
        )
      );
    } else {
      setAnnotations(updated);
    }

    if (currentUser) {
      syncAnnotationToCloud(currentUser.uid, newAnnotation).then((syncedIso) => {
        if (syncedIso) {
          setLastSyncedTimestamp(syncedIso);
        }
      });
    }
  };

  // Handle Delete Annotation
  const handleDeleteAnnotation = (id: string) => {
    const updated = deleteAnnotation(id);
    if (activeText) {
      setAnnotations(updated.filter((a) => a.textId === activeText.id));
    } else {
      setAnnotations(updated);
    }

    if (currentUser) {
      deleteAnnotationFromCloud(currentUser.uid, id);
    }
  };

  // 1-Click Apply Cloud Data Restore
  const handleApplyCloudData = (cloudData: CloudUserData) => {
    if (cloudData.texts && cloudData.texts.length > 0) {
      setTexts(cloudData.texts);
      saveTexts(cloudData.texts);
      if (!activeText || !cloudData.texts.some((t) => t.id === activeText.id)) {
        setActiveText(cloudData.texts[0]);
      }
    }
    if (cloudData.blueprints && cloudData.blueprints.length > 0) {
      setBlueprints(cloudData.blueprints);
      saveBlueprints(cloudData.blueprints);
    }
    if (cloudData.llmConfig) {
      setLlmConfig(cloudData.llmConfig);
      saveLLMConfig(cloudData.llmConfig);
    }
    if (cloudData.readerSettings) {
      setReaderSettings(cloudData.readerSettings);
      saveReaderSettings(cloudData.readerSettings);
    }
    if (cloudData.annotations && cloudData.annotations.length > 0) {
      localStorage.setItem('symbolic_annotations_v1', JSON.stringify(cloudData.annotations));
      if (activeText) {
        setAnnotations(cloudData.annotations.filter((a) => a.textId === activeText.id));
      } else {
        setAnnotations(cloudData.annotations);
      }
    }
    if (cloudData.scrollPositions) {
      localStorage.setItem('symbolic_scroll_positions_v1', JSON.stringify(cloudData.scrollPositions));
    }
    if (cloudData.mirrorTranslations && typeof cloudData.mirrorTranslations === 'object') {
      localStorage.setItem('symbolic_mirror_translations_v1', JSON.stringify(cloudData.mirrorTranslations));
    }
  };

  // Reset all local data
  const handleResetAllData = () => {
    if (confirm('Reset all application data and restore defaults?')) {
      localStorage.clear();
      const fresh = initStorage();
      setTexts(fresh.texts);
      setBlueprints(fresh.blueprints);
      setLlmConfig(fresh.llmConfig);
      setReaderSettings(fresh.readerSettings);
      setActiveText(fresh.texts[0]);
      setAnnotations([]);
      navigateToTab('library');
    }
  };

  const isCurrentAnnotationSaved = Boolean(
    decipherTarget &&
    annotations.some(
      (a) =>
        a.type === decipherTarget.type &&
        (a.target.trim().toLowerCase() === decipherTarget.targetText.trim().toLowerCase() ||
          normalizeForMatch(a.target) === normalizeForMatch(decipherTarget.targetText)) &&
        a.result.trim() === decipherResult?.text.trim()
    )
  );

  const activeBlueprintName = decipherTarget
    ? blueprints.find((b) => b.id === decipherTarget.blueprintId)?.name || 'Decipher Query'
    : 'Decipher Query';

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-800 selection:text-amber-100 antialiased">
      {/* Top Application Bar with Desktop Navigation & Cloud Sync */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={(t) => navigateToTab(t)}
        activeTextTitle={activeText?.title}
        hasActiveText={Boolean(activeText)}
        readerSettings={readerSettings}
        onUpdateReaderSettings={(s) => {
          setReaderSettings(s);
          saveReaderSettings(s);
          if (currentUser) syncSettingsToCloud(currentUser.uid, llmConfig, s);
        }}
        currentUser={currentUser}
        onOpenCloudSyncModal={() => setIsCloudSyncModalOpen(true)}
        isCloudSyncing={isCloudSyncing}
        lastSyncedTimestamp={lastSyncedTimestamp}
      />

      {/* Main Content Area */}
      <main 
        id="main-scroll-container" 
        className={`flex-1 flex flex-col ${isDecipherSheetOpen ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {activeTab === 'library' && (
          <LibraryView
            texts={texts}
            blueprints={blueprints}
            onSelectText={handleSelectText}
            onOpenCreateTextModal={() => {
              setTextToEdit(null);
              setIsTextEditorOpen(true);
            }}
            onOpenEditTextModal={(text) => {
              setTextToEdit(text);
              setIsTextEditorOpen(true);
            }}
            onDeleteText={handleDeleteText}
            onRefreshData={() => {
              const fresh = initStorage();
              setTexts(fresh.texts);
            }}
            onOpenCloudSyncModal={() => setIsCloudSyncModalOpen(true)}
            isCloudSynced={Boolean(currentUser)}
          />
        )}

        {activeTab === 'reader' && activeText && (
          <TextReaderView
            text={activeText}
            blueprints={blueprints}
            annotations={annotations}
            readerSettings={readerSettings}
            llmConfig={llmConfig}
            currentUser={currentUser}
            onUpdateReaderSettings={(s) => {
              setReaderSettings(s);
              saveReaderSettings(s);
              if (currentUser) syncSettingsToCloud(currentUser.uid, llmConfig, s);
            }}
            onUpdateTextBlueprints={handleUpdateTextBlueprints}
            onWordClick={handleWordClick}
            onPassageSelect={handlePassageSelect}
            onOpenAnnotations={() => setIsAnnotationsOpen(true)}
            selectedWord={selectedWord}
            selectedPassage={selectedPassage}
          />
        )}

        {activeTab === 'playground' && (
          <PlaygroundView
            blueprints={blueprints}
            llmConfig={llmConfig}
            annotations={annotations}
            onRunDecipherQuery={(type, text, blueprintId) => {
              if (type === 'word') {
                handleWordClick(text, blueprintId);
              } else {
                handlePassageSelect(text, blueprintId);
              }
            }}
            onSaveAsTextItem={(title, content) => {
              const newText: TextItem = {
                id: `text-${Date.now()}`,
                title: title || 'Saved Snippet',
                language: 'Foreign',
                content: content,
                wordBlueprintId: blueprints[0]?.id || 'bp-word-etymology',
                passageBlueprintId: blueprints[1]?.id || 'bp-passage-symbolism',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              handleSaveText(newText);
              navigateToTab('reader', newText);
            }}
          />
        )}

        {activeTab === 'blueprints' && (
          <BlueprintManagerView
            blueprints={blueprints}
            onSaveBlueprint={handleSaveBlueprint}
            onDeleteBlueprint={handleDeleteBlueprint}
            llmConfig={llmConfig}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            llmConfig={llmConfig}
            onSaveLLMConfig={(cfg) => {
              setLlmConfig(cfg);
              saveLLMConfig(cfg);
              if (currentUser) syncSettingsToCloud(currentUser.uid, cfg, readerSettings);
            }}
            readerSettings={readerSettings}
            onSaveReaderSettings={(s) => {
              setReaderSettings(s);
              saveReaderSettings(s);
              if (currentUser) syncSettingsToCloud(currentUser.uid, llmConfig, s);
            }}
            onResetAllData={handleResetAllData}
            currentUser={currentUser}
            onOpenCloudSyncModal={() => setIsCloudSyncModalOpen(true)}
            isCloudSynced={Boolean(currentUser)}
          />
        )}
      </main>

      {/* Bottom Navigation Bar (Phone only, hidden on desktop/tablet) */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={(t) => navigateToTab(t)}
        hasActiveText={Boolean(activeText)}
      />

      {/* Google Cloud Sync Center Modal */}
      <CloudSyncModal
        isOpen={isCloudSyncModalOpen}
        onClose={() => setIsCloudSyncModalOpen(false)}
        currentUser={currentUser}
        onUserChange={setCurrentUser}
        localData={{
          texts,
          blueprints,
          annotations: getStoredAnnotations(),
          mirrorTranslations: getStoredMirrorTranslations(),
          llmConfig,
          readerSettings,
          scrollPositions: getStoredScrollPositions(),
        }}
        onApplyCloudData={handleApplyCloudData}
        lastSyncedTimestamp={lastSyncedTimestamp}
        onUpdateLastSynced={setLastSyncedTimestamp}
      />

      {/* Text Editor Modal */}
      <TextEditorModal
        isOpen={isTextEditorOpen}
        onClose={() => setIsTextEditorOpen(false)}
        textToEdit={textToEdit}
        blueprints={blueprints}
        onSave={handleSaveText}
      />

      {/* Active Multi-Query Notification & Task Dock */}
      <ActiveQueriesDock
        queries={activeQueries}
        activeQueryId={isDecipherSheetOpen ? currentViewingQueryId : null}
        onSelectQuery={handleSelectQueryFromDock}
        onHaltQuery={handleHaltQueryById}
        onDismissQuery={handleDismissQueryById}
      />

      {/* Decipher Query Result Bottom Sheet */}
      {(() => {
        const matchingTranslations = decipherTarget
          ? annotations
              .filter(
                (a) =>
                  a.type === decipherTarget.type &&
                  (!activeText || a.textId === activeText.id || a.textId === 'playground-text') &&
                  (a.target.trim().toLowerCase() === decipherTarget.targetText.trim().toLowerCase() ||
                    normalizeForMatch(a.target) === normalizeForMatch(decipherTarget.targetText))
              )
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          : [];

        return (
          <DecipherBottomSheet
            isOpen={isDecipherSheetOpen}
            onClose={handleCloseDecipherSheet}
            type={decipherTarget?.type || 'word'}
            targetText={decipherTarget?.targetText || ''}
            blueprintName={activeBlueprintName}
            result={decipherResult}
            isLoading={isDecipherLoading}
            onSaveAnnotation={handleSaveAnnotation}
            isSaved={isCurrentAnnotationSaved}
            savedTranslations={matchingTranslations}
            onDeleteSingleTranslation={handleDeleteAnnotation}
            createdAtDate={matchingTranslations[0]?.createdAt}
            onRetry={() => {
              if (decipherTarget) {
                runDecipherQuery(
                  decipherTarget.type,
                  decipherTarget.targetText,
                  decipherTarget.blueprintId
                );
              }
            }}
            onHalt={handleHaltQuery}
            rawQueryPrompt={rawQueryPrompt}
            isCached={isResultFromCache}
            onForceReTranslate={() => {
              if (decipherTarget) {
                runDecipherQuery(
                  decipherTarget.type,
                  decipherTarget.targetText,
                  decipherTarget.blueprintId
                );
              }
            }}
            onRunCustomPrompt={runCustomPromptQuery}
          />
        );
      })()}

      {/* Annotations Drawer */}
      {activeText && (
        <AnnotationsDrawer
          isOpen={isAnnotationsOpen}
          onClose={() => setIsAnnotationsOpen(false)}
          textTitle={activeText.title}
          annotations={annotations}
          onDeleteAnnotation={handleDeleteAnnotation}
        />
      )}
    </div>
  );
}
