import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Copy, 
  Check, 
  UploadCloud, 
  RotateCcw, 
  ArrowRightLeft, 
  SlidersHorizontal, 
  Eye, 
  Edit3, 
  Layers, 
  AlertCircle,
  HelpCircle,
  FileText,
  Trash2,
  Cpu,
  Globe,
  Zap,
  Unlink,
  Link2
} from 'lucide-react';
import { TextItem, LLMConfig, MirrorTranslationData, MirrorWordPair } from '../types';
import { 
  buildTokenOptimizedMirrorPrompt, 
  parseMirrorCalqueText, 
  DEFAULT_SAMPLE_MIRROR_TRANSLATIONS 
} from '../utils/mirrorTranslationUtils';
import { executeLLMQueryStream } from '../services/llmService';

interface MirrorTranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  text: TextItem;
  llmConfig: LLMConfig;
  currentMirrorData: MirrorTranslationData | null;
  onSaveMirrorData: (data: MirrorTranslationData) => void;
  onDeleteMirrorData?: () => void;
}

export const MirrorTranslationModal: React.FC<MirrorTranslationModalProps> = ({
  isOpen,
  onClose,
  text,
  llmConfig,
  currentMirrorData,
  onSaveMirrorData,
  onDeleteMirrorData,
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'prompt' | 'import' | 'editor' | 'composites'>('ai');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [editableMirrorData, setEditableMirrorData] = useState<MirrorTranslationData | null>(currentMirrorData);
  const [editingWordPair, setEditingWordPair] = useState<{ 
    pIdx: number; 
    wIdx: number; 
    trans: string;
    compoundMeaning?: string;
  } | null>(null);

  useEffect(() => {
    setEditableMirrorData(currentMirrorData);
    if (currentMirrorData?.rawCalqueText) {
      setPasteText(currentMirrorData.rawCalqueText);
    } else {
      const defaultSample = DEFAULT_SAMPLE_MIRROR_TRANSLATIONS[text.id];
      if (defaultSample) {
        setPasteText(defaultSample);
      } else {
        setPasteText('');
      }
    }
  }, [currentMirrorData, text.id, isOpen]);

  if (!isOpen) return null;

  const promptObj = buildTokenOptimizedMirrorPrompt(text.content, text.language);

  // Approximate token count estimation (1 token ≈ 4 chars)
  const approxTokens = Math.round(promptObj.userInstructionPrompt.length / 4);

  // AI Direct Generation
  const handleGenerateAI = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setStreamText('');

    try {
      let accumulated = '';
      const result = await executeLLMQueryStream(
        promptObj.prompt,
        llmConfig,
        (chunk) => {
          accumulated = chunk;
          setStreamText(chunk);
        },
        promptObj.systemInstruction
      );

      if (result.error) {
        setGenerationError(result.error);
      } else {
        const generatedRaw = result.text || accumulated;
        const parsedData = parseMirrorCalqueText(
          text.content,
          generatedRaw,
          text.id,
          `${llmConfig.provider}:${llmConfig.modelName}`,
          currentMirrorData
        );
        setEditableMirrorData(parsedData);
        onSaveMirrorData(parsedData);
        setActiveTab('editor');
      }
    } catch (err: any) {
      setGenerationError(err.message || 'An unexpected error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy Prompt for External LLMs
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(promptObj.userInstructionPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2200);
  };

  // Import / Apply Pasted Mirror Text
  const handleApplyPastedText = () => {
    if (!pasteText.trim()) return;
    const parsedData = parseMirrorCalqueText(
      text.content,
      pasteText.trim(),
      text.id,
      'manual-import',
      editableMirrorData
    );
    setEditableMirrorData(parsedData);
    onSaveMirrorData(parsedData);
    setActiveTab('editor');
  };

  // Toggle keep in original language for word pair
  const handleToggleKeepOrig = (pIdx: number, wIdx: number) => {
    if (!editableMirrorData) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (targetPara && targetPara.words[wIdx]) {
      const currentWord = targetPara.words[wIdx];
      const nextKeepOrig = !currentWord.keepOrig;
      const updatedWords = [...targetPara.words];
      updatedWords[wIdx] = {
        ...currentWord,
        keepOrig: nextKeepOrig,
      };
      targetPara.words = updatedWords;
      const updatedData: MirrorTranslationData = {
        ...editableMirrorData,
        paragraphs: updatedParas,
        updatedAt: new Date().toISOString(),
      };
      setEditableMirrorData(updatedData);
      onSaveMirrorData(updatedData);
    }
  };

  // Edit single word translation in inspector
  const handleSaveWordEdit = () => {
    if (!editingWordPair || !editableMirrorData) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[editingWordPair.pIdx];
    if (targetPara && targetPara.words[editingWordPair.wIdx]) {
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

      // If composite meaning changed, sync all words in group
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
    }
    setEditingWordPair(null);
  };

  // Insert a gap / shift subsequent translations to the right in the paragraph
  const handleInsertGap = (pIdx: number, wIdx: number) => {
    if (!editableMirrorData) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (!targetPara) return;

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

  // Remove translation & shift subsequent translations to the left in the paragraph
  const handleShiftLeft = (pIdx: number, wIdx: number) => {
    if (!editableMirrorData) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (!targetPara) return;

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

  // Unlink composite word group
  const handleUnlinkGroup = (pIdx: number, groupId: string) => {
    if (!editableMirrorData) return;
    const updatedParas = [...editableMirrorData.paragraphs];
    const targetPara = updatedParas[pIdx];
    if (!targetPara) return;

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

  // Toggle Global Composite Display Preference
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

  // Full re-align using global continuous stream
  const handleRealignFromRaw = () => {
    if (!editableMirrorData?.rawCalqueText) return;
    const parsedData = parseMirrorCalqueText(
      text.content,
      editableMirrorData.rawCalqueText,
      text.id,
      editableMirrorData.sourceModel || 'realigned-stream'
    );
    setEditableMirrorData(parsedData);
    onSaveMirrorData(parsedData);
  };

  // Quick stats
  const totalOriginalWords = editableMirrorData?.paragraphs.reduce((acc, p) => acc + p.words.length, 0) || 0;
  
  // Collect all unique composite groups across paragraphs
  const compositeGroups: {
    pIdx: number;
    groupId: string;
    groupIndex: number;
    parts: { wIdx: number; orig: string; trans: string }[];
    compoundMeaning: string;
    preferCompound?: boolean;
  }[] = [];

  if (editableMirrorData) {
    editableMirrorData.paragraphs.forEach((para, pIdx) => {
      const groupMap = new Map<string, {
        groupId: string;
        groupIndex: number;
        parts: { wIdx: number; orig: string; trans: string }[];
        compoundMeaning: string;
        preferCompound?: boolean;
      }>();

      para.words.forEach((w, wIdx) => {
        if (w.composite) {
          const gId = w.composite.id;
          if (!groupMap.has(gId)) {
            groupMap.set(gId, {
              groupId: gId,
              groupIndex: w.composite.groupIndex || 1,
              parts: [],
              compoundMeaning: w.composite.compoundMeaning,
              preferCompound: w.preferCompoundInMirror,
            });
          }
          groupMap.get(gId)!.parts.push({
            wIdx,
            orig: w.orig,
            trans: w.trans,
          });
        }
      });

      groupMap.forEach((val) => {
        compositeGroups.push({
          pIdx,
          ...val,
        });
      });
    });
  }

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div 
        className="bg-stone-900 border border-stone-800 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh] animate-fade-in"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-serif text-lg font-bold text-stone-100">Mirror Translation & Calque Engine</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
                  Fixed Width Alignment
                </span>
                {compositeGroups.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 text-[10px] font-mono border border-cyan-700/60 flex items-center space-x-1">
                    <Zap className="w-2.5 h-2.5 text-cyan-400" />
                    <span>{compositeGroups.length} composite groups</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-400">
                Pixel-perfect etymological calque with full separable composite verb notation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 p-1.5 rounded-xl hover:bg-stone-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-stone-800 px-5 pt-3 bg-stone-900/90 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center space-x-2 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              activeTab === 'ai'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
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
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Token-Optimized Prompt</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center space-x-2 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              activeTab === 'import'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Import / Paste Calque</span>
          </button>

          {editableMirrorData && (
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center space-x-2 pb-3 px-3 border-b-2 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeTab === 'editor'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Word Alignment Inspector ({totalOriginalWords})</span>
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
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Separable Verbs & Composites ({compositeGroups.length})</span>
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-sm text-stone-300">
          {/* TAB 1: AI Direct Generation */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-stone-950/60 border border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-medium text-stone-200">Active Model:</span>
                    <span className="px-2 py-0.5 rounded bg-stone-800 text-amber-300 text-xs font-mono border border-stone-700">
                      {llmConfig.provider} / {llmConfig.modelName}
                    </span>
                  </div>
                  <span className="text-xs text-stone-400">~{approxTokens} tokens</span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Generates a strict 1:1 etymological calque in English. Separable composite verbs placed apart (such as German <em>zeichnet ... aus</em>) use bracketed notation <code className="text-amber-300 font-mono text-[11px] bg-stone-900 px-1 py-0.5 rounded">[1:distinguishes]</code> to link discontinuous parts seamlessly.
                </p>
                <div className="pt-2 flex items-center space-x-3">
                  <button
                    onClick={handleGenerateAI}
                    disabled={isGenerating}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-xs flex items-center space-x-2 transition shadow-md cursor-pointer"
                  >
                    <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>{isGenerating ? 'Generating Calque Stream...' : 'Generate Mirror Translation'}</span>
                  </button>
                  {editableMirrorData && (
                    <span className="text-xs text-emerald-400 flex items-center space-x-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Calque Active ({editableMirrorData.sourceModel || 'Custom'})</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Streaming Output Box */}
              {(isGenerating || streamText) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-stone-400">
                    <span>Live AI Generation Stream:</span>
                    {isGenerating && <span className="text-amber-400 animate-pulse">Streaming chunks...</span>}
                  </div>
                  <div className="p-4 rounded-2xl bg-stone-950 border border-amber-500/30 text-stone-200 font-mono text-xs max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                    {streamText || 'Waiting for response chunks...'}
                  </div>
                </div>
              )}

              {generationError && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{generationError}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Token-Optimized Prompt for External LLMs */}
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <span className="font-medium text-stone-200">Concise Prompt Template</span>
                  <span className="text-xs text-stone-500">({approxTokens} estimated tokens)</span>
                </div>
                <button
                  onClick={handleCopyPrompt}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium border border-amber-500/40 flex items-center space-x-1.5 transition cursor-pointer"
                >
                  {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPrompt ? 'Copied to Clipboard!' : 'Copy Entire Prompt'}</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 font-mono text-xs text-stone-300 max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {promptObj.userInstructionPrompt}
              </div>

              <div className="p-3.5 rounded-xl bg-stone-800/40 border border-stone-700/60 text-xs text-stone-400 space-y-1.5">
                <div className="font-semibold text-stone-300">Composite Word Notation Guide:</div>
                <p className="leading-relaxed">
                  For separable verbs placed apart (e.g. <em>zeichnet ... aus</em>), attach bracket tags to each part:
                  <br />
                  <code className="text-cyan-300 font-mono">draws[1:distinguishes] ... out[1]</code>
                  <br />
                  The parser will automatically group them, render linking badges, and provide both literal separated and compound translations in the reader.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Import / Paste Calque */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-200">Paste Mirror English Text:</span>
                <span className="text-xs text-stone-400">Supports [id:compound] separable verb tags</span>
              </div>

              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the word-for-word mirror translation output here..."
                rows={9}
                className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-2xl p-4 text-stone-200 font-serif text-sm leading-relaxed focus:outline-hidden focus:ring-1 focus:ring-amber-500 transition"
              />

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => {
                    const sample = DEFAULT_SAMPLE_MIRROR_TRANSLATIONS[text.id];
                    if (sample) setPasteText(sample);
                  }}
                  className="text-xs text-stone-400 hover:text-amber-300 transition underline cursor-pointer"
                >
                  Load sample calque for this text
                </button>
                <button
                  onClick={handleApplyPastedText}
                  disabled={!pasteText.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-xs flex items-center space-x-2 transition shadow-md cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Parse & Apply Calque</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: Calque Word Alignment Inspector */}
          {activeTab === 'editor' && editableMirrorData && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-stone-200">Word-by-Word Alignment Grid</span>
                  <p className="text-xs text-stone-400">
                    Click any word pair to edit text, inspect compound linkages, insert gaps, or shift pairings.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleRealignFromRaw}
                    className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs border border-stone-700 flex items-center space-x-1.5 transition cursor-pointer"
                    title="Re-run global continuous token alignment against the raw calque"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Re-align Stream</span>
                  </button>
                  {onDeleteMirrorData && (
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this mirror translation?')) {
                          onDeleteMirrorData();
                          setEditableMirrorData(null);
                          setActiveTab('ai');
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 text-xs border border-red-800/60 flex items-center space-x-1 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete Calque</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Editing Popover / Row */}
              {editingWordPair && (
                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-600/50 flex flex-col space-y-3 animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="text-stone-400">Original:</span>
                      <span className="font-bold text-amber-200 font-serif">
                        {editableMirrorData.paragraphs[editingWordPair.pIdx]?.words[editingWordPair.wIdx]?.orig}
                      </span>
                      <span className="text-stone-500">→</span>
                      <input
                        type="text"
                        value={editingWordPair.trans}
                        onChange={(e) => setEditingWordPair({ ...editingWordPair, trans: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveWordEdit();
                          if (e.key === 'Escape') setEditingWordPair(null);
                        }}
                        placeholder="Literal gloss..."
                        autoFocus
                        className="bg-stone-900 border border-amber-500/70 rounded-lg px-2.5 py-1 text-amber-100 text-xs focus:outline-hidden focus:ring-1 focus:ring-amber-400 w-36"
                      />
                    </div>

                    {/* If word has composite link, show compound meaning editor */}
                    {editableMirrorData.paragraphs[editingWordPair.pIdx]?.words[editingWordPair.wIdx]?.composite && (
                      <div className="flex items-center space-x-2 bg-cyan-950/60 px-2.5 py-1 rounded-lg border border-cyan-700/60">
                        <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="text-[11px] text-cyan-300">Compound Meaning:</span>
                        <input
                          type="text"
                          value={editingWordPair.compoundMeaning ?? (editableMirrorData.paragraphs[editingWordPair.pIdx]?.words[editingWordPair.wIdx]?.composite?.compoundMeaning || '')}
                          onChange={(e) => setEditingWordPair({ ...editingWordPair, compoundMeaning: e.target.value })}
                          className="bg-stone-900 border border-cyan-500/70 rounded px-2 py-0.5 text-cyan-200 text-xs focus:outline-hidden focus:ring-1 focus:ring-cyan-400 w-32"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-stone-800/80">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          handleToggleKeepOrig(editingWordPair.pIdx, editingWordPair.wIdx);
                          setEditingWordPair(null);
                        }}
                        className={`px-2 py-1 rounded-lg text-xs flex items-center space-x-1 border ${
                          editableMirrorData.paragraphs[editingWordPair.pIdx]?.words[editingWordPair.wIdx]?.keepOrig
                            ? 'bg-emerald-900/60 text-emerald-300 border-emerald-600'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
                        }`}
                        title="Keep this word in original language during mirror mode"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>
                          {editableMirrorData.paragraphs[editingWordPair.pIdx]?.words[editingWordPair.wIdx]?.keepOrig
                            ? 'Original (Active)'
                            : 'Leave in Original'}
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          handleInsertGap(editingWordPair.pIdx, editingWordPair.wIdx);
                          setEditingWordPair(null);
                        }}
                        className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 rounded-lg text-xs"
                        title="Insert gap '-' and push subsequent translations right"
                      >
                        + Insert Gap
                      </button>
                      <button
                        onClick={() => {
                          handleShiftLeft(editingWordPair.pIdx, editingWordPair.wIdx);
                          setEditingWordPair(null);
                        }}
                        className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 rounded-lg text-xs"
                        title="Pull subsequent translations left"
                      >
                        ← Shift Left
                      </button>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleSaveWordEdit}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingWordPair(null)}
                        className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Paragraphs and Word Pairs List */}
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {editableMirrorData.paragraphs.map((para, pIdx) => (
                  <div key={`para-edit-${pIdx}`} className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800/80 space-y-2">
                    <div className="text-[11px] font-mono text-stone-500 uppercase tracking-wider flex items-center justify-between">
                      <span>Paragraph {pIdx + 1} ({para.words.length} words)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {para.words.map((w, wIdx) => {
                        const isEditing = editingWordPair?.pIdx === pIdx && editingWordPair?.wIdx === wIdx;
                        const isWordKeepOrig = Boolean(
                          w.keepOrig || 
                          (w.cleanOrig && editableMirrorData.untranslatedWords?.includes(w.cleanOrig.toLowerCase()))
                        );
                        const composite = w.composite;

                        return (
                          <div
                            key={`w-${pIdx}-${wIdx}`}
                            onClick={() => setEditingWordPair({ 
                              pIdx, 
                              wIdx, 
                              trans: w.trans,
                              compoundMeaning: composite?.compoundMeaning 
                            })}
                            className={`inline-flex flex-col border rounded-lg px-2 py-1 cursor-pointer transition text-xs relative ${
                              isEditing
                                ? 'bg-amber-900/60 border-amber-400 text-amber-200 ring-2 ring-amber-500/50'
                                : composite
                                ? 'bg-cyan-950/40 border-cyan-700/60 text-cyan-200 hover:border-cyan-400'
                                : isWordKeepOrig
                                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200 hover:border-emerald-500'
                                : 'bg-stone-900/90 border-stone-800 hover:border-amber-500/50 hover:bg-stone-850'
                            }`}
                          >
                            <div className="flex items-center space-x-1">
                              <span className="text-stone-300 font-serif">{w.orig}</span>
                              {composite && (
                                <span className="text-[9px] font-mono px-1 rounded-full bg-cyan-900 text-cyan-300 border border-cyan-600/60 flex items-center space-x-0.5">
                                  <span>⚡{composite.groupIndex || 1}</span>
                                </span>
                              )}
                              {isWordKeepOrig && (
                                <Globe className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                              )}
                            </div>
                            <span className={`text-[11px] font-mono ${
                              composite 
                                ? 'text-cyan-400/90' 
                                : isWordKeepOrig 
                                ? 'text-emerald-400/90' 
                                : 'text-amber-400/90'
                            }`}>
                              {isWordKeepOrig ? '[original]' : (w.trans || '<empty>')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: Separable Verbs & Composite Groups */}
          {activeTab === 'composites' && editableMirrorData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-stone-200">Separable Verb & Composite Groups</span>
                  <p className="text-xs text-stone-400">
                    Discontinuous words that belong together semantically (e.g. <em>zeichnet ... aus</em>).
                  </p>
                </div>
                <button
                  onClick={handleToggleGlobalCompositeMode}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                    editableMirrorData.compositeDisplayMode === 'compound'
                      ? 'bg-cyan-900/60 text-cyan-200 border-cyan-500/60'
                      : 'bg-stone-800 text-stone-300 border-stone-700'
                  }`}
                  title="Toggle global display preference between literal separated glosses and unified compound meanings in Mirror mode"
                >
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    Display: {editableMirrorData.compositeDisplayMode === 'compound' ? 'Compound Meanings' : 'Separated Literal Glosses'}
                  </span>
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {compositeGroups.map((group, idx) => (
                  <div 
                    key={`comp-grp-${group.pIdx}-${group.groupId}`}
                    className="p-4 rounded-2xl bg-stone-950 border border-cyan-900/60 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono text-xs font-bold">
                          Group ⚡{group.groupIndex} (Para {group.pIdx + 1})
                        </span>
                        <span className="text-xs text-stone-400">
                          {group.parts.length} linked words
                        </span>
                      </div>
                      <button
                        onClick={() => handleUnlinkGroup(group.pIdx, group.groupId)}
                        className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-red-950/60 text-stone-400 hover:text-red-300 text-xs border border-stone-800 hover:border-red-800/60 flex items-center space-x-1 transition cursor-pointer"
                        title="Unlink this composite word group into separate independent words"
                      >
                        <Unlink className="w-3 h-3 text-red-400" />
                        <span>Unlink Group</span>
                      </button>
                    </div>

                    {/* Discontinuous Parts Formula */}
                    <div className="bg-stone-900/90 p-3 rounded-xl border border-stone-800 text-xs space-y-2">
                      <div className="flex items-center space-x-2 text-stone-300">
                        <span className="font-serif font-bold text-amber-200">
                          {group.parts.map((p) => p.orig).join(' ... ')}
                        </span>
                        <span className="text-stone-500">→</span>
                        <span className="font-semibold text-cyan-300">
                          "{group.compoundMeaning}"
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-400 flex items-center space-x-3">
                        <span>Literal parts:</span>
                        {group.parts.map((p, pI) => (
                          <span key={pI} className="font-mono text-stone-300 bg-stone-950 px-1.5 py-0.5 rounded border border-stone-800">
                            {p.orig} = "{p.trans}"
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
