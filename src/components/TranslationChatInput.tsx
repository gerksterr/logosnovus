import React, { useEffect, useRef, useState } from 'react';
import { Send, Square, CornerDownLeft } from 'lucide-react';

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return true;
  const uad = (navigator as any).userAgentData;
  if (uad?.platform && /android/i.test(uad.platform)) return true;
  return false;
}

export interface TranslationChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isStreaming?: boolean;
  onHalt?: () => void;
  placeholder?: string;
  disabled?: boolean;
  theme?: 'cyan' | 'amber';
  minHeight?: number;
  maxHeight?: number;
  autoFocus?: boolean;
  id?: string;
}

export const TranslationChatInput: React.FC<TranslationChatInputProps> = ({
  value,
  onChange,
  onSend,
  isStreaming = false,
  onHalt,
  placeholder = 'Ask a follow-up question about this translation...',
  disabled = false,
  theme = 'cyan',
  minHeight = 40,
  maxHeight = 140,
  autoFocus = false,
  id = 'translation-chat-input',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsAndroid(isAndroidDevice());
  }, []);

  // Auto-resize textarea height as content expands or shrinks
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const nextHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${nextHeight}px`;
    }
  }, [value, minHeight, maxHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter') {
      if (isAndroid) {
        // On Android: regular Enter appends newline automatically (do NOT send)
        // Default browser textarea behavior natively inserts \n
        e.stopPropagation();
        return;
      }

      // On Desktop:
      if (e.shiftKey) {
        // Shift+Enter appends newline automatically
        // Default browser textarea behavior natively inserts \n
        e.stopPropagation();
        return;
      }

      // Regular Enter on desktop: send message
      e.preventDefault();
      if (value.trim() && !disabled && !isStreaming) {
        onSend();
      }
    }
  };

  const handleSendClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isStreaming && onHalt) {
      onHalt();
      return;
    }
    if (value.trim() && !disabled && !isStreaming) {
      onSend();
    }
  };

  const isAmber = theme === 'amber';

  return (
    <div className="w-full space-y-1.5">
      <div
        className={`flex items-end space-x-2 p-1.5 rounded-2xl border transition-all ${
          isAmber
            ? 'bg-stone-900 border-stone-800 focus-within:border-amber-500/80 focus-within:ring-1 focus-within:ring-amber-500/40'
            : 'bg-stone-900 border-stone-800 focus-within:border-cyan-500/80 focus-within:ring-1 focus-within:ring-cyan-500/40'
        }`}
      >
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          rows={1}
          autoFocus={autoFocus}
          className="flex-1 min-h-[40px] max-h-[140px] p-2 bg-transparent text-xs text-stone-100 placeholder-stone-500 resize-none focus:outline-hidden disabled:opacity-50 font-sans leading-relaxed overflow-y-auto"
          style={{ height: `${minHeight}px` }}
        />

        <div className="flex items-center shrink-0 mb-1 mr-1">
          {isStreaming ? (
            <button
              type="button"
              onClick={onHalt}
              className="p-2 rounded-xl bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 transition shadow-xs cursor-pointer flex items-center justify-center"
              title="Halt response stream"
              aria-label="Halt response"
            >
              <Square className="w-4 h-4 fill-red-400 text-red-400" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSendClick}
              disabled={!value.trim() || disabled}
              className={`p-2 rounded-xl text-xs font-medium flex items-center justify-center space-x-1.5 transition shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isAmber
                  ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 active:scale-95'
                  : 'bg-cyan-700 hover:bg-cyan-600 text-cyan-50 active:scale-95'
              }`}
              title="Send Message"
              aria-label="Send Message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Keyboard Shortcut & Newline Instruction Hint */}
      <div className="flex items-center justify-between px-1 text-[10px] text-stone-400 select-none">
        <span className="flex items-center space-x-1">
          <CornerDownLeft className="w-3 h-3 text-stone-400 shrink-0" />
          {isAndroid ? (
            <span>
              <kbd className="px-1 py-0.5 rounded bg-stone-800 text-stone-300 font-mono text-[9px] border border-stone-700">Enter</kbd> for newline &bull; tap Send to submit
            </span>
          ) : (
            <span>
              <kbd className="px-1 py-0.5 rounded bg-stone-800 text-stone-300 font-mono text-[9px] border border-stone-700">Shift</kbd>+<kbd className="px-1 py-0.5 rounded bg-stone-800 text-stone-300 font-mono text-[9px] border border-stone-700">Enter</kbd> for newline &bull; <kbd className="px-1 py-0.5 rounded bg-stone-800 text-stone-300 font-mono text-[9px] border border-stone-700">Enter</kbd> to send
            </span>
          )}
        </span>
        {value.trim() && (
          <span className="text-[10px] text-stone-400">
            {value.length} char{value.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
};
