import React, { useState } from 'react';
import { 
  ArrowRightLeft, 
  Sparkles, 
  X, 
  Globe, 
  Minimize2,
  Maximize2,
  Tv,
  HelpCircle,
  Zap
} from 'lucide-react';
import { MirrorDisplayMode, MirrorTranslationData } from '../types';

export interface MobileMirrorOverlayProps {
  mirrorData: MirrorTranslationData | null;
  displayMode: MirrorDisplayMode;
  onSelectMode: (mode: MirrorDisplayMode) => void;
  onOpenMirrorModal: () => void;
  untranslatedCount?: number;
  showOnDesktop?: boolean;
  onToggleDesktopOverlay?: () => void;
  compositeCount?: number;
  compositePreference?: 'separated' | 'compound';
  onToggleCompositePreference?: () => void;
}

export const MobileMirrorOverlay: React.FC<MobileMirrorOverlayProps> = ({
  mirrorData,
  displayMode,
  onSelectMode,
  onOpenMirrorModal,
  untranslatedCount = 0,
  showOnDesktop = true,
  onToggleDesktopOverlay,
  compositeCount = 0,
  compositePreference = 'separated',
  onToggleCompositePreference,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  // On mobile / Android, the bottom navigation bar is fixed at bottom-0 with h-16 (64px) plus safe-area-inset.
  // We place the mirror overlay above the bottom navigation bar with clear margin and z-50 so it is never covered.
  const containerVisibilityClasses = showOnDesktop 
    ? 'fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[94vw] sm:w-auto sm:min-w-[460px] max-w-md animate-in slide-in-from-bottom-3 fade-in duration-200 select-none' 
    : 'fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 sm:hidden w-[94vw] max-w-md animate-in slide-in-from-bottom-3 fade-in duration-200 select-none';

  const minimizedVisibilityClasses = showOnDesktop
    ? 'fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 right-4 sm:right-6 z-50 animate-in fade-in zoom-in-95 duration-200'
    : 'fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 right-4 z-50 sm:hidden animate-in fade-in zoom-in-95 duration-200';

  // If minimized, show a compact floating toggle bubble
  if (isMinimized) {
    return (
      <div className={minimizedVisibilityClasses}>
        <button
          onClick={() => setIsMinimized(false)}
          className="p-3 sm:px-3.5 sm:py-2.5 rounded-full bg-stone-950/90 text-amber-300 border border-amber-500/50 shadow-2xl backdrop-blur-md flex items-center justify-center space-x-2 hover:bg-stone-900 active:scale-95 transition cursor-pointer hover:border-amber-400 group"
          title="Expand Mirror Mode Controls"
          id="btn-mirror-overlay-expand"
        >
          <ArrowRightLeft className="w-4 h-4 text-amber-400 group-hover:rotate-180 transition-transform duration-300" />
          <span className="hidden sm:inline text-xs font-semibold text-amber-200">Mirror Tools</span>
          {compositeCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 text-[10px] font-mono">
              ⚡{compositeCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // If no mirror data is available, offer a generate button
  if (!mirrorData) {
    return (
      <div className={containerVisibilityClasses}>
        <div className="bg-stone-950/95 backdrop-blur-lg border border-amber-500/40 rounded-2xl p-2.5 shadow-2xl text-stone-100 flex items-center justify-between space-x-2">
          <button
            onClick={onOpenMirrorModal}
            className="flex-1 px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 rounded-xl font-semibold text-xs flex items-center justify-center space-x-2 shadow-lg active:scale-98 transition cursor-pointer"
            id="btn-mirror-generate-overlay"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Generate Mirror Translation</span>
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-900 transition cursor-pointer"
            title="Minimize"
            id="btn-mirror-min-empty"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const isMirrored = displayMode === 'mirror';
  const isAlignedOrig = displayMode === 'mirror-normalized-original';

  const handleQuickFlip = () => {
    if (isMirrored) {
      onSelectMode('mirror-normalized-original');
    } else {
      onSelectMode('mirror');
    }
  };

  return (
    <div className={containerVisibilityClasses} id="floating-mirror-overlay">
      <div className="bg-stone-950/95 backdrop-blur-lg border border-amber-500/40 rounded-2xl p-2 shadow-2xl text-stone-100 space-y-2">
        {/* Top Control Bar: Main Flip Button & Quick Action Buttons */}
        <div className="flex items-center justify-between space-x-1.5">
          {/* Primary Instant Flip Button (Mirrored <-> Aligned Orig) */}
          <button
            onClick={handleQuickFlip}
            className={`flex-1 px-3.5 py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition active:scale-95 shadow-md cursor-pointer ${
              isMirrored
                ? 'bg-amber-500 text-stone-950 ring-2 ring-amber-400/50 hover:bg-amber-400'
                : isAlignedOrig
                ? 'bg-amber-700/80 text-amber-100 border border-amber-400/60 ring-2 ring-amber-500/40 hover:bg-amber-700'
                : 'bg-stone-800 text-amber-300 border border-stone-700 hover:bg-stone-750'
            }`}
            id="btn-mirror-instant-flip"
            title="Flip between Calqued English and Aligned Original text (Key: M)"
          >
            <ArrowRightLeft className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {isMirrored ? '⇄ Flip to Aligned Orig' : isAlignedOrig ? '⇄ Flip to Mirrored' : '⇄ Switch to Mirror'}
            </span>
            <kbd className="hidden sm:inline-block text-[10px] px-1 py-0.2 rounded bg-black/30 font-mono text-amber-100 border border-white/10">
              M
            </kbd>
          </button>

          {/* Quick Composite Mode Toggle (if composite groups exist) */}
          {compositeCount > 0 && onToggleCompositePreference && (
            <button
              onClick={onToggleCompositePreference}
              className={`px-2.5 py-2 rounded-xl border text-xs font-medium flex items-center space-x-1 transition cursor-pointer ${
                compositePreference === 'compound'
                  ? 'bg-cyan-900/60 text-cyan-200 border-cyan-500/60'
                  : 'bg-stone-900 text-stone-300 border-stone-800 hover:text-cyan-300'
              }`}
              title={`Switch separated verb display: Currently showing ${compositePreference === 'compound' ? 'Compound Meanings' : 'Separated Literal Glosses'}`}
              id="btn-mirror-overlay-toggle-composite-pref"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline text-[11px]">
                {compositePreference === 'compound' ? 'Compound' : 'Literal'}
              </span>
            </button>
          )}

          {/* Calque Engine Modal Button */}
          <button
            onClick={onOpenMirrorModal}
            className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-amber-400 hover:text-amber-200 hover:bg-stone-850 transition cursor-pointer flex items-center space-x-1"
            title="Mirror Engine / Edit Calques"
            id="btn-mirror-engine-modal"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Minimize Button */}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-850 transition cursor-pointer"
            title="Minimize overlay"
            id="btn-mirror-minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Mode Chips: Orig | Mirrored | Aligned | Interlinear */}
        <div className="flex items-center justify-between gap-1 pt-1 border-t border-stone-800/80 text-[11px] font-medium">
          <button
            onClick={() => onSelectMode('original')}
            className={`flex-1 py-1 px-1 rounded-lg text-center transition cursor-pointer ${
              displayMode === 'original'
                ? 'bg-stone-800 text-amber-300 font-semibold border border-stone-700'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            id="btn-mode-natural-orig"
          >
            Natural
          </button>

          <button
            onClick={() => onSelectMode('mirror')}
            className={`flex-1 py-1 px-1 rounded-lg text-center transition cursor-pointer ${
              displayMode === 'mirror'
                ? 'bg-amber-500/20 text-amber-200 font-semibold border border-amber-500/40'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            id="btn-mode-mirrored"
          >
            Mirrored
          </button>

          <button
            onClick={() => onSelectMode('mirror-normalized-original')}
            className={`flex-1 py-1 px-1 rounded-lg text-center transition cursor-pointer ${
              displayMode === 'mirror-normalized-original'
                ? 'bg-amber-500/20 text-amber-200 font-semibold border border-amber-500/40'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            id="btn-mode-aligned-orig"
          >
            Aligned
          </button>

          <button
            onClick={() => onSelectMode('interlinear')}
            className={`flex-1 py-1 px-1 rounded-lg text-center transition cursor-pointer ${
              displayMode === 'interlinear'
                ? 'bg-stone-800 text-amber-300 font-semibold border border-stone-700'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            id="btn-mode-interlinear"
          >
            Interlinear
          </button>

          {compositeCount > 0 && (
            <div 
              className="px-1.5 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-700/60 text-cyan-300 text-[10px] font-mono flex items-center space-x-1 shrink-0"
              title={`${compositeCount} separable verb / composite groups linked in this text`}
            >
              <Zap className="w-2.5 h-2.5 text-cyan-400" />
              <span>{compositeCount}</span>
            </div>
          )}

          {untranslatedCount > 0 && (
            <div 
              className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px] flex items-center space-x-1 shrink-0"
              title={`${untranslatedCount} words preserved in original language`}
            >
              <Globe className="w-2.5 h-2.5" />
              <span>{untranslatedCount} orig</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
