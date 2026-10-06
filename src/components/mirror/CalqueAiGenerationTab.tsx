import React from 'react';
import { 
  Cpu, Layers, Sliders, Code, AlertCircle, Check, 
  Square, Sparkles, History 
} from 'lucide-react';
import { LLMConfig, LLMModelBlueprint, CalquePromptTemplate, MirrorTranslationData } from '../../types';
import { ModelBlueprintSwitcher } from '../ModelBlueprintSwitcher';

interface CalqueAiGenerationTabProps {
  llmConfig: LLMConfig;
  llmModelBlueprints?: LLMModelBlueprint[];
  onSelectModelBlueprint?: (model: LLMModelBlueprint) => void;
  approxTokens: number;
  calquePrompts: CalquePromptTemplate[];
  selectedPromptId: string;
  setSelectedPromptId: (val: string) => void;
  onManageTemplates: () => void;
  showRawJsonEditor: boolean;
  setShowRawJsonEditor: (val: boolean) => void;
  rawJsonCustomPayload: string;
  setRawJsonCustomPayload: (val: string) => void;
  isRawJsonManuallyEdited: boolean;
  setIsRawJsonManuallyEdited: (val: boolean) => void;
  generateDefaultRawJson: () => string;
  rawJsonError: string | null;
  setRawJsonError: (val: string | null) => void;
  onBeautifyRawJson: () => void;
  onResetRawJson: () => void;
  calqueMaxTokens: number | undefined;
  onSelectTokenPreset: (tokenCount: number | undefined) => void;
  isGenerating: boolean;
  onHaltGeneration: () => void;
  onGenerateAI: () => void;
  editableMirrorData: MirrorTranslationData | null;
  calqueHistoryCount: number;
  onViewPastCalques: () => void;
  streamText: string;
  generationError: string | null;
}

