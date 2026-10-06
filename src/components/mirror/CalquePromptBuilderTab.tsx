import React, { useState } from 'react';
import { Cpu, Plus, Check, Copy, Zap, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { CalquePromptTemplate } from '../../types';
import { WebAssistWorkspace } from '../WebAssistWorkspace';

interface CalquePromptBuilderTabProps {
  selectedPromptId: string;
  setSelectedPromptId: (val: string) => void;
  calquePrompts: CalquePromptTemplate[];
  onOpenCreatePrompt: () => void;
  onCopyPrompt: (promptText?: string) => void;
  copiedPrompt: boolean;
  userInstruction?: string;
  currentPromptPayload?: { systemInstruction?: string; userInstruction?: string; prompt?: string };
  textTitle?: string;
  onApplyWebAssistCalque?: (responseText: string, siteName: string, siteUrl?: string) => void;
}

export const CalquePromptBuilderTab: React.FC<CalquePromptBuilderTabProps> = ({
  selectedPromptId,
  setSelectedPromptId,
  calquePrompts,
  onOpenCreatePrompt,
  onCopyPrompt,
  copiedPrompt,
  userInstruction,
  currentPromptPayload,
  textTitle,
  onApplyWebAssistCalque,
}) => {
  const promptText = currentPromptPayload?.userInstruction ?? userInstruction ?? '';
  const fullPayloadPrompt = currentPromptPayload?.prompt || promptText;
  const [showWebAssist, setShowWebAssist] = useState(true);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <span className="font-medium text-stone-200">Active Prompt Template:</span>
          <select
            value={selectedPromptId}
            onChange={(e) => setSelectedPromptId(e.target.value)}
            className="bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-amber-300 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
          >
            {calquePrompts.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenCreatePrompt}
            className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs border border-stone-700 flex items-center space-x-1 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>New Template</span>
          </button>
          <button
            onClick={() => onCopyPrompt(fullPayloadPrompt)}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium border border-amber-500/40 flex items-center space-x-1.5 transition cursor-pointer"
          >
            {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedPrompt ? 'Copied to Clipboard!' : 'Copy Entire Prompt'}</span>
          </button>
        </div>
      </div>

      {/* Web UI Assist Workflow Direct Integration */}
      {onApplyWebAssistCalque && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowWebAssist(!showWebAssist)}
              className="text-xs font-semibold text-purple-300 hover:text-purple-200 flex items-center space-x-1.5 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-purple-400" />
              <span>Web UI Assist (Claude Pro / Google AI Studio / ChatGPT)</span>
              {showWebAssist ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
            </button>
          </div>

          {showWebAssist && (
            <WebAssistWorkspace
              prompt={fullPayloadPrompt}
              targetText={textTitle || 'Entire Document'}
              blueprintName="Mirror Calque Translation"
              onApplyResponse={(responseText, siteName, siteUrl) => {
                onApplyWebAssistCalque(responseText, siteName, siteUrl);
              }}
            />
          )}
        </div>
      )}

      {/* Raw Prompt Inspector Box */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
          Compiled Prompt Preview
        </span>
        <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 font-mono text-xs text-stone-300 max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed">
          {fullPayloadPrompt}
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-stone-800/40 border border-stone-700/60 text-xs text-stone-400 space-y-1.5">
        <div className="font-semibold text-stone-300 flex items-center space-x-1.5">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>Separable Verbs & Composite Notation Rules:</span>
        </div>
        <p className="leading-relaxed">
          For separable verbs placed apart (e.g. <em>zeichnet ... aus</em>), attach bracket tags to each part:
          <br />
          <code className="text-cyan-300 font-mono bg-stone-950 px-1 py-0.5 rounded">draws[1:distinguishes] ... out[1]</code>
          <br />
          The parser automatically groups them, renders linking badges, and provides both literal separated and compound translations in the reader.
        </p>
      </div>
    </div>
  );
};
