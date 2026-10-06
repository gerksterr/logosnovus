import React from 'react';
import { 
  Globe, Bookmark, X, Zap, MessageSquare, RotateCcw, 
  User as UserIcon, Bot, AlertCircle, Send 
} from 'lucide-react';
import { MirrorTranslationData, TranslationChatMessage } from '../../types';
import { TranslationChatInput } from '../TranslationChatInput';

interface CalqueAlignmentEditorTabProps {
  editableMirrorData: MirrorTranslationData;
  onSyncGlossesToLanguage: () => void;
  targetLanguage?: string;
  onToggleSnapshot: () => void;
  editingWordPair: { pIdx: number; wIdx: number; trans: string; compoundMeaning?: string } | null;
  setEditingWordPair: (val: { pIdx: number; wIdx: number; trans: string; compoundMeaning?: string } | null) => void;
  onToggleKeepOriginal: (pIdx: number, wIdx: number) => void;
  onInsertGap: (pIdx: number, wIdx: number) => void;
  onShiftLeft: (pIdx: number, wIdx: number) => void;
  onSaveWordEdit: () => void;
  editorConversation: TranslationChatMessage[];
  onClearEditorChat: () => void;
  editorChatScrollRef: React.RefObject<HTMLDivElement | null>;
  isEditorChatStreaming: boolean;
  editorChatError: string | null;
  editorChatInput: string;
  setEditorChatInput: (val: string) => void;
  onSendEditorChat: () => void;
}

