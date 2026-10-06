import React from 'react';
import { FileCode, X, MessageSquare, RotateCcw, User as UserIcon, Bot, Send, Check } from 'lucide-react';
import { CalqueHistoryEntry, TranslationChatMessage } from '../../types';
import { TranslationChatInput } from '../TranslationChatInput';

interface CalqueInspectorModalProps {
  inspectingCalque: CalqueHistoryEntry | null;
  onClose: () => void;
  targetLanguage?: string;
  textContent: string;
  inspectorConversation: TranslationChatMessage[];
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  chatInput: string;
  setChatInput: (val: string) => void;
  onSendCalqueChat: () => void;
  isChatStreaming: boolean;
  chatError: string | null;
  onClearConversation: () => void;
  onActivateCalque: (item: CalqueHistoryEntry) => void;
}

export const CalqueInspectorModal: React.FC<CalqueInspectorModalProps> = ({
  inspectingCalque,
  onClose,
  targetLanguage = 'Target Text',
  textContent,
  inspectorConversation,
  chatScrollRef,
  chatInput,
  setChatInput,
  onSendCalqueChat,
  isChatStreaming,
  chatError,
  onClearConversation,
  onActivateCalque,
}) => {
  if (!inspectingCalque) return null;

  return (
    <div className="absolute inset-0 z-50 bg-stone-950/95 backdrop-blur-md p-5 flex flex-col justify-between animate-fade-in">
      <div className="flex items-center justify-between border-b border-stone-800 pb-3">
        <div className="flex items-center space-x-2">
          <FileCode className="w-4 h-4 text-amber-400" />
          <h4 className="font-semibold text-stone-100 text-sm">
            {inspectingCalque.title || 'Calque Snapshot Inspection'}
          </h4>
          {inspectingCalque.blueprintName && (
            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 text-xs font-mono border border-amber-800/60">
              {inspectingCalque.blueprintName}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-stone-800 text-amber-300 text-xs font-mono">
            {inspectingCalque.modelUsed}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3 flex-1 overflow-y-auto text-xs">
        <div className="space-y-1.5 flex flex-col">
          <span className="font-medium text-stone-400">Original Target Text ({targetLanguage}):</span>
          <div className="p-3 bg-stone-900 rounded-xl border border-stone-800 font-serif text-stone-300 leading-relaxed flex-1 overflow-y-auto whitespace-pre-wrap">
            {textContent}
          </div>
        </div>
        <div className="space-y-1.5 flex flex-col">
          <span className="font-medium text-amber-300">Calque Translation Output:</span>
          <div className="p-3 bg-stone-900 rounded-xl border border-amber-500/40 font-mono text-stone-200 leading-relaxed flex-1 overflow-y-auto whitespace-pre-wrap">
            {inspectingCalque.rawCalqueText}
          </div>
        </div>
      </div>

      {/* Post-Translation Multi-Turn LLM Chat Section */}
      <div className="border-t border-stone-800 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-300">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Discuss & Inquire with LLM:</span>
            <span className="text-[10px] text-stone-400 font-normal ml-1">
              (Conversation is automatically saved with this snapshot)
            </span>
          </div>
          {inspectorConversation.length > 0 && (
            <button
              onClick={onClearConversation}
              className="text-[10px] text-stone-400 hover:text-red-400 flex items-center space-x-1"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Clear Chat</span>
            </button>
          )}
        </div>

        {/* Chat Message Bubble History */}
        <div 
          ref={chatScrollRef}
          className="max-h-44 overflow-y-auto p-3 rounded-xl bg-stone-900/90 border border-stone-800 space-y-2.5 text-xs"
        >
          {inspectorConversation.length === 0 ? (
            <p className="text-[11px] text-stone-500 italic text-center py-2">
              Ask questions about this calque, grammatical nuances, alternate word choices, or philological background...
            </p>
          ) : (
            inspectorConversation.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center space-x-1 mb-0.5 text-[10px] text-stone-400">
                  {msg.role === 'user' ? (
                    <>
                      <span>You</span>
                      <UserIcon className="w-2.5 h-2.5 text-stone-400" />
                    </>
                  ) : (
                    <>
                      <Bot className="w-2.5 h-2.5 text-amber-400" />
                      <span className="text-amber-300 font-semibold">AI Assistant</span>
                    </>
                  )}
                </div>
                <div
                  className={`p-2.5 rounded-2xl max-w-[88%] whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-600 text-stone-950 font-medium rounded-tr-xs'
                      : 'bg-stone-950 text-stone-200 border border-stone-800 rounded-tl-xs font-sans'
                  }`}
                >
                  {msg.content || (isChatStreaming ? 'Thinking...' : '')}
                </div>
              </div>
            ))
          )}
          {chatError && (
            <div className="p-2 rounded bg-red-950/60 border border-red-800 text-red-300 text-[11px]">
              {chatError}
            </div>
          )}
        </div>

        {/* Chat Input Box */}
        <div className="pt-1">
          <TranslationChatInput
            id="inspector-chat-input"
            value={chatInput}
            onChange={setChatInput}
            onSend={onSendCalqueChat}
            disabled={isChatStreaming}
            isStreaming={isChatStreaming}
            placeholder="Ask a question about this translation..."
            theme="amber"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-stone-800 pt-3 mt-2">
        <div className="text-xs text-stone-400">
          Created: {new Date(inspectingCalque.createdAt).toLocaleString()}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onActivateCalque(inspectingCalque)}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-semibold text-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Activate This Calque</span>
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
