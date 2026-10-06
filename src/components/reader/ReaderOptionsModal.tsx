import React from 'react';
import { SlidersHorizontal, X, Cpu, Check } from 'lucide-react';
import { ReaderSettings, ReaderTheme, MirrorDisplayMode } from '../../types';

export interface ReaderOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  readerSettings: ReaderSettings;
  onUpdateReaderSettings: (settings: ReaderSettings) => void;
  onOpenMirrorModal: () => void;
}

export const ReaderOptionsModal: React.FC<ReaderOptionsModalProps> = ({
  isOpen,
  onClose,
  readerSettings,
  onUpdateReaderSettings,
  onOpenMirrorModal,
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-2xl text-stone-100 space-y-4 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <h3 className="text-base font-serif font-semibold text-amber-100 flex items-center space-x-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <span>Reader Display Options</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Font Size Adjuster */}
        <div className="space-y-1.5 text-xs">
          <label className="text-stone-300 font-medium">Font Size ({readerSettings.fontSize}px)</label>
          <div className="flex items-center space-x-3 bg-stone-950 p-2 rounded-2xl border border-stone-800">
            <button
              onClick={() => onUpdateReaderSettings({ ...readerSettings, fontSize: Math.max(14, readerSettings.fontSize - 2) })}
              className="px-3 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-200 font-bold"
            >
              A-
            </button>
            <input
              type="range"
              min={14}
              max={28}
              step={1}
              value={readerSettings.fontSize}
              onChange={(e) => onUpdateReaderSettings({ ...readerSettings, fontSize: Number(e.target.value) })}
              className="flex-1 accent-amber-600"
            />
            <button
              onClick={() => onUpdateReaderSettings({ ...readerSettings, fontSize: Math.min(28, readerSettings.fontSize + 2) })}
              className="px-3 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-200 font-bold"
            >
              A+
            </button>
          </div>
        </div>

        {/* Mirror Translation Display Mode Selector */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <label className="text-stone-300 font-medium">Text Display Mode</label>
            <button
              onClick={() => {
                onClose();
                onOpenMirrorModal();
              }}
              className="text-[11px] text-amber-400 hover:text-amber-300 underline cursor-pointer flex items-center space-x-1"
            >
              <Cpu className="w-3 h-3" />
              <span>Configure Calque</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 bg-stone-950 p-1.5 rounded-2xl border border-stone-800">
            {[
              { id: 'original', label: 'Original' },
              { id: 'mirror', label: '1:1 Mirror' },
              { id: 'interlinear', label: 'Interlinear' },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => onUpdateReaderSettings({ ...readerSettings, mirrorDisplayMode: mode.id as MirrorDisplayMode })}
                className={`py-1.5 px-2 rounded-xl text-center text-xs font-medium transition cursor-pointer ${
                  (readerSettings.mirrorDisplayMode || 'original') === mode.id
                    ? 'bg-amber-600/40 text-amber-200 border border-amber-500/50 shadow-xs font-bold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-stone-500 px-1">
            Tip: Press <kbd className="px-1 py-0.5 bg-stone-800 text-stone-300 rounded">M</kbd> while reading to toggle between Original and Mirror instantly.
          </p>
        </div>

        {/* Desktop Mirror Floating Bar Toggle */}
        <div className="space-y-1.5 text-xs pt-1 border-t border-stone-800/80">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-stone-300 font-medium">Floating Mirror Bar on Desktop</div>
              <div className="text-[10px] text-stone-500">Show bottom floating quick-flip toolbar on desktop screens</div>
            </div>
            <button
              onClick={() =>
                onUpdateReaderSettings({
                  ...readerSettings,
                  showMirrorOverlayDesktop: readerSettings.showMirrorOverlayDesktop === false ? true : false,
                })
              }
              className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                readerSettings.showMirrorOverlayDesktop !== false ? 'bg-amber-600' : 'bg-stone-800'
              }`}
              id="toggle-desktop-mirror-overlay"
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  readerSettings.showMirrorOverlayDesktop !== false ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Reader Theme Palette Selector */}
        <div className="space-y-1.5 text-xs">
          <label className="text-stone-300 font-medium">Reading Theme</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'parchment', name: 'Parchment', bg: 'bg-[#faf7f2]', text: 'text-stone-900' },
              { id: 'obsidian', name: 'Obsidian', bg: 'bg-stone-950', text: 'text-stone-100' },
              { id: 'sepia', name: 'Warm Sepia', bg: 'bg-[#fbf0d9]', text: 'text-[#432c1c]' },
              { id: 'emerald', name: 'Emerald', bg: 'bg-[#0f231e]', text: 'text-[#d1ece5]' },
              { id: 'mystic', name: 'Mystic Indigo', bg: 'bg-[#151323]', text: 'text-[#e0dbf7]' },
            ].map((th) => (
              <button
                key={th.id}
                onClick={() => onUpdateReaderSettings({ ...readerSettings, theme: th.id as ReaderTheme })}
                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition ${th.bg} ${th.text} ${
                  readerSettings.theme === th.id ? 'ring-2 ring-amber-500 font-bold' : 'border-stone-700/60'
                }`}
              >
                <span>{th.name}</span>
                {readerSettings.theme === th.id && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-stone-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-700 text-amber-50 text-xs font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
