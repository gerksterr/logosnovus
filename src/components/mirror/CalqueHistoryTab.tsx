import React from 'react';
import { 
  History, Cpu, Bookmark, Trash2, Plus, X, Search, CheckCircle2, 
  Clock, Zap, MessageSquare, ChevronUp, ChevronDown, Copy, Check, 
  Eye, Edit3, Sparkles 
} from 'lucide-react';
import { CalqueHistoryEntry, CalquePromptTemplate, MirrorTranslationData } from '../../types';

interface CalqueHistoryTabProps {
  historySubTab: 'calques' | 'prompts';
  setHistorySubTab: (tab: 'calques' | 'prompts') => void;
  editableMirrorData: MirrorTranslationData | null;
  isTakingSnapshot: boolean;
  setIsTakingSnapshot: (val: boolean) => void;
  snapshotTitle: string;
  setSnapshotTitle: (val: string) => void;
  snapshotNote: string;
  setSnapshotNote: (val: string) => void;
  onSaveCurrentSnapshot: () => void;
  calqueHistory: CalqueHistoryEntry[];
  filteredCalqueHistory: CalqueHistoryEntry[];
  onClearAllCalqueHistory: () => void;
  onOpenCreatePrompt: () => void;
  searchHistoryTerm: string;
  setSearchHistoryTerm: (val: string) => void;
  expandedPromptHistoryIds: Record<string, boolean>;
  setExpandedPromptHistoryIds: (val: Record<string, boolean>) => void;
  onActivateHistoryCalque: (item: CalqueHistoryEntry) => void;
  onInspectCalque: (item: CalqueHistoryEntry) => void;
  onCopyCalqueText: (id: string, text: string) => void;
  copiedCalqueId: string | null;
  onDeleteHistoryEntry: (id: string, e: React.MouseEvent) => void;
  onCopyPrompt: (promptText?: string) => void;
  calquePrompts: CalquePromptTemplate[];
  onOpenEditPrompt: (p: CalquePromptTemplate) => void;
  onDeletePromptTemplate: (id: string, e: React.MouseEvent) => void;
  onSelectPromptForAI: (p: CalquePromptTemplate) => void;
}

