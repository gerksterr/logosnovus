import React, { useRef, useMemo } from 'react';
import { 
  ReaderSettings, 
  MirrorTranslationData, 
  MirrorPassageReplacement 
} from '../../types';
import { 
  isRTLText, 
  normalizeForMatch, 
  parseParagraph, 
  FormattedRun, 
  applyRunsToMirrorWord, 
  findPassageMatchesInParagraph, 
  ParsedParagraph 
} from '../../utils/textUtils';
import { PassageHighlightOverlay, PassageBoxInfo } from '../PassageHighlightOverlay';
import { getCompositeQueryWord } from '../../utils/mirrorTranslationUtils';

export interface ReaderParagraphItemProps {
  rawPara: string;
  pIdx: number;
  isDarkTheme: boolean;
  readerSettings: ReaderSettings;
  textLanguage: string;
  translatedPassages: string[];
  translatedWordsSet: Set<string>;
  selectedWord: string | null;
  selectedPassage: string | null | undefined;
  hoveredPassageKey: string | null;
  setHoveredPassageKey: React.Dispatch<React.SetStateAction<string | null>>;
  hoveredCompositeKey: string | null;
  setHoveredCompositeKey: React.Dispatch<React.SetStateAction<string | null>>;
  onWordClick: (word: string, blueprintId: string) => void;
  onPassageSelect: (passage: string, blueprintId: string) => void;
  setSelectedText: (text: string) => void;
  activeWordBpId: string;
  activePassageBpId: string;
  mirrorData?: MirrorTranslationData | null;
  onContextMenuWord?: (
    e: React.MouseEvent | React.TouchEvent,
    word: string,
    cleanWord: string,
    pIdx: number,
    wIdx: number,
    token: any,
    mirrorPair?: any,
    activePassageReplacement?: MirrorPassageReplacement,
    matchedExistingTranslation?: { target: string },
    tokenSpan?: { start: number; end: number },
    parsedPara?: ParsedParagraph
  ) => void;
}