export const CalqueAiGenerationTab: React.FC<CalqueAiGenerationTabProps> = ({
  llmConfig,
  llmModelBlueprints,
  onSelectModelBlueprint,
  approxTokens,
  calquePrompts,
  selectedPromptId,
  setSelectedPromptId,
  onManageTemplates,
  showRawJsonEditor,
  setShowRawJsonEditor,
  rawJsonCustomPayload,
  setRawJsonCustomPayload,
  isRawJsonManuallyEdited,
  setIsRawJsonManuallyEdited,
  generateDefaultRawJson,
  rawJsonError,
  setRawJsonError,
  onBeautifyRawJson,
  onResetRawJson,
  calqueMaxTokens,
  onSelectTokenPreset,
  isGenerating,
  onHaltGeneration,
  onGenerateAI,
  editableMirrorData,
  calqueHistoryCount,
  onViewPastCalques,
  streamText,
  generationError,
}) => {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-stone-950/70 border border-stone-800 space-y-4">
        {/* Active LLM Model Blueprint Selector */}
        <div className="p-3.5 rounded-2xl bg-stone-900 border border-stone-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-xs text-stone-200">Active Serving Model Blueprint:</span>
            </div>
            {llmModelBlueprints && llmModelBlueprints.length > 0 && onSelectModelBlueprint ? (
              <ModelBlueprintSwitcher
                llmModelBlueprints={llmModelBlueprints}
                currentConfig={llmConfig}
                onSelectModelBlueprint={onSelectModelBlueprint}
                variant="full"
              />
            ) : (
              <span className="px-2 py-0.5 rounded bg-stone-800 text-amber-300 text-xs font-mono border border-stone-700">
                {llmConfig.provider || 'gemini'} : {llmConfig.modelName || 'gemini-3.7-flash'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400 pt-1.5 border-t border-stone-800/70">
            <div className="flex items-center space-x-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-stone-950 text-cyan-300 border border-stone-800">
                {llmConfig.provider || 'gemini'} / {llmConfig.modelName || 'gemini-3.7-flash'}
              </span>
              {llmConfig.customBaseUrl && (
                <span className="text-stone-500 truncate max-w-[240px]" title={llmConfig.customBaseUrl}>
                  {llmConfig.customBaseUrl}
                </span>
              )}
            </div>
            <span>~{approxTokens} estimated prompt tokens</span>
          </div>
        </div>

        {/* Prompt Template Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <label className="font-medium text-stone-300 flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Calque Prompt Template:</span>
            </label>
            <button
              onClick={onManageTemplates}
              className="text-[11px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
            >
              Manage / Create Templates
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {calquePrompts.map((tmpl) => {
              const isSelected = tmpl.id === selectedPromptId;
              return (
                <div
                  key={tmpl.id}
                  onClick={() => setSelectedPromptId(tmpl.id)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-950/40 border-amber-500/80 text-amber-200 ring-1 ring-amber-500/40'
                      : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-stone-200 truncate">{tmpl.title}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </div>
                  {tmpl.description && (
                    <p className="text-[11px] text-stone-400 mt-1 line-clamp-2 leading-relaxed">
                      {tmpl.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Token Limit & Raw JSON Request Configuration */}
        <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-stone-200">Max Reply Tokens & Raw JSON Request:</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextState = !showRawJsonEditor;
                setShowRawJsonEditor(nextState);
                if (nextState && (!rawJsonCustomPayload || !isRawJsonManuallyEdited)) {
                  setRawJsonCustomPayload(generateDefaultRawJson());
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center space-x-1.5 transition cursor-pointer ${
                showRawJsonEditor
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-stone-800 text-stone-300 border-stone-700 hover:text-white'
              }`}
              id="btn-toggle-raw-json-editor"
            >
              <Code className="w-3.5 h-3.5 text-amber-400" />
              <span>{showRawJsonEditor ? 'Hide Raw JSON Request' : 'Edit Raw JSON Request'}</span>
            </button>
          </div>

          {/* Preset Token Limit Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-stone-400 text-[11px] mr-1">Max Output Tokens:</span>
            {[2048, 4096, 8192, 16384].map((tokenCount) => (
              <button
                key={tokenCount}
                type="button"
                onClick={() => onSelectTokenPreset(tokenCount)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                  calqueMaxTokens === tokenCount
                    ? 'bg-amber-600 text-stone-950 font-bold'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700 border border-stone-700'
                }`}
              >
                {tokenCount.toLocaleString()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onSelectTokenPreset(undefined)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                calqueMaxTokens === undefined
                  ? 'bg-amber-600 text-stone-950 font-bold'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700 border border-stone-700'
              }`}
            >
              Default
            </button>
            <div className="flex items-center space-x-1 ml-auto">
              <span className="text-[10px] text-stone-500">Custom:</span>
              <input
                type="number"
                min="128"
                max="131072"
                step="256"
                placeholder="e.g. 3000"
                value={calqueMaxTokens ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  onSelectTokenPreset(val);
                }}
                className="w-20 bg-stone-950 border border-stone-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-amber-300 focus:outline-hidden focus:border-amber-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-stone-400">
            Limits completion tokens so providers (e.g. OpenRouter) don't reserve excessive funds for 2<sup>16</sup> (65,536) tokens.
          </p>

          {/* Raw JSON Editor Panel */}
          {showRawJsonEditor && (
            <div className="pt-2 space-y-2 border-t border-stone-800/80">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-stone-300 font-mono text-[11px]">Raw JSON Payload</span>
                  {rawJsonError ? (
                    <span className="text-[10px] text-red-400 font-medium flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 text-red-400" />
                      <span>JSON Syntax Error</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center space-x-1">
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Valid JSON</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={onBeautifyRawJson}
                    className="text-[11px] text-stone-400 hover:text-amber-300 underline cursor-pointer"
                  >
                    Format JSON
                  </button>
                  <button
                    type="button"
                    onClick={onResetRawJson}
                    className="text-[11px] text-stone-400 hover:text-amber-300 underline cursor-pointer"
                  >
                    Reset to Auto Template
                  </button>
                </div>
              </div>

              <textarea
                rows={9}
                value={rawJsonCustomPayload}
                onChange={(e) => {
                  setRawJsonCustomPayload(e.target.value);
                  setIsRawJsonManuallyEdited(true);
                  try {
                    JSON.parse(e.target.value);
                    setRawJsonError(null);
                  } catch (err: any) {
                    setRawJsonError(err.message);
                  }
                }}
                className={`w-full p-3 rounded-xl bg-stone-950 font-mono text-xs text-amber-200 border leading-relaxed focus:outline-hidden ${
                  rawJsonError ? 'border-red-500/80 focus:border-red-400' : 'border-stone-800 focus:border-amber-500'
                }`}
                placeholder="Enter or edit raw JSON request payload..."
                id="textarea-raw-json-calque"
              />
              {rawJsonError && (
                <p className="text-[11px] text-red-400 font-mono">{rawJsonError}</p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-stone-400 leading-relaxed">
          Generates an aligned 1:1 etymological calque. Separable composite verbs placed apart use bracketed notation <code className="text-amber-300 font-mono text-[11px] bg-stone-900 px-1 py-0.5 rounded">[1:distinguishes]</code> to automatically link discontinuous parts.
        </p>

        <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            {isGenerating ? (
              <button
                type="button"
                onClick={onHaltGeneration}
                className="px-4 py-2 rounded-xl bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 font-semibold text-xs flex items-center space-x-2 transition shadow-md cursor-pointer animate-pulse"
                id="btn-halt-ai-calque"
              >
                <Square className="w-3.5 h-3.5 fill-red-400 text-red-400" />
                <span>Halt Calque Request</span>
              </button>
            ) : (
              <button
                onClick={onGenerateAI}
                disabled={isGenerating}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-xs flex items-center space-x-2 transition shadow-md cursor-pointer"
                id="btn-trigger-ai-calque"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate Mirror Translation</span>
              </button>
            )}

            {editableMirrorData && !isGenerating && (
              <span className="text-xs text-emerald-400 flex items-center space-x-1 font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Active ({editableMirrorData.sourceModel || 'Custom'})</span>
              </span>
            )}
          </div>

          {calqueHistoryCount > 0 && (
            <button
              onClick={onViewPastCalques}
              className="text-xs text-stone-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer transition"
            >
              <History className="w-3.5 h-3.5" />
              <span>View Past Received Calques ({calqueHistoryCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Streaming Output Box */}
      {(isGenerating || streamText) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <div className="flex items-center space-x-2">
              <span>Live AI Generation Stream:</span>
              {isGenerating && <span className="text-amber-400 animate-pulse font-mono">Streaming chunks...</span>}
            </div>
            {isGenerating && (
              <button
                type="button"
                onClick={onHaltGeneration}
                className="px-2.5 py-1 rounded-lg bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 text-[11px] font-medium flex items-center space-x-1.5 cursor-pointer transition shadow-xs"
                id="btn-stream-halt-control"
              >
                <Square className="w-3 h-3 fill-red-400 text-red-400" />
                <span>Halt Stream</span>
              </button>
            )}
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
  );
};
