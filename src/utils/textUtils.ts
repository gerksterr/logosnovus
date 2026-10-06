/**
 * Text direction and Unicode utilities for Right-to-Left (Hebrew, Arabic, Aramaic, etc.)
 * and multilingual symbolic script deciphering.
 */

// Matches Unicode ranges for Hebrew, Arabic, Syriac, Thaana, Samaritan, and Persian/Urdu scripts
export const RTL_CHAR_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u0800-\u083F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;

export const RTL_LANG_REGEX = /(hebrew|עברית|arabic|العربية|aramaic|yiddish|persian|farsi|urdu|syriac|samaritan|thaana)/i;

/**
 * Determines whether a text string or designated language is Right-to-Left (RTL).
 */
export function isRTLText(text?: string, language?: string): boolean {
  if (language && RTL_LANG_REGEX.test(language.trim())) {
    return true;
  }
  if (!text) return false;
  return RTL_CHAR_REGEX.test(text);
}

/**
 * Returns 'rtl' or 'ltr' direction attribute value.
 */
export function getRTLDir(text?: string, language?: string): 'rtl' | 'ltr' {
  return isRTLText(text, language) ? 'rtl' : 'ltr';
}

/**
 * Strips formatting tags [Red], [/Red], [Blue], [/Blue], [hang:X], [/hang] (case-insensitive).
 */
export const FORMATTING_TAG_REGEX = /\[(?:\/?(?:red|blue)|hang(?::\s*\d+)?|\/hang)\]/gi;

export function stripFormattingTags(text: string): string {
  if (!text) return '';
  return text.replace(FORMATTING_TAG_REGEX, '');
}

/**
 * Strips non-word punctuation at start/end of token while keeping
 * Unicode Letters (\p{L}), Combining Marks & Vowels (\p{M} including Hebrew Niqqud, Dagesh,
 * Shin dots, and Arabic Harakat), and Numbers (\p{N}), ignoring formatting tags.
 */
export function cleanWordToken(token: string): string {
  if (!token) return '';
  const noTags = stripFormattingTags(token);
  return noTags.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '');
}

/**
 * Regex for identifying glued word boundaries where words are joined without whitespace
 * due to punctuation/signs (e.g. 'Stern“—so', 'star"-so', 'star”-so', 'Liebe?—so', 'Mensch—und', 'Stern“so', 'Liebe?Was').
 * It splits:
 * 1) Words ending in quotes/brackets/punct followed by a hyphen/em-dash/en-dash/double-dash (e.g. 'star"-so', 'Stern“—so') and next word
 * 2) Words ending in em-dash, en-dash, or double-dash followed by next word
 * 3) Words ending in closing quotes/brackets followed by next word
 * 4) Words ending in sentence punctuation (?, !) followed by next word
 * Keeps intra-word hyphens ('was-silent', 'S-Bahn'), contractions ('it\'s', 'don\'t'), and composite annotations ('saw[1:looked-at]') intact.
 */