export const ReaderParagraphItem: React.FC<ReaderParagraphItemProps> = React.memo(({
  rawPara,
  pIdx,
  isDarkTheme,
  readerSettings,
  textLanguage,
  translatedPassages,
  translatedWordsSet,
  selectedWord,
  selectedPassage,
  hoveredPassageKey,
  setHoveredPassageKey,
  hoveredCompositeKey,
  setHoveredCompositeKey,
  onWordClick,
  onPassageSelect,
  setSelectedText,
  activeWordBpId,
  activePassageBpId,
  mirrorData,
  onContextMenuWord,
}) => {
  const paraRef = useRef<HTMLParagraphElement>(null);
  const parsed = useMemo(() => parseParagraph(rawPara, pIdx), [rawPara, pIdx]);
  const isParaRtl = isRTLText(parsed.plainText, textLanguage);
  const mirrorPara = mirrorData?.paragraphs?.[pIdx];
  const displayMode = readerSettings.mirrorDisplayMode || 'original';

  // Build character offsets for each token in plainText
  const tokenSpans = useMemo(() => {
    let charOffset = 0;
    return parsed.tokens.map((token) => {
      const textLen = token.type === 'word' ? token.plainText.length : token.text.length;
      const start = charOffset;
      const end = charOffset + textLen;
      charOffset = end;
      return { token, start, end };
    });
  }, [parsed]);

  const paraMatches = useMemo(() => {
    return findPassageMatchesInParagraph(parsed, translatedPassages);
  }, [parsed, translatedPassages]);

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
      const redColor = isDarkTheme ? '#f87171' : '#dc2626';
      const blueColor = isDarkTheme ? '#60a5fa' : '#2563eb';
      const colorStyle = run.color === 'red' ? redColor : run.color === 'blue' ? blueColor : undefined;

      if (run.hang && run.hang > 0) {
        const hangRows = run.hang;
        const fontSizeEm = (hangRows * 1.15).toFixed(2);

        return (
          <span
            key={`${keyPrefix}-run-${rIdx}`}
            className="drop-cap-initial select-text"
            style={{
              float: isParaRtl ? 'right' : 'left',
              fontSize: `${fontSizeEm}em`,
              lineHeight: 0.8,
              marginRight: isParaRtl ? '0' : '0.14em',
              marginLeft: isParaRtl ? '0.14em' : '0',
              marginTop: '0.06em',
              marginBottom: '-0.06em',
              padding: '0 0.04em',
              fontWeight: 700,
              fontFamily:
                readerSettings.fontFamily === 'sans'
                  ? 'sans-serif'
                  : readerSettings.fontFamily === 'mono'
                  ? 'monospace'
                  : 'serif',
              display: 'inline-block',
              color: colorStyle,
              unicodeBidi: 'isolate',
            }}
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
      if (token.type === 'whitespace') {
        return <span key={`${keyPrefix}-ws-${tIdx}`}>{token.text}</span>;
      }

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

      const currentWordIdx = token.wordIndex;
      const cleanWordLower = cleanWord?.toLowerCase() || '';
      const mirrorPair = (mirrorPara && currentWordIdx !== undefined) ? mirrorPara.words[currentWordIdx] : undefined;
      const composite = mirrorPair?.composite;
      const isWordKeepOrig = Boolean(
        mirrorPair?.keepOrig ||
        (cleanWordLower && mirrorData?.untranslatedWords?.includes(cleanWordLower))
      );

      // Check if this word belongs to an active custom passage replacement
      const activePassageReplacement = mirrorData?.passageReplacements?.find(
        (pr) => pr.pIdx === pIdx && currentWordIdx !== undefined && currentWordIdx >= pr.startWIdx && currentWordIdx <= pr.endWIdx
      );

      const isPreferCompound = Boolean(
        mirrorPair?.preferCompoundInMirror ||
        mirrorData?.compositeDisplayMode === 'compound'
      );

      let mirrorWord = '';
      if (activePassageReplacement && currentWordIdx !== undefined) {
        if (currentWordIdx === activePassageReplacement.startWIdx) {
          mirrorWord = activePassageReplacement.customTrans;
        } else {
          mirrorWord = '';
        }
      } else if (composite && isPreferCompound && !isWordKeepOrig) {
        if (composite.partIndex === 0) {
          mirrorWord = composite.compoundMeaning;
        } else {
          mirrorWord = `[${mirrorPair?.trans || ''}]`;
        }
      } else {
        const rawMirrorWord = mirrorPair?.trans || '';
        mirrorWord = isWordKeepOrig ? token.plainText : rawMirrorWord;
      }

      const mirrorRuns = isWordKeepOrig ? token.runs : (mirrorWord ? applyRunsToMirrorWord(token.runs, mirrorWord) : []);
      const hasHang = token.runs.some((r) => r.hang && r.hang > 0);
      const isMirrorActive = displayMode === 'mirror' || displayMode === 'mirror-normalized-original';

      const isCompositeHovered = Boolean(composite && hoveredCompositeKey === `${pIdx}-${composite.id}`);

      const compositeHoverClasses = isCompositeHovered
        ? isDarkTheme
          ? 'ring-2 ring-cyan-400 bg-cyan-950/60 text-cyan-200 shadow-md shadow-cyan-900/40 rounded px-0.5'
          : 'ring-2 ring-cyan-600 bg-cyan-100 text-cyan-950 shadow-md shadow-cyan-200/50 rounded px-0.5'
        : '';

      const compositeUnderlineClass = composite && !isSelected && !isCompositeHovered
        ? isDarkTheme
          ? 'border-b border-dashed border-cyan-400/60'
          : 'border-b border-dashed border-cyan-600/70'
        : '';

      const selectedHighlightClasses = isDarkTheme
        ? 'bg-amber-500/25 text-amber-200 ring-1 ring-inset ring-amber-400/60 rounded px-1 py-0.5'
        : 'bg-amber-200/90 text-amber-950 ring-1 ring-inset ring-amber-500/60 rounded px-1 py-0.5';

      const translatedClasses = isDarkTheme
        ? 'text-stone-200 border-b border-stone-400/70 hover:border-amber-400 hover:text-amber-200 hover:bg-stone-800/30 px-0.5 py-0.5'
        : 'text-stone-800 border-b border-stone-600/70 hover:border-amber-600 hover:text-amber-900 hover:bg-stone-200/40 px-0.5 py-0.5';

      const defaultWordClasses = isDarkTheme
        ? 'text-stone-300 rounded px-0.5 py-0.5 hover:bg-amber-500/15 hover:text-amber-200'
        : 'text-stone-800 rounded px-0.5 py-0.5 hover:bg-amber-500/15 hover:text-amber-900';

      const keepOrigExtraClasses = (isWordKeepOrig && displayMode === 'mirror')
        ? 'underline decoration-dotted decoration-emerald-400/70'
        : (activePassageReplacement && displayMode === 'mirror')
        ? 'underline decoration-amber-400 decoration-wavy'
        : '';

      const tokenSpan = tokenSpans[tIdx];
      const coveringMatch = tokenSpan
        ? paraMatches.find((m) => (tokenSpan.start >= m.start && tokenSpan.end <= m.end) || (tokenSpan.start < m.end && tokenSpan.end > m.start))
        : undefined;

      const handleContextMenuInvocation = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenuWord?.(
          e,
          token.plainText,
          cleanWord,
          pIdx,
          currentWordIdx ?? 0,
          token,
          mirrorPair,
          activePassageReplacement,
          coveringMatch ? { target: coveringMatch.target } : undefined,
          tokenSpan,
          parsed
        );
      };

      const handleMouseEnterWord = () => {
        if (composite) {
          setHoveredCompositeKey(`${pIdx}-${composite.id}`);
        }
      };

      const handleMouseLeaveWord = () => {
        if (composite) {
          setHoveredCompositeKey((prev) => (prev === `${pIdx}-${composite.id}` ? null : prev));
        }
      };

      const compositeQueryWord = composite
        ? getCompositeQueryWord(composite, currentWordIdx, cleanWord, mirrorPara)
        : '';

      const handleCompositeBadgeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setSelectedText('');
        window.getSelection()?.removeAllRanges();
        if (compositeQueryWord) {
          onWordClick(compositeQueryWord, activeWordBpId);
        }
      };

      const compositeBadgeTitle = composite
        ? `Decipher compound "${compositeQueryWord}" (${composite.compoundMeaning})`
        : '';

      const renderCompositeBadge = (extraClasses = '') => {
        if (!composite) return null;
        const isHead = composite.partIndex === 0;
        const badgeLabel = `[${composite.groupIndex || 1}${isHead && composite.compoundMeaning ? `:${composite.compoundMeaning}` : ''}]`;
        return (
          <span
            onClick={handleCompositeBadgeClick}
            title={compositeBadgeTitle}
            className={`cursor-pointer select-none inline-flex items-center space-x-0.5 rounded px-1 py-0.5 text-[9px] font-mono font-bold leading-none shrink-0 transition-all hover:scale-105 active:scale-95 duration-150 ${
              isCompositeHovered
                ? isDarkTheme
                  ? 'bg-cyan-400 text-stone-950 shadow-md shadow-cyan-900/40 ring-1 ring-cyan-200'
                  : 'bg-cyan-600 text-white shadow-md shadow-cyan-200/60 ring-1 ring-cyan-400'
                : isDarkTheme
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 hover:bg-cyan-900 hover:text-cyan-100 hover:border-cyan-400'
                : 'bg-cyan-100 text-cyan-900 border border-cyan-300 hover:bg-cyan-200 hover:border-cyan-500 hover:text-cyan-950'
            } ${extraClasses}`}
          >
            <span className="leading-none">{badgeLabel}</span>
          </span>
        );
      };

      const compositeTooltip = composite
        ? `⚡ Separable Composite (${composite.groupIndex || 1}): "${compositeQueryWord || token.plainText}" → Compound: "${composite.compoundMeaning}" (Literal: "${composite.separatedMeaning}")`
        : undefined;

      const wordTitle = activePassageReplacement
        ? `Custom mirror passage: "${activePassageReplacement.customTrans}"`
        : compositeTooltip
        ? compositeTooltip
        : isWordKeepOrig
        ? 'Kept in original language (Right-click to configure)'
        : undefined;

      // Drop Cap handling in Mirror / Mirror-Normalized-Original mode
      if (hasHang && isMirrorActive && (mirrorWord || isWordKeepOrig)) {
        const origHangRun = token.runs.find((r) => r.hang && r.hang > 0);
        const mirrorHangRun = mirrorRuns.find((r) => r.hang && r.hang > 0);
        const origRestRuns = token.runs.filter((r) => !r.hang);
        const mirrorRestRuns = mirrorRuns.filter((r) => !r.hang);

        const hangRows = origHangRun?.hang || 2;
        const fontSizeEm = (hangRows * 1.15).toFixed(2);
        const origRedColor = isDarkTheme ? '#f87171' : '#dc2626';
        const origBlueColor = isDarkTheme ? '#60a5fa' : '#2563eb';
        const origColorStyle = origHangRun?.color === 'red' ? origRedColor : origHangRun?.color === 'blue' ? origBlueColor : undefined;
        const mirrorColorStyle = mirrorHangRun?.color === 'red' ? origRedColor : mirrorHangRun?.color === 'blue' ? origBlueColor : undefined;

        const dropCapNode = (
          <span
            key={`${keyPrefix}-w-${tIdx}-hang`}
            className="drop-cap-initial select-text"
            onContextMenu={handleContextMenuInvocation}
            onMouseEnter={handleMouseEnterWord}
            onMouseLeave={handleMouseLeaveWord}
            style={{
              float: isParaRtl ? 'right' : 'left',
              display: 'inline-grid',
              verticalAlign: 'top',
              lineHeight: 0.8,
              marginRight: isParaRtl ? '0' : '0.14em',
              marginLeft: isParaRtl ? '0.14em' : '0',
              marginTop: '0.06em',
              marginBottom: '-0.06em',
              padding: '0 0.04em',
              fontSize: `${fontSizeEm}em`,
              fontWeight: 700,
              fontFamily:
                readerSettings.fontFamily === 'sans'
                  ? 'sans-serif'
                  : readerSettings.fontFamily === 'mono'
                  ? 'monospace'
                  : 'serif',
              unicodeBidi: 'isolate',
            }}
          >
            <span
              style={{ gridArea: '1 / 1 / 2 / 2', color: origColorStyle }}
              className={`justify-self-center inline transition-opacity duration-150 ${
                displayMode === 'mirror'
                  ? 'opacity-0 select-none pointer-events-none'
                  : 'opacity-100 select-text'
              }`}
            >
              {origHangRun?.text}
            </span>
            <span
              style={{ gridArea: '1 / 1 / 2 / 2', color: mirrorColorStyle }}
              className={`justify-self-center inline transition-opacity duration-150 ${
                displayMode === 'mirror'
                  ? 'opacity-100 select-text'
                  : 'opacity-0 select-none pointer-events-none'
              }`}
            >
              {mirrorHangRun?.text || origHangRun?.text}
            </span>
          </span>
        );

        const restWordNode = (
          <span
            key={`${keyPrefix}-w-${tIdx}`}
            id={`reader-w-${pIdx}-${currentWordIdx}`}
            data-para-idx={pIdx}
            data-word-idx={currentWordIdx}
            data-orig-text={token.plainText}
            data-mirror-text={mirrorWord || token.plainText}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedText('');
              window.getSelection()?.removeAllRanges();
              onWordClick(cleanWord, activeWordBpId);
            }}
            onContextMenu={handleContextMenuInvocation}
            onMouseEnter={handleMouseEnterWord}
            onMouseLeave={handleMouseLeaveWord}
            className={`cursor-pointer relative z-10 transition-all duration-150 inline-grid align-baseline ${
              isSelected
                ? selectedHighlightClasses
                : isCompositeHovered
                ? compositeHoverClasses
                : isWordTranslated
                ? `${translatedClasses} ${compositeUnderlineClass}`
                : `${defaultWordClasses} ${compositeUnderlineClass}`
            } ${keepOrigExtraClasses}`}
            title={wordTitle}
            style={{
              display: 'inline-grid',
              verticalAlign: 'baseline',
            }}
          >
            <span
              data-layer="orig"
              style={{ gridArea: '1 / 1 / 2 / 2' }}
              className={`justify-self-start inline transition-opacity duration-150 ${
                displayMode === 'mirror'
                  ? 'opacity-0 select-none pointer-events-none'
                  : 'opacity-100 select-text'
              }`}
            >
              {renderRuns(origRestRuns, `${keyPrefix}-w-${tIdx}`)}
              {renderCompositeBadge('ml-1 align-baseline')}
            </span>
            <span
              data-layer="mirror"
              style={{ gridArea: '1 / 1 / 2 / 2' }}
              className={`justify-self-start inline transition-opacity duration-150 ${
                displayMode === 'mirror'
                  ? 'opacity-100 select-text'
                  : 'opacity-0 select-none pointer-events-none'
              }`}
            >
              {renderRuns(mirrorRestRuns, `${keyPrefix}-mw-${tIdx}`)}
              {renderCompositeBadge('ml-1 align-baseline')}
            </span>
          </span>
        );

        return (
          <React.Fragment key={`${keyPrefix}-w-${tIdx}-frag`}>
            {dropCapNode}
            {restWordNode}
          </React.Fragment>
        );
      }

      // Drop Cap in natural original mode
      if (hasHang) {
        return (
          <span
            key={`${keyPrefix}-w-${tIdx}`}
            id={`reader-w-${pIdx}-${currentWordIdx}`}
            data-para-idx={pIdx}
            data-word-idx={currentWordIdx}
            data-orig-text={token.plainText}
            data-mirror-text={mirrorWord || token.plainText}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedText('');
              window.getSelection()?.removeAllRanges();
              onWordClick(cleanWord, activeWordBpId);
            }}
            onContextMenu={handleContextMenuInvocation}
            onMouseEnter={handleMouseEnterWord}
            onMouseLeave={handleMouseLeaveWord}
            className={`cursor-pointer relative z-10 transition-all duration-150 inline ${
              isSelected
                ? selectedHighlightClasses
                : isCompositeHovered
                ? compositeHoverClasses
                : isWordTranslated
                ? `${translatedClasses} ${compositeUnderlineClass}`
                : `${defaultWordClasses} ${compositeUnderlineClass}`
            } ${keepOrigExtraClasses}`}
            title={wordTitle}
          >
            {renderRuns(token.runs, `${keyPrefix}-w-${tIdx}`)}
            {renderCompositeBadge('ml-1 align-baseline')}
          </span>
        );
      }

      // 1. Interlinear Display Mode (Stacked original + English gloss)
      if (displayMode === 'interlinear') {
        const hasGloss = Boolean(mirrorWord || isWordKeepOrig);
        return (
          <span
            key={`${keyPrefix}-w-${tIdx}`}
            id={`reader-w-${pIdx}-${currentWordIdx}`}
            data-para-idx={pIdx}
            data-word-idx={currentWordIdx}
            data-orig-text={token.plainText}
            data-mirror-text={mirrorWord}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedText('');
              window.getSelection()?.removeAllRanges();
              onWordClick(cleanWord, activeWordBpId);
            }}
            onContextMenu={handleContextMenuInvocation}
            onMouseEnter={handleMouseEnterWord}
            onMouseLeave={handleMouseLeaveWord}
            className={`cursor-pointer relative z-10 transition-all duration-150 inline-flex flex-col justify-end items-start align-bottom mx-1 ${
              isSelected
                ? selectedHighlightClasses
                : isCompositeHovered
                ? compositeHoverClasses
                : isWordTranslated
                ? `${translatedClasses} ${compositeUnderlineClass}`
                : `${defaultWordClasses} ${compositeUnderlineClass}`
            } ${keepOrigExtraClasses}`}
            title={wordTitle}
          >
            <div className="flex items-center space-x-1 whitespace-nowrap h-5 min-h-[1.25rem] max-h-5 leading-none mb-0.5 overflow-visible">
              {hasGloss ? (
                <>
                  <span className={`text-[11px] font-sans font-medium leading-none select-text ${isWordKeepOrig ? 'text-emerald-400/90' : isCompositeHovered ? 'text-cyan-300 font-semibold' : 'text-amber-400/90'}`}>
                    {isWordKeepOrig ? '[orig]' : mirrorWord}
                  </span>
                  {renderCompositeBadge('h-[17px] leading-none py-0 align-middle shrink-0')}
                </>
              ) : (
                <span className="invisible select-none text-[11px] leading-none">&nbsp;</span>
              )}
            </div>
            <span data-orig-row="true" className="leading-normal block select-text">
              {renderRuns(token.runs, `${keyPrefix}-w-${tIdx}`)}
            </span>
          </span>
        );
      }

      // 2. Mirror Mode & Mirror-Normalized-Original (Dual-layer zero-shift grid)
      if (isMirrorActive && (mirrorWord || isWordKeepOrig)) {
        return (
          <span
            key={`${keyPrefix}-w-${tIdx}`}
            id={`reader-w-${pIdx}-${currentWordIdx}`}
            data-para-idx={pIdx}
            data-word-idx={currentWordIdx}
            data-orig-text={token.plainText}
            data-mirror-text={mirrorWord}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedText('');
              window.getSelection()?.removeAllRanges();
              onWordClick(cleanWord, activeWordBpId);
            }}
            onContextMenu={handleContextMenuInvocation}
            onMouseEnter={handleMouseEnterWord}
            onMouseLeave={handleMouseLeaveWord}
            className={`cursor-pointer relative z-10 transition-all duration-150 inline-grid align-baseline ${
              isSelected
                ? selectedHighlightClasses
                : isCompositeHovered
                ? compositeHoverClasses
                : isWordTranslated
                ? `${translatedClasses} ${compositeUnderlineClass}`
                : `${defaultWordClasses} ${compositeUnderlineClass}`
            } ${keepOrigExtraClasses}`}
            title={wordTitle}
            style={{
              display: 'inline-grid',
              verticalAlign: 'baseline',
            }}
          >
            <span
              data-layer="orig"
              style={{ gridArea: '1 / 1 / 2 / 2' }}
              className={`justify-self-start inline transition-opacity duration-150 ${
                displayMode === 'mirror'
                  ? 'opacity-0 select-none pointer-events-none'
                  : 'opacity-100 select-text'
              }`}
            >
              {renderRuns(token.runs, `${keyPrefix}-w-${tIdx}`)}
              {renderCompositeBadge('ml-1 align-baseline')}
            </span>

            <span
              data-layer="mirror"
              style={{ gridArea: '1 / 1 / 2 / 2' }}
              className={`justify-self-start inline transition-opacity duration-150 ${
                displayMode === 'mirror'
                  ? 'opacity-100 select-text'
                  : 'opacity-0 select-none pointer-events-none'
              }`}
            >
              {renderRuns(mirrorRuns, `${keyPrefix}-mw-${tIdx}`)}
              {renderCompositeBadge('ml-1 align-baseline')}
            </span>
          </span>
        );
      }

      // 3. Default Natural Original Mode
      return (
        <span
          key={`${keyPrefix}-w-${tIdx}`}
          id={`reader-w-${pIdx}-${currentWordIdx}`}
          data-para-idx={pIdx}
          data-word-idx={currentWordIdx}
          data-orig-text={token.plainText}
          data-mirror-text={mirrorWord || token.plainText}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedText('');
            window.getSelection()?.removeAllRanges();
            onWordClick(cleanWord, activeWordBpId);
          }}
          onContextMenu={handleContextMenuInvocation}
          onMouseEnter={handleMouseEnterWord}
          onMouseLeave={handleMouseLeaveWord}
          className={`cursor-pointer relative z-10 transition-all duration-150 inline ${
            isSelected
              ? selectedHighlightClasses
              : isCompositeHovered
              ? compositeHoverClasses
              : isWordTranslated
              ? `${translatedClasses} ${compositeUnderlineClass}`
              : `${defaultWordClasses} ${compositeUnderlineClass}`
          } ${keepOrigExtraClasses}`}
          title={wordTitle}
        >
          {renderRuns(token.runs, `${keyPrefix}-w-${tIdx}`)}
          {renderCompositeBadge('ml-1 align-baseline')}
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
      return renderTokenSlice(rangeStart, rangeEnd, `p${pIdx}-${rangeStart}-${rangeEnd}`);
    }

    const nodes: React.ReactNode[] = [];
    let curr = rangeStart;

    topMatches.forEach((match, mIdx) => {
      if (match.start > curr) {
        nodes.push(
          <React.Fragment key={`before-${pIdx}-${curr}-${match.start}`}>
            {renderTokenSlice(curr, match.start, `p${pIdx}-${curr}-${match.start}`)}
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
      const passageKey = `passage-${pIdx}-${match.start}-${match.end}-${depth}-${mIdx}`;
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
            if (targetEl && (targetEl.closest('[data-word-idx]') || targetEl.closest('[id^="reader-w-"]') || targetEl.closest('[id^="reader-mw-"]'))) {
              return;
            }
            e.stopPropagation();
            setSelectedText('');
            window.getSelection()?.removeAllRanges();
            onPassageSelect(match.target, activePassageBpId);
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
        <React.Fragment key={`after-${pIdx}-${curr}-${rangeEnd}`}>
          {renderTokenSlice(curr, rangeEnd, `p${pIdx}-${curr}-${rangeEnd}`)}
        </React.Fragment>
      );
    }

    return nodes;
  };

  const renderedContent = renderRangeWithMatches(0, parsed.tokens.length, paraMatches, 0);

  return (
    <p
      ref={paraRef}
      id={`reader-para-${pIdx}`}
      data-para-idx={pIdx}
      dir={isParaRtl ? 'rtl' : 'ltr'}
      className={`relative mb-6 leading-relaxed ${
        readerSettings.fontFamily === 'sans'
          ? 'font-sans'
          : readerSettings.fontFamily === 'mono'
          ? 'font-mono'
          : 'font-serif'
      } transition-opacity duration-200 clear-both ${
        isParaRtl ? 'text-right' : displayMode === 'interlinear' ? 'text-left' : 'text-justify'
      }`}
      style={{
        fontSize: `${readerSettings.fontSize}px`,
        lineHeight: displayMode === 'interlinear' ? Math.max(readerSettings.lineHeight, 2.3) : readerSettings.lineHeight,
      }}
    >
      <PassageHighlightOverlay
        containerRef={paraRef}
        passages={passageBoxInfos}
        isDarkTheme={isDarkTheme}
        themeAccent="amber"
        onPassageHover={setHoveredPassageKey}
        onPassageClick={(target) => onPassageSelect(target, activePassageBpId)}
        dependencies={[
          readerSettings.fontSize,
          readerSettings.lineHeight,
          displayMode,
          mirrorData?.id,
          mirrorData?.updatedAt,
          hoveredPassageKey,
          selectedPassage,
          passageBoxInfos.length,
        ]}
      />
      <span className="relative z-10">{renderedContent}</span>
    </p>
  );
});