export const CalqueAlignmentEditorTab: React.FC<CalqueAlignmentEditorTabProps> = ({
  editableMirrorData,
  onSyncGlossesToLanguage,
  targetLanguage = 'Target Text',
  onToggleSnapshot,
  editingWordPair,
  setEditingWordPair,
  onToggleKeepOriginal,
  onInsertGap,
  onShiftLeft,
  onSaveWordEdit,
  editorConversation,
  onClearEditorChat,
  editorChatScrollRef,
  isEditorChatStreaming,
  editorChatError,
  editorChatInput,
  setEditorChatInput,
  onSendEditorChat,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-stone-200">Word-by-Word Alignment Grid</span>
          <p className="text-xs text-stone-400">
            Click any word to edit its translation, attach separable verb meanings, or align gaps.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onSyncGlossesToLanguage}
            className="px-3 py-1.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-200 border border-emerald-500/60 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
            title={`Sync all customized word glosses to every text with language "${targetLanguage}"`}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-300" />
            <span>Sync Glosses to All {targetLanguage} Texts</span>
          </button>
          <button
            onClick={onToggleSnapshot}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            <span>Save Snapshot</span>
          </button>
        </div>
      </div>

      {/* Editing Word Pair Floating Panel */}
      {editingWordPair && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/60 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-200">
            <span>
              Editing Word: <strong className="font-serif text-sm text-stone-100 font-bold ml-1">
                {editableMirrorData.paragraphs[editingWordPair.pIdx]?.words[editingWordPair.wIdx]?.orig}
              </strong> (Para {editingWordPair.pIdx + 1}, Word {editingWordPair.wIdx + 1})
            </span>
            <button onClick={() => setEditingWordPair(null)} className="text-stone-400 hover:text-stone-200 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-stone-400">Word-for-Word Calque Gloss:</label>
              <input
                type="text"
                value={editingWordPair.trans}
                onChange={(e) => setEditingWordPair({ ...editingWordPair, trans: e.target.value })}
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-1.5 text-xs text-amber-200 font-mono focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                placeholder="e.g. draws, out, of-the"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-cyan-400 flex items-center space-x-1">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>Separable Compound Meaning (Optional):</span>
              </label>
              <input
                type="text"
                value={editingWordPair.compoundMeaning || ''}
                onChange={(e) => setEditingWordPair({ ...editingWordPair, compoundMeaning: e.target.value })}
                className="w-full bg-stone-900 border border-cyan-800/80 rounded-xl px-3 py-1.5 text-xs text-cyan-200 font-mono focus:outline-hidden focus:ring-1 focus:ring-cyan-400"
                placeholder="e.g. distinguishes, gives up"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-500/20">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onToggleKeepOriginal(editingWordPair.pIdx, editingWordPair.wIdx)}
                className="px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 rounded-lg text-xs flex items-center space-x-1 cursor-pointer"
              >
                <Globe className="w-3 h-3 text-emerald-400" />
                <span>Toggle Keep Original</span>
              </button>
              <button
                onClick={() => {
                  onInsertGap(editingWordPair.pIdx, editingWordPair.wIdx);
                  setEditingWordPair(null);
                }}
                className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 rounded-lg text-xs cursor-pointer"
                title="Insert gap '-' and push subsequent translations right"
              >
                + Insert Gap
              </button>
              <button
                onClick={() => {
                  onShiftLeft(editingWordPair.pIdx, editingWordPair.wIdx);
                  setEditingWordPair(null);
                }}
                className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 rounded-lg text-xs cursor-pointer"
                title="Pull subsequent translations left"
              >
                ← Shift Left
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={onSaveWordEdit}
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
        {Array.isArray(editableMirrorData.paragraphs) && editableMirrorData.paragraphs.map((para, pIdx) => {
          if (!para || !Array.isArray(para.words)) return null;
          return (
            <div key={`para-edit-${pIdx}`} className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800/80 space-y-2">
              <div className="text-[11px] font-mono text-stone-500 uppercase tracking-wider flex items-center justify-between">
                <span>Paragraph {pIdx + 1} ({para.words.length} words)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {para.words.map((w, wIdx) => {
                  if (!w) return null;
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
                        trans: w.trans || '',
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
          );
        })}
      </div>

      {/* Post-Translation LLM Conversation at Bottom of Translation */}
      <div className="border-t border-stone-800/80 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-stone-200">
              Discuss Translation with LLM:
            </span>
            <span className="text-[10px] text-stone-400">
              (Conversation is saved and persistent for this translation)
            </span>
          </div>
          {editorConversation.length > 0 && (
            <button
              onClick={onClearEditorChat}
              className="text-[11px] text-stone-400 hover:text-red-400 flex items-center space-x-1 cursor-pointer transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear Chat</span>
            </button>
          )}
        </div>

        {/* Chat History Box */}
        <div
          ref={editorChatScrollRef}
          className="max-h-52 overflow-y-auto p-3.5 rounded-2xl bg-stone-950 border border-stone-800 space-y-3 text-xs"
        >
          {editorConversation.length === 0 ? (
            <div className="text-center py-4 text-stone-500 text-xs">
              <p className="italic">
                Ask questions about this calque, grammatical nuances, alternate word choices, or philological background...
              </p>
            </div>
          ) : (
            editorConversation.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center space-x-1 mb-1 text-[10px] text-stone-400">
                  {msg.role === 'user' ? (
                    <>
                      <span>You</span>
                      <UserIcon className="w-2.5 h-2.5 text-stone-400" />
                    </>
                  ) : (
                    <>
                      <Bot className="w-2.5 h-2.5 text-amber-400" />
                      <span className="text-amber-300 font-semibold">
                        {editableMirrorData.sourceModel || 'LLM Assistant'}
                      </span>
                    </>
                  )}
                </div>
                <div
                  className={`p-3 rounded-2xl max-w-[88%] whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-600 text-stone-950 font-medium rounded-tr-xs'
                      : 'bg-stone-900 text-stone-200 border border-stone-800 rounded-tl-xs'
                  }`}
                >
                  {msg.content || (isEditorChatStreaming ? 'Thinking...' : '')}
                </div>
              </div>
            ))
          )}

          {editorChatError && (
            <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{editorChatError}</span>
            </div>
          )}
        </div>

        {/* Chat Input Field */}
        <div className="pt-1">
          <TranslationChatInput
            id="editor-chat-input"
            value={editorChatInput}
            onChange={setEditorChatInput}
            onSend={onSendEditorChat}
            disabled={isEditorChatStreaming}
            isStreaming={isEditorChatStreaming}
            placeholder="Ask about this translation (e.g. why a specific word or case was translated this way)..."
            theme="amber"
          />
        </div>
      </div>
    </div>
  );
};