export const GLUED_WORD_SPLIT_REGEX = /(?<=[^\s]+?(?:[“"”’'»«›‹\)\}\]\.\?!,:;]+[-\u2014\u2013—–]+|--+|[\u2014\u2013—–]|--+|[“"”»«›‹\)\}\]](?!['’]\p{L})|[\?!]))(?=[\p{L}\p{M}])/gu;

export function splitGluedWords(chunk: string): string[] {
  if (!chunk || chunk.length <= 1) return [chunk];
  const parts = chunk.split(GLUED_WORD_SPLIT_REGEX).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [chunk];
}

/**
 * Strips Hebrew vowel points (Niqqud) and cantillation marks (U+0591 to U+05C7).
 */
export function stripHebrewVowels(str: string): string {
  if (!str) return '';
  return str.replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '');
}

/**
 * Normalizes text for matching passages/queries (collapsing whitespaces, unicode NFC normalization, stripping formatting tags, and lowercase).
 */
export function normalizeForMatch(text: string): string {
  if (!text) return '';
  const noTags = stripFormattingTags(text);
  return noTags
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Splits raw content into individual lines/paragraphs preserving both single and double line breaks.
 */
export function splitTextIntoParagraphs(content: string): string[] {
  if (!content) return [];
  return content
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface PassageMatchResult {
  start: number; // token index start (inclusive)
  end: number;   // token index end (exclusive)
  target: string;
}

/**
 * Robust passage search across parsed tokens supporting multilingual text,
 * Hebrew Niqqud/vowels normalization, Unicode NFC/NFD equivalence, and whitespace normalization.
 */
export function findPassageMatchesInParagraph(
  parsed: ParsedParagraph,
  translatedPassages: string[]
): PassageMatchResult[] {
  if (!parsed || parsed.tokens.length === 0 || translatedPassages.length === 0) return [];

  // Build character offsets for each token in plainText
  let charOffset = 0;
  const tokenSpans = parsed.tokens.map((token) => {
    const textLen = token.type === 'word' ? token.plainText.length : token.text.length;
    const start = charOffset;
    const end = charOffset + textLen;
    charOffset = end;
    return { token, start, end };
  });

  const normPlainText = normalizeForMatch(parsed.plainText);
  const unpointedPlainText = stripHebrewVowels(normPlainText);
  const matches: PassageMatchResult[] = [];

  translatedPassages.forEach((pTarget) => {
    const cleanTarget = stripFormattingTags(pTarget).trim();
    if (!cleanTarget || cleanTarget.length < 2) return;

    const normTarget = normalizeForMatch(cleanTarget);
    if (!normTarget || normTarget.length < 2) return;

    const foundCharSpans: Array<{ start: number; end: number }> = [];

    // 1. Direct normalized match
    let pos = 0;
    while ((pos = normPlainText.indexOf(normTarget, pos)) !== -1) {
      foundCharSpans.push({ start: pos, end: pos + normTarget.length });
      pos += 1;
    }

    // 2. If not found, try stripped-vowel match for Hebrew
    if (foundCharSpans.length === 0) {
      const unpointedTarget = stripHebrewVowels(normTarget);
      if (unpointedTarget.length >= 2) {
        let unpointedPos = 0;
        while ((unpointedPos = unpointedPlainText.indexOf(unpointedTarget, unpointedPos)) !== -1) {
          let pNormIdx = 0;
          let pUnpointedIdx = 0;
          let matchStart = -1;
          let matchEnd = -1;

          while (pNormIdx < normPlainText.length) {
            if (pUnpointedIdx === unpointedPos && matchStart === -1) {
              matchStart = pNormIdx;
            }
            if (pUnpointedIdx === unpointedPos + unpointedTarget.length && matchEnd === -1) {
              matchEnd = pNormIdx;
              break;
            }
            const char = normPlainText[pNormIdx];
            if (!/[\u0591-\u05BD\u05BF-\u05C7]/.test(char)) {
              pUnpointedIdx++;
            }
            pNormIdx++;
          }
          if (matchEnd === -1) matchEnd = normPlainText.length;

          if (matchStart !== -1 && matchStart < matchEnd) {
            foundCharSpans.push({ start: matchStart, end: matchEnd });
          }
          unpointedPos += 1;
        }
      }
    }

    // Map character spans to token index spans
    foundCharSpans.forEach((span) => {
      let startTokenIdx = -1;
      let endTokenIdx = parsed.tokens.length;

      for (let i = 0; i < tokenSpans.length; i++) {
        if (startTokenIdx === -1 && tokenSpans[i].end > span.start) {
          startTokenIdx = i;
        }
        if (tokenSpans[i].start >= span.end) {
          endTokenIdx = i;
          break;
        }
      }

      if (startTokenIdx !== -1 && startTokenIdx < endTokenIdx) {
        matches.push({
          start: startTokenIdx,
          end: endTokenIdx,
          target: cleanTarget,
        });
      }
    });
  });

  return matches;
}

export type FormattedColor = 'red' | 'blue' | null;

export interface FormattedRun {
  text: string;
  color?: FormattedColor;
  hang?: number | null;
}

export interface ParsedWordToken {
  type: 'word';
  raw: string;
  plainText: string;
  cleanWord: string;
  runs: FormattedRun[];
  wordIndex: number; // 0-based word index in paragraph
  paraIndex: number;
}

export interface ParsedWhitespaceToken {
  type: 'whitespace';
  text: string;
}

export type ParagraphToken = ParsedWordToken | ParsedWhitespaceToken;

export interface ParsedParagraph {
  tokens: ParagraphToken[];
  plainText: string;
  hasHang: boolean;
}

/**
 * Parses a paragraph of foreign text containing formatting tags like [Red]...[/Red],
 * [Blue]...[/Blue], and [hang:X]...[/hang] into structured tokens and formatted runs.
 */
export function parseParagraph(rawPara: string, paraIndex = 0): ParsedParagraph {
  const tokens: ParagraphToken[] = [];
  let plainTextAcc = '';
  let activeColor: FormattedColor = null;
  let activeHang: number | null = null;
  let paraWordIdx = 0;
  let hasHang = false;

  // Scanner pattern: matches tags, whitespaces, or plain text characters
  const scannerRegex = /(\[\/?(?:red|blue)\]|\[hang:\s*\d+\]|\[\/hang\]|\s+|[^\[\s]+|\[)/gi;
  const parts = rawPara.match(scannerRegex) || [rawPara];

  let currentWordRuns: FormattedRun[] = [];
  let currentWordRaw = '';
  let currentWordPlain = '';

  const flushWord = () => {
    if (currentWordPlain.length > 0 || currentWordRuns.length > 0) {
      const cleanWord = cleanWordToken(currentWordPlain);
      tokens.push({
        type: 'word',
        raw: currentWordRaw,
        plainText: currentWordPlain,
        cleanWord,
        runs: currentWordRuns,
        wordIndex: paraWordIdx++,
        paraIndex,
      });
      currentWordRuns = [];
      currentWordRaw = '';
      currentWordPlain = '';
    }
  };

  for (const part of parts) {
    const lower = part.toLowerCase().replace(/\s+/g, '');
    if (lower === '[red]') {
      activeColor = 'red';
      currentWordRaw += part;
    } else if (lower === '[/red]') {
      if (activeColor === 'red') activeColor = null;
      currentWordRaw += part;
    } else if (lower === '[blue]') {
      activeColor = 'blue';
      currentWordRaw += part;
    } else if (lower === '[/blue]') {
      if (activeColor === 'blue') activeColor = null;
      currentWordRaw += part;
    } else if (lower.startsWith('[hang:')) {
      const match = part.match(/\[hang:\s*(\d+)\]/i);
      const hangNum = match ? parseInt(match[1], 10) : 2;
      activeHang = hangNum > 0 ? hangNum : 2;
      hasHang = true;
      currentWordRaw += part;
    } else if (lower === '[/hang]') {
      activeHang = null;
      currentWordRaw += part;
    } else if (/^\s+$/.test(part)) {
      flushWord();
      tokens.push({
        type: 'whitespace',
        text: ' ',
      });
      plainTextAcc += ' ';
    } else {
      // Normal character fragment
      // Handle words glued together without whitespace by punctuation/signs (e.g. 'Stern“—so', 'Liebe?—so')
      const subParts = splitGluedWords(part);
      for (let i = 0; i < subParts.length; i++) {
        const sub = subParts[i];
        currentWordRaw += sub;
        currentWordPlain += sub;
        plainTextAcc += sub;

        const lastRun = currentWordRuns[currentWordRuns.length - 1];
        if (lastRun && lastRun.color === activeColor && lastRun.hang === activeHang) {
          lastRun.text += sub;
        } else {
          currentWordRuns.push({
            text: sub,
            color: activeColor,
            hang: activeHang,
          });
        }

        // If there are subsequent sub-parts in this chunk, the current word is complete and we flush it
        if (i < subParts.length - 1) {
          flushWord();
        }
      }
    }
  }

  flushWord();

  return {
    tokens,
    plainText: plainTextAcc,
    hasHang,
  };
}

/**
 * Maps original BBCode formatted runs ([Red], [Blue], [hang:X], etc.) from the foreign token onto the mirror translated word.
 * Ensures the mirror word inherits identical drop-cap hangs, text coloring, and run structures.
 */
export function applyRunsToMirrorWord(runs: FormattedRun[], mirrorWord: string): FormattedRun[] {
  if (!mirrorWord) return [];
  if (!runs || runs.length === 0) {
    return [{ text: mirrorWord }];
  }

  // Single run (most common case: uniform color/hang or normal text)
  if (runs.length === 1) {
    return [{
      text: mirrorWord,
      color: runs[0].color,
      hang: runs[0].hang,
    }];
  }

  // Multiple runs (e.g. drop-cap on initial letter [hang:2][Red]T[/Red]ext or multi-color word)
  const firstRun = runs[0];
  if (firstRun.hang && firstRun.hang > 0) {
    // Apply drop-cap hang & first run color to the first character of mirror translation
    const firstChar = mirrorWord.slice(0, 1);
    const rest = mirrorWord.slice(1);
    const result: FormattedRun[] = [
      {
        text: firstChar,
        color: firstRun.color,
        hang: firstRun.hang,
      },
    ];
    if (rest.length > 0) {
      // Find subsequent color/hang for the remainder
      const subsequentColor = runs.slice(1).find((r) => r.color)?.color || null;
      const subsequentHang = runs.slice(1).find((r) => r.hang)?.hang || null;
      result.push({
        text: rest,
        color: subsequentColor,
        hang: subsequentHang,
      });
    }
    return result;
  }

  // If first run had specific color and remainder didn't
  if (firstRun.text.length <= 2 && firstRun.color && runs.length === 2 && !runs[1].color) {
    const firstChar = mirrorWord.slice(0, Math.min(firstRun.text.length, mirrorWord.length));
    const rest = mirrorWord.slice(firstChar.length);
    const result: FormattedRun[] = [
      { text: firstChar, color: firstRun.color, hang: firstRun.hang },
    ];
    if (rest.length > 0) {
      result.push({ text: rest, color: runs[1].color, hang: runs[1].hang });
    }
    return result;
  }

  // Distribute runs across the mirror word based on character proportions
  const totalOrigLen = runs.reduce((sum, r) => sum + r.text.length, 0) || 1;
  const result: FormattedRun[] = [];
  let consumedChars = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (i === runs.length - 1) {
      const remainingText = mirrorWord.slice(consumedChars);
      if (remainingText.length > 0) {
        result.push({
          text: remainingText,
          color: run.color,
          hang: run.hang,
        });
      }
    } else {
      const propLength = Math.max(1, Math.round((run.text.length / totalOrigLen) * mirrorWord.length));
      const sliceLen = Math.min(propLength, mirrorWord.length - consumedChars - (runs.length - 1 - i));
      const chunkText = mirrorWord.slice(consumedChars, consumedChars + Math.max(1, sliceLen));
      consumedChars += chunkText.length;
      if (chunkText.length > 0) {
        result.push({
          text: chunkText,
          color: run.color,
          hang: run.hang,
        });
      }
    }
  }

  return result.length > 0 ? result : [{ text: mirrorWord }];
}

/**
 * Cleans text copied from the reader container, converting artificial line breaks caused by
 * inline-grid or span bounding boxes into single spaces, while preserving true paragraph breaks.
 */
export function cleanCopiedReaderText(rawText: string): string {
  if (!rawText) return '';

  // Standardize line breaks
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // If the text contains consecutive newlines between single words (typical of inline-grid/DOM span copies),
  // detect whether lines are predominantly single tokens.
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return '';

  const wordsPerLine = lines.map((l) => l.split(/\s+/).filter(Boolean).length);
  const totalWords = wordsPerLine.reduce((a, b) => a + b, 0);
  const avgWordsPerLine = totalWords / lines.length;

  if (avgWordsPerLine < 1.8 && lines.length > 1) {
    // Almost every line is 1 word -> this was caused by CSS grid/flex block wrappers!
    // Check if there are explicit multi-newline breaks for paragraphs
    const paraBlocks = normalized.split(/\n\s*\n\s*\n+/);
    if (paraBlocks.length > 1) {
      return paraBlocks
        .map((block) => {
          const blockLines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
          return blockLines.join(' ');
        })
        .filter((b) => b.length > 0)
        .join('\n\n');
    }
    // Single paragraph of words
    return lines.join(' ');
  }

  // Otherwise, split by standard paragraph breaks (double newlines)
  const paragraphs = normalized.split(/\n\s*\n/);
  const cleaned = paragraphs
    .map((para) => {
      return para
        .replace(/\n/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
    })
    .filter((p) => p.length > 0);

  return cleaned.join('\n\n');
}

/**
 * Extracts visible, linear selection text from reader DOM preserving proper spacing and paragraphs
 * without artificial newlines between words in mirrored, mirror-aligned, or interlinear modes,
 * and preserving complete words even when initial letters contain [Red], [Blue], or [hang:X] BBCode tags.
 * When preferOriginal is true (default for decipher queries), always extracts the original language words.
 */
export function extractSelectionTextFromReader(
  container: HTMLElement,
  selection: Selection,
  preferOriginal: boolean = true
): string {
  if (!selection || selection.rangeCount === 0) return '';
  const range = selection.getRangeAt(0);
  if (!range || range.collapsed) return '';

  const rawSelection = selection.toString();

  const paraEls = Array.from(container.querySelectorAll<HTMLElement>('[id^="reader-para-"]'));
  if (paraEls.length === 0) {
    return cleanCopiedReaderText(rawSelection);
  }

  const paraResultStrings: string[] = [];

  for (const para of paraEls) {
    let intersects = false;
    try {
      intersects = range.intersectsNode(para);
    } catch {
      intersects = selection.containsNode(para, true);
    }
    if (!intersects) continue;

    const wordEls = Array.from(para.querySelectorAll<HTMLElement>('[data-word-idx]'));
    if (wordEls.length === 0) {
      const text = para.innerText || para.textContent || '';
      if (text.trim()) paraResultStrings.push(cleanCopiedReaderText(text.trim()));
      continue;
    }

    const selectedTokensInPara: string[] = [];

    for (const wordEl of wordEls) {
      let isWordSelected = false;
      try {
        isWordSelected = range.intersectsNode(wordEl);
      } catch {
        isWordSelected = selection.containsNode(wordEl, true);
      }

      if (isWordSelected) {
        let tokenText = '';
        if (!preferOriginal) {
          tokenText = wordEl.getAttribute('data-mirror-text') || '';
          if (!tokenText) {
            const mirrorLayer = wordEl.querySelector<HTMLElement>('[data-layer="mirror"]') || wordEl.querySelector<HTMLElement>('[id*="-mw-"]');
            tokenText = (mirrorLayer?.innerText || mirrorLayer?.textContent || wordEl.innerText || wordEl.textContent || '').trim();
          }
        } else {
          // preferOriginal: always extract original language text for deciphering
          tokenText = wordEl.getAttribute('data-orig-text') || '';
          if (!tokenText) {
            const origLayer = wordEl.querySelector<HTMLElement>('[data-layer="orig"]') || wordEl.querySelector<HTMLElement>('[id*="-w-"]');
            tokenText = (origLayer?.innerText || origLayer?.textContent || wordEl.innerText || wordEl.textContent || '').trim();
          }
        }

        if (tokenText) {
          selectedTokensInPara.push(tokenText);
        }
      }
    }

    if (selectedTokensInPara.length > 0) {
      // If user selected only a partial substring of a single word without newlines
      if (selectedTokensInPara.length === 1 && rawSelection && !rawSelection.includes('\n')) {
        const fullWord = selectedTokensInPara[0];
        const trimmedRaw = rawSelection.trim();
        if (preferOriginal) {
          if (fullWord.includes(trimmedRaw) && trimmedRaw.length < fullWord.length) {
            paraResultStrings.push(trimmedRaw);
            continue;
          } else {
            paraResultStrings.push(fullWord);
            continue;
          }
        } else {
          if (fullWord.includes(trimmedRaw) && trimmedRaw.length < fullWord.length) {
            paraResultStrings.push(trimmedRaw);
            continue;
          }
        }
      }

      paraResultStrings.push(selectedTokensInPara.join(' '));
    }
  }

  if (paraResultStrings.length > 0) {
    return paraResultStrings.join('\n\n');
  }

  return cleanCopiedReaderText(rawSelection);
}