export const CalqueHistoryTab: React.FC<CalqueHistoryTabProps> = ({
  historySubTab,
  setHistorySubTab,
  editableMirrorData,
  isTakingSnapshot,
  setIsTakingSnapshot,
  snapshotTitle,
  setSnapshotTitle,
  snapshotNote,
  setSnapshotNote,
  onSaveCurrentSnapshot,
  calqueHistory,
  filteredCalqueHistory,
  onClearAllCalqueHistory,
  onOpenCreatePrompt,
  searchHistoryTerm,
  setSearchHistoryTerm,
  expandedPromptHistoryIds,
  setExpandedPromptHistoryIds,
  onActivateHistoryCalque,
  onInspectCalque,
  onCopyCalqueText,
  copiedCalqueId,
  onDeleteHistoryEntry,
  onCopyPrompt,
  calquePrompts,
  onOpenEditPrompt,
  onDeletePromptTemplate,
  onSelectPromptForAI,
}) => {
  return (
    <div className="space-y-4">
      {/* Subtabs for Calques History vs Prompts History */}
      <div className="flex items-center justify-between border-b border-stone-800 pb-3">
        <div className="flex items-center space-x-2 bg-stone-950 p-1 rounded-xl border border-stone-800">
          <button
            onClick={() => setHistorySubTab('calques')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
              historySubTab === 'calques'
                ? 'bg-amber-600 text-stone-950 shadow-xs'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Received Calques ({calqueHistory.length})</span>
          </button>
          <button
            onClick={() => setHistorySubTab('prompts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
              historySubTab === 'prompts'
                ? 'bg-amber-600 text-stone-950 shadow-xs'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Calque Prompts ({calquePrompts.length})</span>
          </button>
        </div>

        {historySubTab === 'calques' && (
          <div className="flex items-center space-x-2">
            {editableMirrorData && (
              <button
                onClick={() => setIsTakingSnapshot(!isTakingSnapshot)}
                className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs border border-stone-700 flex items-center space-x-1.5 transition cursor-pointer"
                title="Snapshot current aligned working state into history"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Snapshot Current State</span>
              </button>
            )}
            {calqueHistory.length > 0 && (
              <button
                onClick={onClearAllCalqueHistory}
                className="px-2.5 py-1.5 rounded-lg bg-stone-900 hover:bg-red-950 text-stone-400 hover:text-red-300 text-xs border border-stone-800 hover:border-red-800 transition cursor-pointer flex items-center space-x-1"
                title="Clear history for this text"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        )}

        {historySubTab === 'prompts' && (
          <button
            onClick={onOpenCreatePrompt}
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Custom Prompt Template</span>
          </button>
        )}
      </div>

      {/* Snapshot Creation Form */}
      {isTakingSnapshot && (
        <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-200">
            <span>Save Current Calque Snapshot to History:</span>
            <button onClick={() => setIsTakingSnapshot(false)} className="text-stone-400 hover:text-stone-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <input
              type="text"
              placeholder="Snapshot Title (e.g. Fine-Tuned German Compounds)"
              value={snapshotTitle}
              onChange={(e) => setSnapshotTitle(e.target.value)}
              className="bg-stone-900 border border-stone-700 rounded-lg p-2 text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
            />
            <input
              type="text"
              placeholder="Optional notes or context..."
              value={snapshotNote}
              onChange={(e) => setSnapshotNote(e.target.value)}
              className="bg-stone-900 border border-stone-700 rounded-lg p-2 text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <button
              onClick={() => setIsTakingSnapshot(false)}
              className="px-2.5 py-1 rounded-lg bg-stone-800 text-stone-300 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={onSaveCurrentSnapshot}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs cursor-pointer"
            >
              Save Snapshot
            </button>
          </div>
        </div>
      )}

      {/* SUBTAB 1: CALQUES HISTORY LIST */}
      {historySubTab === 'calques' && (
        <div className="space-y-3">
          {/* Search / Filter Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              value={searchHistoryTerm}
              onChange={(e) => setSearchHistoryTerm(e.target.value)}
              placeholder="Search calque history by blueprint, model, keyword, or note..."
              className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-4 py-2 text-xs text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {filteredCalqueHistory.length === 0 ? (
            <div className="p-8 text-center bg-stone-950/50 rounded-2xl border border-stone-800/80 space-y-2">
              <History className="w-8 h-8 text-stone-600 mx-auto" />
              <p className="text-stone-400 font-medium">No calque history entries found.</p>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Generate calques using AI, import them, or snapshot your alignment edits to build a version history.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {filteredCalqueHistory.map((item) => {
                const isExpandedPrompt = Boolean(expandedPromptHistoryIds[item.id]);
                const isActiveInReader = Boolean(
                  editableMirrorData && 
                  (editableMirrorData.historyEntryId === item.id || 
                   editableMirrorData.rawCalqueText === item.rawCalqueText)
                );

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition flex flex-col space-y-3 ${
                      isActiveInReader
                        ? 'bg-amber-950/25 border-amber-500/70 shadow-lg shadow-amber-950/30'
                        : 'bg-stone-950 border-stone-800 hover:border-stone-700'
                    }`}
                  >
                    {/* Card Top Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-stone-200 text-sm font-serif">
                          {item.title || 'Calque Snapshot'}
                        </span>
                        {item.blueprintName && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 text-[10px] font-mono border border-amber-700/60">
                            {item.blueprintName}
                          </span>
                        )}
                        {isActiveInReader && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-700/60 flex items-center space-x-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Active in Reader</span>
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-stone-900 text-stone-400 text-[10px] font-mono border border-stone-800">
                          {item.modelUsed || item.source}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-xs text-stone-500">
                        <Clock className="w-3 h-3 text-stone-500" />
                        <span>{new Date(item.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    </div>

                    {/* Meta & Stats Row */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                      {item.wordCount !== undefined && (
                        <span className="bg-stone-900 px-2 py-0.5 rounded text-stone-300 font-mono">
                          {item.wordCount} words
                        </span>
                      )}
                      {item.compositeCount !== undefined && item.compositeCount > 0 && (
                        <span className="bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded font-mono border border-cyan-800/60 flex items-center space-x-1">
                          <Zap className="w-2.5 h-2.5 text-cyan-400" />
                          <span>{item.compositeCount} separable verbs</span>
                        </span>
                      )}
                      {item.conversation && item.conversation.length > 0 && (
                        <span className="bg-purple-950/80 text-purple-300 px-2 py-0.5 rounded font-mono border border-purple-800/60 flex items-center space-x-1">
                          <MessageSquare className="w-2.5 h-2.5 text-purple-400" />
                          <span>{item.conversation.length} chat messages</span>
                        </span>
                      )}
                      {item.notes && (
                        <span className="italic text-stone-400 truncate max-w-xs">
                          "{item.notes}"
                        </span>
                      )}
                    </div>

                    {/* Calque Text Preview Snippet */}
                    <div className="p-3 rounded-xl bg-stone-900/80 border border-stone-800 font-serif text-xs text-stone-300 leading-relaxed max-h-24 overflow-y-auto line-clamp-3">
                      {item.rawCalqueText}
                    </div>

                    {/* Collapsible Prompt Used Box */}
                    {item.promptUsed && (
                      <div className="text-xs space-y-1.5">
                        <button
                          onClick={() => setExpandedPromptHistoryIds({
                            ...expandedPromptHistoryIds,
                            [item.id]: !isExpandedPrompt,
                          })}
                          className="text-stone-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer transition"
                        >
                          {isExpandedPrompt ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span>{isExpandedPrompt ? 'Hide Prompt Used' : 'View Calque Prompt Used'}</span>
                        </button>
                        {isExpandedPrompt && (
                          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 font-mono text-[11px] text-stone-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto space-y-2 animate-in fade-in">
                            <div>{item.promptUsed}</div>
                            <div className="flex items-center justify-end space-x-2 pt-1 border-t border-stone-800/80">
                              <button
                                onClick={() => onCopyPrompt(item.promptUsed)}
                                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 text-[10px] flex items-center space-x-1"
                              >
                                <Copy className="w-2.5 h-2.5" />
                                <span>Copy Prompt</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Card Bottom Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-800/80">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onActivateHistoryCalque(item)}
                          className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center space-x-1.5 transition cursor-pointer shadow-xs ${
                            isActiveInReader
                              ? 'bg-emerald-800/80 text-emerald-100 border border-emerald-500/60'
                              : 'bg-amber-600 hover:bg-amber-500 text-stone-950'
                          }`}
                          id={`btn-activate-calque-${item.id}`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isActiveInReader ? 'Currently Active' : 'Activate in Reader'}</span>
                        </button>

                        <button
                          onClick={() => onInspectCalque(item)}
                          className="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs flex items-center space-x-1 transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>Inspect & Chat</span>
                        </button>

                        <button
                          onClick={() => onCopyCalqueText(item.id, item.rawCalqueText)}
                          className="px-2.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs border border-stone-800 flex items-center space-x-1 transition cursor-pointer"
                        >
                          {copiedCalqueId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedCalqueId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <button
                        onClick={(e) => onDeleteHistoryEntry(item.id, e)}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-red-400 hover:bg-stone-900 transition cursor-pointer"
                        title="Delete this entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: PROMPTS TEMPLATES CRUD LIST */}
      {historySubTab === 'prompts' && (
        <div className="space-y-3">
          {calquePrompts.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-2xl bg-stone-950 border border-stone-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-stone-200 text-sm">{p.title}</span>
                  {p.isCustom ? (
                    <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 text-[10px] font-mono border border-purple-800/60">
                      Custom Template
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-stone-900 text-stone-400 text-[10px] font-mono">
                      Built-in Template
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {p.isCustom && (
                    <>
                      <button
                        onClick={() => onOpenEditPrompt(p)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-amber-300 hover:bg-stone-900 cursor-pointer"
                        title="Edit template"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => onDeletePromptTemplate(p.id, e)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-400 hover:bg-stone-900 cursor-pointer"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {p.description && (
                <p className="text-xs text-stone-400">{p.description}</p>
              )}

              <div className="p-3 bg-stone-900 rounded-xl font-mono text-[11px] text-stone-300 max-h-28 overflow-y-auto whitespace-pre-wrap">
                {p.prompt}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => onSelectPromptForAI(p)}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Use in AI Generator</span>
                </button>
                <button
                  onClick={() => onCopyPrompt(p.prompt)}
                  className="text-xs text-stone-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy Prompt Text</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
