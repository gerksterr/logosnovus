import React from 'react';
import { Check } from 'lucide-react';

interface CalqueImportTabProps {
  pasteText: string;
  setPasteText: (val: string) => void;
  textId?: string;
  defaultSampleTranslations?: Record<string, string>;
  onLoadSample?: () => void;
  onApplyPastedText: () => void;
}

export const CalqueImportTab: React.FC<CalqueImportTabProps> = ({
  pasteText,
  setPasteText,
  textId,
  defaultSampleTranslations,
  onLoadSample,
  onApplyPastedText,
}) => {
  const handleLoadSample = () => {
    if (onLoadSample) {
      onLoadSample();
    } else if (textId && defaultSampleTranslations?.[textId]) {
      setPasteText(defaultSampleTranslations[textId]);
    }
  };

  const hasSample = Boolean(onLoadSample || (textId && defaultSampleTranslations?.[textId]));
  return (
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
        {hasSample ? (
          <button
            onClick={handleLoadSample}
            className="text-xs text-stone-400 hover:text-amber-300 transition underline cursor-pointer"
          >
            Load default sample calque for this text
          </button>
        ) : <div />}
        <button
          onClick={onApplyPastedText}
          disabled={!pasteText.trim()}
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-xs flex items-center space-x-2 transition shadow-md cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>Parse & Apply Calque</span>
        </button>
      </div>
    </div>
  );
};
