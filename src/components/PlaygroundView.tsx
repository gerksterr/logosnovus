import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  Sparkles, 
  Trash2,
  BookmarkPlus
} from 'lucide-react';
import { QueryBlueprint, LLMConfig, Annotation } from '../types';
import { 
  isRTLText, 
  cleanWordToken, 
  normalizeForMatch,
  stripFormattingTags,
  parseParagraph,
  FormattedRun,
  cleanCopiedReaderText,
  splitTextIntoParagraphs,
  findPassageMatchesInParagraph
} from '../utils/textUtils';
import { PassageHighlightOverlay, PassageBoxInfo } from './PassageHighlightOverlay';

interface PlaygroundParagraphItemProps {
  rawPara: string;
  pIdx: number;
  translatedPassages: string[];
  translatedWordsSet: Set<string>;
  selectedWord: string | null;
  selectedPassage: string | null;
  hoveredPassageKey: string | null;
  setHoveredPassageKey: React.Dispatch<React.SetStateAction<string | null>>;
  handleWordClick: (word: string) => void;
  handlePassageClick: (passage: string) => void;
}

const PlaygroundParagraphItem: React.FC<PlaygroundParagraphItemProps> = ({
  rawPara,
  pIdx,
  translatedPassages,
  translatedWordsSet,
  selectedWord,
  selectedPassage,
  hoveredPassageKey,
  setHoveredPassageKey,
  handleWordClick,
  handlePassageClick,
}) => {
  const paraRef = useRef<HTMLParagraphElement>(null);
  const parsed = parseParagraph(rawPara, pIdx);
  const isParaRtl = isRTLText(parsed.plainText);

  const paraMatches = findPassageMatchesInParagraph(parsed, translatedPassages);

  const passageBoxInfos: PassageBoxInfo[] = [];

  const getTopLevelMatches = (
    matches: { start: number; end: number; target: string }[],
    rangeStart: number,
    rangeEnd: number
  ) => {
    const inRange = matches.filter((m) => m.start >= rangeStart && m.end <= rangeEnd);
    if (inRange.length === 0) return [];

    inRange.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const topLevel: { start: number; end: number; target: string }[] = [];
    let lastEnd = rangeStart;

    for (const m of inRange) {
      if (m.start >= lastEnd) {
        topLevel.push(m);
        lastEnd = m.end;
      }
    }

    return topLevel;
  };

  const renderRuns = (runs: FormattedRun[], keyPrefix: string) => {
    return runs.map((run, rIdx) => {
      const colorStyle = run.color === 'red' ? '#f87171' : run.color === 'blue' ? '#60a5fa' : undefined;

      if (run.hang && run.hang > 0) {
        const hangRows = run.hang;
        const fontSizeEm = (hangRows * 1.8 * 0.60).toFixed(2);

        return (
          <span
            key={`${keyPrefix}-run-${rIdx}`}
            className="drop-cap-initial select-text"
            style={{
              float: isParaRtl ? 'right' : 'left',
              fontSize: `${fontSizeEm}em`,
              lineHeight: 0.82,
              marginRight: isParaRtl ? '0' : '0.14em',
              marginLeft: isParaRtl ? '0.14em' : '0',
              marginTop: '0.04em',
              marginBottom: '0',
              padding: '0 0.04em',
              fontWeight: 700,
              fontFamily: 'serif',
              display: 'block',
              color: colorStyle,
              unicodeBidi: 'isolate',
              initialLetter: `${hangRows}`,
              WebkitInitialLetter: `${hangRows}`,
            } as React.CSSProperties}
          >
            {run.text}
          </span>
        );
      }

      if (colorStyle) {
        return (
          <span
            key={`${keyPrefix}-run-${rIdx}`}
            style={{ color: colorStyle, fontWeight: 500 }}
          >
            {run.text}
          </span>
        );
      }

      return <React.Fragment key={`${keyPrefix}-run-${rIdx}`}>{run.text}</React.Fragment>;
    });
  };

  const renderTokenSlice = (startTokenIdx: number, endTokenIdx: number, keyPrefix: string) => {
    return parsed.tokens.slice(startTokenIdx, endTokenIdx).map((token, tRelIdx) => {
      const tIdx = startTokenIdx + tRelIdx;
      if (token.type === 'whitespace') return <span key={`${keyPrefix}-ws-${tIdx}`}>{token.text}</span>;

      const cleanWord = token.cleanWord;
      const isSelected = selectedWord && cleanWord.toLowerCase() === selectedWord.toLowerCase();
      const isWordTranslated = translatedWordsSet.has(cleanWord.toLowerCase());

      if (!cleanWord) {
        return (
          <span key={`${keyPrefix}-w-${tIdx}`} className="inline">
            {renderRuns(token.runs, `${keyPrefix}-w-${tIdx}`)}
          </span>
        );
      }

      const selectedHighlightClasses = 'bg-amber-400 text-stone-950 ring-1 ring-inset ring-amber-500 rounded px-1 py-0.5';
      const translatedClasses = 'text-stone-200 border-b border-stone-400/70 hover:border-amber-400 hover:text-amber-200 hover:bg-stone-800/30 px-0.5 py-0.5';
      const defaultWordClasses = 'text-stone-300 rounded px-0.5 py-0.5 hover:bg-amber-500/20 hover:text-amber-200';

      return (
        <span
          key={`${keyPrefix}-w-${tIdx}`}
          onClick={(e) => {
            e.stopPropagation();
            handleWordClick(cleanWord);
          }}
          className={`cursor-pointer relative z-10 transition-colors duration-150 inline ${
            isSelected
              ? selectedHighlightClasses
              : isWordTranslated
              ? translatedClasses
              : defaultWordClasses
          }`}
        >
          {renderRuns(token.runs, `${keyPrefix}-w-${tIdx}`)}
        </span>
      );
    });
  };

  const renderRangeWithMatches = (
    rangeStart: number,
    rangeEnd: number,
    candidateMatches: { start: number; end: number; target: string }[],
    depth = 0
  ): React.ReactNode => {
    const topMatches = getTopLevelMatches(candidateMatches, rangeStart, rangeEnd);

    if (topMatches.length === 0) {
      return renderTokenSlice(rangeStart, rangeEnd, `play-p${pIdx}-${rangeStart}-${rangeEnd}`);
    }

    const nodes: React.ReactNode[] = [];
    let curr = rangeStart;

    topMatches.forEach((match, mIdx) => {
      if (match.start > curr) {
        nodes.push(
          <React.Fragment key={`before-play-${pIdx}-${curr}-${match.start}`}>
            {renderTokenSlice(curr, match.start, `play-p${pIdx}-${curr}-${match.start}`)}
          </React.Fragment>
        );
      }

      const subMatches = candidateMatches.filter(
        (m) =>
          m.start >= match.start &&
          m.end <= match.end &&
          !(m.start === match.start && m.end === match.end)
      );

      const isNested = depth > 0;
      const passageKey = `passage-play-${pIdx}-${match.start}-${match.end}-${depth}-${mIdx}`;
      const isPassageSelected = Boolean(
        selectedPassage &&
        (selectedPassage.trim().toLowerCase() === match.target.trim().toLowerCase() ||
          normalizeForMatch(selectedPassage) === normalizeForMatch(match.target))
      );
      const isHovered = hoveredPassageKey === passageKey;

      passageBoxInfos.push({
        key: passageKey,
        target: match.target,
        isNested,
        isSelected: isPassageSelected,
        isHovered,
      });

      nodes.push(
        <span
          key={passageKey}
          data-passage-key={passageKey}
          onMouseOver={(e) => {
            e.stopPropagation();
            setHoveredPassageKey(passageKey);
          }}
          onMouseLeave={(e) => {
            e.stopPropagation();
            setHoveredPassageKey((curr) => (curr === passageKey ? null : curr));
          }}
          onClick={(e) => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
              return;
            }
            const targetEl = e.target as HTMLElement;
            if (targetEl && (targetEl.closest('[data-word-idx]') || targetEl.closest('[id^="play-w-"]'))) {
              return;
            }
            e.stopPropagation();
            handlePassageClick(match.target);
          }}
          className="inline select-text cursor-pointer"
        >
          {renderRangeWithMatches(match.start, match.end, subMatches, depth + 1)}
        </span>
      );

      curr = match.end;
    });

    if (curr < rangeEnd) {
      nodes.push(
        <React.Fragment key={`after-play-${pIdx}-${curr}-${rangeEnd}`}>
          {renderTokenSlice(curr, rangeEnd, `play-p${pIdx}-${curr}-${rangeEnd}`)}
        </React.Fragment>
      );
    }

    return nodes;
  };

  const renderedContent = renderRangeWithMatches(0, parsed.tokens.length, paraMatches, 0);

  return (
    <p
      ref={paraRef}
      dir={isParaRtl ? 'rtl' : 'ltr'}
      className={`relative mb-4 leading-relaxed font-serif text-stone-200 text-sm sm:text-base clear-both ${
        isParaRtl ? 'text-right' : 'text-left'
      }`}
    >
      <PassageHighlightOverlay
        containerRef={paraRef}
        passages={passageBoxInfos}
        isDarkTheme={true}
        themeAccent="purple"
        onPassageHover={setHoveredPassageKey}
        onPassageClick={(target) => handlePassageClick(target)}
        dependencies={[hoveredPassageKey, selectedPassage, passageBoxInfos.length]}
      />
      <span className="relative z-10">{renderedContent}</span>
    </p>
  );
};

interface PlaygroundViewProps {
  blueprints: QueryBlueprint[];
  llmConfig: LLMConfig;
  annotations?: Annotation[];
  onRunDecipherQuery: (type: 'word' | 'passage', text: string, blueprintId: string) => void;
  onSaveAsTextItem?: (title: string, content: string) => void;
}

const SAMPLE_SNIPPETS = [
  {
    label: 'Formatted: Drop Cap & Colors (German)',
    text: '[hang:3][Red]D[/Red][/hang]iesen Text kannst du erforschen. [Blue]Hier ist ein blau gefärbter Satz zum Analysieren.[/Blue] Und [Red]dieses Wort[/Red] ist rot.',
    type: 'passage' as const,
  },
  {
    label: 'Hebrew: Bereshit (Genesis 1:1)',
    text: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃ וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ',
    type: 'passage' as const,
  },
  {
    label: 'Carl Jung (German)',
    text: 'Schatten, Anima und Individuation sind zentrale Begriffe in der analytischen Psychologie.',
    type: 'passage' as const,
  },
  {
    label: 'Alchemical Latin',
    text: 'Quod est inferius est sicut quod est superius, et quod est superius est sicut quod est inferius.',
    type: 'passage' as const,
  },
  {
    label: 'Word: בְּרֵאשִׁית',
    text: 'בְּרֵאשִׁית',
    type: 'word' as const,
  },
  {
    label: 'Word: Katabasis',
    text: 'Katabasis',
    type: 'word' as const,
  },
];

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({
  blueprints,
  llmConfig,
  annotations = [],
  onRunDecipherQuery,
  onSaveAsTextItem,
}) => {
  const [inputText, setInputText] = useState('');
  const [activeWordBpId, setActiveWordBpId] = useState<string>('');
  const [activePassageBpId, setActivePassageBpId] = useState<string>('');
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedPassage, setSelectedPassage] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [hoveredPassageKey, setHoveredPassageKey] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-detect text selection change without scrolling
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectedText('');
        return;
      }
      const rawSelected = selection.toString().trim();
      if (rawSelected.length > 3) {
        if (contentRef.current && contentRef.current.contains(selection.anchorNode)) {
          setSelectedText(rawSelected);
          return;
        }
      }
      setSelectedText('');
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const wordBlueprints = blueprints.filter((b) => b.type === 'word');
  const passageBlueprints = blueprints.filter((b) => b.type === 'passage');

  const currentWordBp = blueprints.find((b) => b.id === activeWordBpId) || wordBlueprints[0];
  const currentPassageBp = blueprints.find((b) => b.id === activePassageBpId) || passageBlueprints[0];

  const translatedWordsSet = new Set(
    annotations
      .filter((a) => a.type === 'word')
      .map((a) => a.target.trim().toLowerCase())
  );

  const translatedPassages = annotations
    .filter((a) => a.type === 'passage')
    .map((a) => a.target.trim());

  // Helper to find all occurrences of translated passages in paragraph
  const findPassageMatches = (paraText: string, passages: string[]) => {
    if (!paraText || passages.length === 0) return [];
    const lowerPara = paraText.toLowerCase();
    const allMatches: { start: number; end: number; target: string }[] = [];

    passages.forEach((pTarget) => {
      const cleanP = pTarget.trim();
      if (!cleanP || cleanP.length < 2) return;
      const lowerP = cleanP.toLowerCase();

      let pos = 0;
      while ((pos = lowerPara.indexOf(lowerP, pos)) !== -1) {
        allMatches.push({
          start: pos,
          end: pos + cleanP.length,
          target: cleanP,
        });
        pos += 1;
      }
    });

    return allMatches;
  };

  const getTopLevelMatches = (
    matches: { start: number; end: number; target: string }[],
    rangeStart: number,
    rangeEnd: number
  ) => {
    const inRange = matches.filter((m) => m.start >= rangeStart && m.end <= rangeEnd);
    if (inRange.length === 0) return [];

    inRange.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const topLevel: { start: number; end: number; target: string }[] = [];
    let lastEnd = rangeStart;

    for (const m of inRange) {
      if (m.start >= lastEnd) {
        topLevel.push(m);
        lastEnd = m.end;
      }
    }

    return topLevel;
  };

  const handleWordClick = (word: string) => {
    setSelectedWord(word);
    setSelectedPassage(null);
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
    onRunDecipherQuery('word', word, currentWordBp?.id || wordBlueprints[0]?.id || '');
  };

  const handlePassageClick = (passage: string) => {
    setSelectedPassage(passage);
    setSelectedWord(null);
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
    onRunDecipherQuery('passage', passage, currentPassageBp?.id || passageBlueprints[0]?.id || '');
  };

  const handleMouseUpOrTouchEnd = () => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        const rawSelected = selection.toString().trim();
        if (rawSelected.length > 1 && contentRef.current && contentRef.current.contains(selection.anchorNode)) {
          const cleaned = cleanCopiedReaderText(rawSelected);
          setSelectedText(cleaned.trim());
          return;
        }
      }
      setSelectedText('');
    }, 10);
  };

  const handleDecipherPassageClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedText) {
      const sanitized = cleanCopiedReaderText(selectedText).trim();
      onRunDecipherQuery('passage', sanitized, currentPassageBp?.id || passageBlueprints[0]?.id || '');
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    }
  };

  const renderParagraphs = () => {
    if (!inputText.trim()) return null;
    const rawParagraphs = splitTextIntoParagraphs(inputText);

    return rawParagraphs.map((rawPara, pIdx) => (
      <PlaygroundParagraphItem
        key={pIdx}
        rawPara={rawPara}
        pIdx={pIdx}
        translatedPassages={translatedPassages}
        translatedWordsSet={translatedWordsSet}
        selectedWord={selectedWord}
        selectedPassage={selectedPassage}
        hoveredPassageKey={hoveredPassageKey}
        setHoveredPassageKey={setHoveredPassageKey}
        handleWordClick={handleWordClick}
        handlePassageClick={handlePassageClick}
      />
    ));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-linear-to-r from-purple-950/80 via-stone-900 to-amber-950/60 border border-purple-800/40 shadow-xl space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-900/60 text-purple-300 text-xs font-serif border border-purple-700/50">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Interactive Playground Reader</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-serif font-bold text-amber-100 tracking-tight">
          Symbolic Playground
        </h2>
        <p className="text-xs text-stone-300 max-w-xl leading-relaxed">
          Paste any foreign word or text below. It automatically formats into a live interactive reader where you can tap individual words or highlight passages for full answer window deciphering.
        </p>
      </div>

      {/* Main Input Card */}
      <div className="p-5 rounded-3xl bg-stone-900 border border-stone-800 space-y-4 shadow-md">
        {/* Blueprint Selector Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-stone-800 pb-3 text-xs">
          {/* Word Blueprint Selector */}
          <div className="flex items-center space-x-2 bg-stone-950 px-3 py-2 rounded-xl border border-stone-800">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-stone-400 shrink-0 text-[11px]">Word Prompt:</span>
            <select
              value={activeWordBpId || currentWordBp?.id || ''}
              onChange={(e) => setActiveWordBpId(e.target.value)}
              className="bg-transparent text-amber-200 font-medium focus:outline-hidden text-xs w-full truncate"
              id="select-playground-word-bp"
            >
              {wordBlueprints.map((bp) => (
                <option key={bp.id} value={bp.id} className="bg-stone-900 text-stone-100">
                  {bp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Passage Blueprint Selector */}
          <div className="flex items-center space-x-2 bg-stone-950 px-3 py-2 rounded-xl border border-stone-800">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-stone-400 shrink-0 text-[11px]">Passage Prompt:</span>
            <select
              value={activePassageBpId || currentPassageBp?.id || ''}
              onChange={(e) => setActivePassageBpId(e.target.value)}
              className="bg-transparent text-purple-200 font-medium focus:outline-hidden text-xs w-full truncate"
              id="select-playground-passage-bp"
            >
              {passageBlueprints.map((bp) => (
                <option key={bp.id} value={bp.id} className="bg-stone-900 text-stone-100">
                  {bp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Textarea Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label className="text-stone-300 font-medium">
              Enter or Paste Text
            </label>
            {inputText && (
              <button
                onClick={() => {
                  setInputText('');
                  setSelectedWord(null);
                  setSelectedText('');
                }}
                className="text-stone-500 hover:text-red-400 flex items-center space-x-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          <textarea
            rows={3}
            placeholder="Type or paste any word, phrase, or paragraph here (Hebrew, Greek, Latin, German, etc.)..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            dir={isRTLText(inputText) ? 'rtl' : 'ltr'}
            className="w-full p-4 rounded-2xl bg-stone-950 border border-stone-800 text-stone-100 text-sm font-serif leading-relaxed placeholder-stone-600 focus:outline-hidden focus:border-purple-600"
            id="textarea-playground-input"
          />

          {/* Quick Preset Samples */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-stone-500 text-[11px]">Quick Samples:</span>
            {SAMPLE_SNIPPETS.map((snip, idx) => (
              <button
                key={idx}
                onClick={() => setInputText(snip.text)}
                className="px-2.5 py-1 rounded-xl bg-stone-950 hover:bg-stone-800 text-stone-300 border border-stone-800 text-[11px] transition"
              >
                {snip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save to Library Action if text present */}
        {inputText.trim() && onSaveAsTextItem && (
          <div className="pt-2 flex justify-end">
            <button
              onClick={() => {
                const sampleTitle = inputText.trim().slice(0, 30) + '...';
                onSaveAsTextItem(sampleTitle, inputText.trim());
              }}
              className="px-3.5 py-2 rounded-xl bg-purple-900/80 hover:bg-purple-800 text-purple-200 text-xs font-medium flex items-center space-x-1.5 transition border border-purple-700/60"
              id="btn-playground-save-snippet"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-purple-300" />
              <span>Save Prompt Text to Permanent Library</span>
            </button>
          </div>
        )}
      </div>

      {/* Interactive Rendered Canvas */}
      {inputText.trim() && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-400 px-1">
            <span className="font-semibold text-amber-200">Interactive Preview Canvas</span>
            <span>Tap any single word or highlight a passage</span>
          </div>

          <div
            ref={contentRef}
            onMouseUp={handleMouseUpOrTouchEnd}
            onTouchEnd={handleMouseUpOrTouchEnd}
            className="p-6 rounded-3xl bg-stone-950 border border-stone-800 shadow-xl min-h-[160px] select-text"
          >
            {renderParagraphs()}
          </div>
        </div>
      )}

      {/* Fixed Thumb-Friendly Bottom Selection Action Bar for Playground */}
      {selectedText && (() => {
        const cleanNorm = selectedText.trim().replace(/\s+/g, ' ').toLowerCase();
        const cleanRaw = selectedText.trim().toLowerCase();
        const isPassageCached = annotations.some((a) => {
          if (a.type !== 'passage') return false;
          const aNorm = a.target.trim().replace(/\s+/g, ' ').toLowerCase();
          const aRaw = a.target.trim().toLowerCase();
          return aNorm === cleanNorm || aRaw === cleanRaw;
        });

        return (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex justify-center w-auto max-w-[90vw] animate-in slide-in-from-bottom-4 fade-in duration-200">
            <button
              onClick={handleDecipherPassageClick}
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.stopPropagation()}
              className={`px-5 py-3 rounded-full ${
                isPassageCached
                  ? 'bg-linear-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-emerald-50 border-emerald-400/60'
                  : 'bg-linear-to-r from-purple-800 to-amber-800 hover:from-purple-700 hover:to-amber-700 text-purple-50 border-purple-400/60'
              } text-xs font-semibold shadow-2xl flex items-center space-x-2.5 border active:scale-95 backdrop-blur-md`}
              id="btn-playground-decipher-passage-floating"
            >
              <Sparkles className={`w-4 h-4 ${isPassageCached ? 'text-emerald-300' : 'text-amber-300'}`} />
              <span>
                {isPassageCached
                  ? `View Saved Decipher (${selectedText.split(/\s+/).length} words)`
                  : `Decipher Selected Passage (${selectedText.split(/\s+/).length} words)`}
              </span>
            </button>
          </div>
        );
      })()}
    </div>
  );
};
