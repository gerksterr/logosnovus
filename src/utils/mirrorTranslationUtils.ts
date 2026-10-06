import { TextItem, MirrorTranslationData, MirrorTranslationParagraph, MirrorWordPair, MirrorCompositeLink, MirrorCompositePartner } from '../types';
import { parseParagraph, cleanWordToken, stripFormattingTags, splitTextIntoParagraphs, splitGluedWords } from './textUtils';

/**
 * Builds a token-minimized, precision prompt for generating an etymological calque (mirror translation)
 * with robust support for separated/discontinuous composite words (separable verbs, tmesis, split particles).
 */
export function buildTokenOptimizedMirrorPrompt(
  content: string,
  language?: string
): { systemInstruction: string; prompt: string; userInstructionPrompt: string } {
  const langLabel = language ? ` (${language})` : '';

  const systemInstruction = `You are a philological translator producing a strict word-for-word etymological calque (mirror translation) in English.
Your goal is 1:1 token alignment with the foreign source text, with explicit bracket notation for discontinuous composite words (separable verbs, phrasal verbs, split compounds).`;

  const userInstructionPrompt = `TASK: Output a strict word-for-word mirror translation (etymological calque) in English for the following text${langLabel}.

CRITICAL 1:1 ALIGNMENT & COMPOSITE RULES:
1. Match each foreign word with EXACTLY ONE English token in the exact same linear word-by-word order.
2. NEVER output two space-separated English words for a single foreign word. If an original word translates to multiple English words, connect them with a hyphen (e.g., "to-the", "of-the", "end-bud", "further-grow", "in-the", "trunk-like", "at-last", "even-measured", "over-tension").
3. Translate strictly word-by-word at each word's exact sequential position.

4. COMPOSITE DISCONTINUOUS WORDS (Separable Verbs / Split Particles / Tmesis):
   When two or more words in a sentence are separated but together form a composite word or separable verb (e.g., German "zeichnet ... aus" from "auszeichnen", "gab ... nach" from "nachgeben", "schrieb ... nieder" from "niederschreiben", "hängt ... an" from "anhängen"):
   - SCOPE: Composite group IDs are scoped per SENTENCE. Mark different composite groups within the SAME sentence with different numbers (e.g., [1], [2]). Numbering can reset back to [1] for a new sentence, or continue sequentially.
   - For the FIRST separated part, output its literal separated gloss with bracketed ID and compound meaning:
     Format: first_part[id:compound_meaning]
   - For SUBSEQUENT separated parts of the SAME composite group, output ONLY the bracketed ID number (do NOT repeat the compound meaning):
     Format: next_part[id]
   - Examples:
     • Source: "Bildung nennen sie’s, es zeichnet sie aus vor den Ziegenhirten."
       Output: "Culture call they-it, it draws[1:distinguishes] them out[1] before the goat-herds."
     • Source: "Er gab dem Drängen endlich nach."
       Output: "He gave[1:yielded] to-the urging finally after[1]."
     • Source: "Sie schrieben die Worte nieder."
       Output: "They wrote[1:recorded] the words down[1]."

5. Maintain identical paragraph breaks (empty lines) and sentence boundaries.
6. Keep non-translated punctuation and signs (periods, commas, quotation marks, brackets) attached to their corresponding words (e.g., "out[1:distinguishes]," or "out,[1:distinguishes]"). Textual apparatus notes, manuscript variants, or editorial brackets in the source text (e.g., [RP: –], [RP: ὑμᾶς], [1], [note]) are NOT composite words. Maintain 1:1 token correspondence for all bracketed text and tokens.
7. Translate language-specific signs: Greek ';' becomes '?', Greek '·' becomes ';' or ':', Hebrew '־' becomes '-'.
8. Output ONLY the mirrored English text without any explanations, prefaces, notes, or commentary.

TEXT:
${content}`;

  return {
    systemInstruction,
    prompt: userInstructionPrompt,
    userInstructionPrompt,
  };
}

/**
 * Normalizes Greek / Hebrew / special punctuation according to calque rules.
 */
export function normalizeCalquePunctuation(text: string): string {
  if (!text) return '';
  return text
    .replace(/;/g, '?') // Greek erotimatiko to ?
    .replace(/·/g, ';') // Greek ano teleia to ;
    .replace(/־/g, '-'); // Hebrew maqaf to hyphen
}

/**
 * Extracts words and attached punctuation from a mirror text line.
 */
export function tokenizeMirrorWords(line: string): string[] {
  const clean = stripFormattingTags(line).trim();
  if (!clean) return [];
  // Match composite tokens that have a host word with letters/numbers before the bracketed compound tag:
  // e.g. draws[1:distinguishes between], out[1], gave{1=yielded}
  // Standalone brackets like [RP: –], [1], [editorial note] are NOT composite tags and are split by whitespace.
  const tokenRegex = /(?:[^\s\[\{<]*[\p{L}\p{M}\p{N}][^\s\[\{<]*(?:\[[a-zA-Z0-9_-]+[:=][^\]]+\]|\{[a-zA-Z0-9_-]+[:=][^\}]+\}|<[a-zA-Z0-9_-]+[:=][^>]+>)[^\s]*|[^\s]+)/gu;
  const rawTokens = clean.match(tokenRegex) || [];
  const tokens: string[] = [];
  for (const t of rawTokens) {
    tokens.push(...splitGluedWords(t));
  }
  return tokens;
}

/**
 * Parsed representation of a raw mirror token, separating literal gloss from composite link metadata.
 */
export interface ParsedMirrorTokenInfo {
  raw: string;
  separatedGloss: string; // The literal token (e.g. "draws" or "out")
  compositeId?: string; // Link ID (e.g. "1", "2", "auszeichnen")
  compoundMeaning?: string; // Unified compound meaning (e.g. "distinguishes")
}

/**
 * Parses a single mirror token string that might contain composite notation:
 * Examples:
 * - "draws[1:distinguishes]" -> separated: "draws", id: "1", compound: "distinguishes"
 * - "out[1:distinguishes]," -> separated: "out,", id: "1", compound: "distinguishes"
 * - "out[1]" -> separated: "out", id: "1", compound: undefined
 * - "gave{1=yielded}" -> separated: "gave", id: "1", compound: "yielded"
 * - "standard-word," -> separated: "standard-word,", id: undefined
 * - "[RP: –]", "[1]", "[He]" -> separated: "[RP: –]", id: undefined (standalone brackets are NOT composite words)
 */
export function parseMirrorToken(rawToken: string): ParsedMirrorTokenInfo {
  if (!rawToken) {
    return { raw: '', separatedGloss: '' };
  }

  // Regex pattern supporting prefixWord[id:compound], prefixWord[id], {id:compound}, <id:compound>
  const compositeMatch = rawToken.match(
    /^([^\[\{<]*?)(?:\[([a-zA-Z0-9_-]+)(?:[:=]([^\]]+))?\]|\{([a-zA-Z0-9_-]+)(?:[:=]([^\}]+))?\}|<([a-zA-Z0-9_-]+)(?:[:=]([^>]+))?>)(.*)$/
  );

  if (compositeMatch) {
    const prefixWord = compositeMatch[1] || '';
    const id = compositeMatch[2] || compositeMatch[4] || compositeMatch[6] || '';
    const compoundRaw = compositeMatch[3] || compositeMatch[5] || compositeMatch[7] || '';
    const trailingPunct = compositeMatch[8] || '';

    // A valid composite/separable word link MUST have a host word with actual word characters (letters/numbers).
    // Standalone brackets like [RP: –], [RP: you], [1], [He], [note] without a host word are textual apparatus / editorial brackets,
    // NOT composite word links!
    const cleanHost = cleanWordToken(prefixWord);
    if (cleanHost.length > 0) {
      const separatedGloss = `${prefixWord}${trailingPunct}`;
      const compoundMeaning = compoundRaw ? compoundRaw.replace(/[-_]/g, ' ').trim() : undefined;

      return {
        raw: rawToken,
        separatedGloss,
        compositeId: id.trim(),
        compoundMeaning,
      };
    }
  }

  return {
    raw: rawToken,
    separatedGloss: rawToken,
  };
}

/**
 * Common abbreviations across German, English, Latin, and Biblical citations
 * that end with a period but do NOT terminate a sentence.
 */
const COMMON_ABBREVIATIONS = new Set([
  'z.b', 'd.h', 'u.a', 'bzw', 'usw', 'vgl', 'ca', 'vs', 'etc', 'eg', 'ie', 'al',
  'dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'jr', 'sr', 'vol', 'no', 'cf', 'ibid',
  'op', 'cit', 'v', 'vv', 'ch', 'gen', 'ex', 'lev', 'num', 'deut', 'matt', 'mark',
  'luke', 'john', 'rom', 'cor', 'gal', 'eph', 'phil', 'col', 'thess', 'tim', 'tit',
  'heb', 'pet', 'rev'
]);

/**
 * Detects whether a word token at index wIdx terminates a sentence within a paragraph.
 * Supports multilingual terminal punctuation (., ?, !, …, ׃, ;, 。, ！, ？),
 * quotation marks/brackets following punctuation, and guards against false sentence
 * breaks on standard abbreviations and initials.
 */
export function isWordSentenceTerminator(
  wIdx: number,
  words: { orig: string; trans: string; cleanOrig?: string; cleanTrans?: string }[],
  origWordTokens?: { plainText?: string; raw?: string; cleanWord?: string }[]
): boolean {
  if (wIdx >= words.length - 1) {
    return true; // Last word of paragraph is always the end of a sentence
  }

  const currentWord = words[wIdx];
  if (!currentWord) return false;

  const origText = origWordTokens?.[wIdx]?.plainText || currentWord.orig || '';
  const transText = currentWord.trans || '';

  // Terminal sentence punctuation regex:
  // Matches ., ?, !, …, ׃, ;, 。, ！, ？ followed by optional closing quotes/brackets/dashes
  const TERMINAL_PUNCT_REGEX = /[\.?!…׃;。？！][”"’'»«›‹\)\}\]—–-]*$/u;

  const origHasTerminal = TERMINAL_PUNCT_REGEX.test(origText.trim());
  const transHasTerminal = TERMINAL_PUNCT_REGEX.test(transText.trim());

  if (!origHasTerminal && !transHasTerminal) {
    return false;
  }

  // If the terminal mark is specifically a period (and not ?, !, ׃, etc.),
  // check if it's an abbreviation, initial, or ordinal number
  const endsWithPeriodOnly =
    /\.[”"’'»«›‹\)\}\]—–-]*$/u.test(origText.trim()) &&
    !/[\?!…׃;。？！]/u.test(origText.trim()) &&
    !/[\?!…׃;。？！]/u.test(transText.trim());

  if (endsWithPeriodOnly) {
    const cleanOrig = (currentWord.cleanOrig || origWordTokens?.[wIdx]?.cleanWord || '').toLowerCase().trim();
    const cleanTrans = (currentWord.cleanTrans || '').toLowerCase().trim();

    // Check known abbreviation dictionary
    if (COMMON_ABBREVIATIONS.has(cleanOrig) || COMMON_ABBREVIATIONS.has(cleanTrans)) {
      return false;
    }

    // Check single capital initial like "A.", "B.", "J."
    if (/^[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u0590-\u05FF]$/u.test(cleanOrig)) {
      return false;
    }

    // Check ordinal number or decimal like "1.", "2."
    if (/^\d+$/.test(cleanOrig)) {
      return false;
    }

    // If next word does not start with an uppercase letter, quotation mark, or opening bracket,
    // it's likely part of the same sentence (e.g. abbreviation or mid-sentence dot)
    const nextWord = words[wIdx + 1];
    if (nextWord) {
      const nextOrig = origWordTokens?.[wIdx + 1]?.plainText || nextWord.orig || '';
      const nextTrans = nextWord.trans || '';
      const nextStartsUpper =
        /^["'“‘«»‹›\(\[\{]*[\p{Lu}\p{Lt}\d]/u.test(nextOrig.trim()) ||
        /^["'“‘«»‹›\(\[\{]*[\p{Lu}\p{Lt}\d]/u.test(nextTrans.trim());

      if (!nextStartsUpper) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Robustly parses a mirror text into aligned MirrorTranslationData against the original text,
 * automatically resolving composite links and discontinuous words across each paragraph.
 */
export function parseMirrorCalqueText(
  originalRawText: string,
  mirrorRawText: string,
  textId: string,
  sourceModel?: string,
  existingData?: MirrorTranslationData | null
): MirrorTranslationData {
  const existingUntranslated = existingData?.untranslatedWords || [];
  const existingReplacements = existingData?.passageReplacements || [];
  const existingCompositePref = existingData?.compositeDisplayMode || 'separated';

  // 1. Split original text into paragraphs exactly as TextReaderView does
  const rawOrigParas = splitTextIntoParagraphs(originalRawText);

  // 2. Extract all mirror tokens across the entire mirror text for global continuous stream alignment
  const allMirrorTokens = tokenizeMirrorWords(mirrorRawText);
  let globalMirrorTokenIdx = 0;

  // 3. Split mirror text into paragraphs
  const rawMirrorParas = splitTextIntoParagraphs(mirrorRawText);

  // Check if mirror paragraphs match original non-empty paragraphs
  const origNonEmptyIndices = rawOrigParas
    .map((p, idx) => ({ text: p.trim(), idx }))
    .filter((item) => item.text.length > 0);

  const mirrorNonEmptyParas = rawMirrorParas
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const canUseStrictParagraphMode =
    origNonEmptyIndices.length === mirrorNonEmptyParas.length &&
    origNonEmptyIndices.length > 0;

  const resultParagraphs: MirrorTranslationParagraph[] = [];

  rawOrigParas.forEach((origPara, pIdx) => {
    const trimmedOrig = origPara.trim();
    if (!trimmedOrig) {
      resultParagraphs.push({
        paraIndex: pIdx,
        words: [],
        rawMirrorText: '',
      });
      return;
    }

    const parsedOrig = parseParagraph(origPara, pIdx);
    const origWordTokens = parsedOrig.tokens.filter((t) => t.type === 'word');

    let paraMirrorTokens: string[] = [];
    let mirrorParaRaw = '';

    if (canUseStrictParagraphMode) {
      const nonBlankIdx = origNonEmptyIndices.findIndex((item) => item.idx === pIdx);
      if (nonBlankIdx >= 0 && nonBlankIdx < mirrorNonEmptyParas.length) {
        mirrorParaRaw = mirrorNonEmptyParas[nonBlankIdx];
        paraMirrorTokens = tokenizeMirrorWords(mirrorParaRaw);
      }
    }

    const words: MirrorWordPair[] = [];
    // Track parsed composite token info before grouping
    const tempCompositeTokens: (ParsedMirrorTokenInfo | null)[] = [];
    let paraMirrorIdx = 0;

    origWordTokens.forEach((token, wIdx) => {
      if (token.type !== 'word') return;
      const origWord = token.plainText;
      const cleanOrig = token.cleanWord;
      const isOrigWordReal = cleanOrig.length > 0;

      let rawTransToken = '';
      if (canUseStrictParagraphMode) {
        // If the original token is a real word, but the current mirror token is pure punctuation
        // (e.g. standalone '-', '—', '"-', '--'), attach it as trailing punctuation to the previous word
        // and advance so the real mirror word aligns with the real foreign word.
        while (
          isOrigWordReal &&
          paraMirrorIdx < paraMirrorTokens.length &&
          cleanWordToken(paraMirrorTokens[paraMirrorIdx]) === ''
        ) {
          const punctToken = paraMirrorTokens[paraMirrorIdx++];
          if (words.length > 0) {
            words[words.length - 1].trans += punctToken;
            words[words.length - 1].cleanTrans = cleanWordToken(words[words.length - 1].trans);
          }
        }

        // If the original token is pure punctuation (e.g. standalone '.', '–]', '/'),
        // but the current mirror token is a REAL word (the translation omitted or attached the punctuation),
        // do not consume the real mirror word for the punctuation token.
        if (
          !isOrigWordReal &&
          paraMirrorIdx < paraMirrorTokens.length &&
          cleanWordToken(paraMirrorTokens[paraMirrorIdx]) !== ''
        ) {
          rawTransToken = origWord;
        } else if (paraMirrorIdx < paraMirrorTokens.length) {
          rawTransToken = paraMirrorTokens[paraMirrorIdx++];
          globalMirrorTokenIdx++;
        } else {
          rawTransToken = cleanOrig || origWord;
        }
      } else {
        while (
          isOrigWordReal &&
          globalMirrorTokenIdx < allMirrorTokens.length &&
          cleanWordToken(allMirrorTokens[globalMirrorTokenIdx]) === ''
        ) {
          const punctToken = allMirrorTokens[globalMirrorTokenIdx++];
          if (words.length > 0) {
            words[words.length - 1].trans += punctToken;
            words[words.length - 1].cleanTrans = cleanWordToken(words[words.length - 1].trans);
          }
        }

        if (
          !isOrigWordReal &&
          globalMirrorTokenIdx < allMirrorTokens.length &&
          cleanWordToken(allMirrorTokens[globalMirrorTokenIdx]) !== ''
        ) {
          rawTransToken = origWord;
        } else if (globalMirrorTokenIdx < allMirrorTokens.length) {
          rawTransToken = allMirrorTokens[globalMirrorTokenIdx++];
        } else {
          rawTransToken = cleanOrig || origWord;
        }
      }

      const parsedTokenInfo = parseMirrorToken(rawTransToken);
      tempCompositeTokens.push(parsedTokenInfo);

      const transWord = parsedTokenInfo.separatedGloss || cleanOrig;
      const existingPair = existingData?.paragraphs?.[pIdx]?.words?.[wIdx];
      const isWordKeepOrig = Boolean(
        existingPair?.keepOrig ||
        (cleanOrig && existingUntranslated.includes(cleanOrig.toLowerCase()))
      );

      words.push({
        orig: origWord,
        trans: transWord,
        cleanOrig,
        cleanTrans: cleanWordToken(transWord),
        keepOrig: isWordKeepOrig,
        preferCompoundInMirror: existingPair?.preferCompoundInMirror,
        passageReplacementId: existingPair?.passageReplacementId,
      });
    });

    // If there are leftover pure punctuation tokens at the end of the paragraph in strict mode,
    // attach them to the last translated word
    if (canUseStrictParagraphMode) {
      while (
        paraMirrorIdx < paraMirrorTokens.length &&
        cleanWordToken(paraMirrorTokens[paraMirrorIdx]) === ''
      ) {
        const punctToken = paraMirrorTokens[paraMirrorIdx++];
        if (words.length > 0) {
          words[words.length - 1].trans += punctToken;
          words[words.length - 1].cleanTrans = cleanWordToken(words[words.length - 1].trans);
        }
      }
    }

    // 4. Resolve Discontinuous Composite Word Groups scoped by Sentence
    // Pre-calculate sentence index for each word in this paragraph
    const wordSentenceIndices: number[] = [];
    let currentSentenceIdx = 0;
    for (let i = 0; i < words.length; i++) {
      wordSentenceIndices.push(currentSentenceIdx);
      if (isWordSentenceTerminator(i, words, origWordTokens)) {
        currentSentenceIdx++;
      }
    }

    interface CompositeGroupBuildInfo {
      groupKey: string;
      sentenceIndex: number;
      rawTagId: string;
      indices: number[];
      compoundMeaning?: string;
    }

    const compositeGroupsMap: Map<string, CompositeGroupBuildInfo> = new Map();

    tempCompositeTokens.forEach((info, wIdx) => {
      if (!info || !info.compositeId) return;
      const sIdx = wordSentenceIndices[wIdx] ?? 0;
      const rawTagId = info.compositeId;

      // Group key is explicitly scoped to the sentence to prevent collisions across different sentences
      let groupKey = `s${sIdx}_${rawTagId}`;

      // If a group with this key already exists in this sentence, but the current token
      // introduces a NEW explicit compound meaning (i.e. first_part[id:different_meaning]),
      // treat it as a distinct composite group within the sentence.
      let existingGroup = compositeGroupsMap.get(groupKey);
      if (
        existingGroup &&
        info.compoundMeaning &&
        existingGroup.compoundMeaning &&
        existingGroup.compoundMeaning.toLowerCase() !== info.compoundMeaning.toLowerCase()
      ) {
        let subCounter = 2;
        while (compositeGroupsMap.has(`${groupKey}_${subCounter}`)) {
          subCounter++;
        }
        groupKey = `${groupKey}_${subCounter}`;
        existingGroup = compositeGroupsMap.get(groupKey);
      }

      if (!existingGroup) {
        const newGroup: CompositeGroupBuildInfo = {
          groupKey,
          sentenceIndex: sIdx,
          rawTagId,
          indices: [wIdx],
          compoundMeaning: info.compoundMeaning,
        };
        compositeGroupsMap.set(groupKey, newGroup);
      } else {
        existingGroup.indices.push(wIdx);
        if (info.compoundMeaning && !existingGroup.compoundMeaning) {
          existingGroup.compoundMeaning = info.compoundMeaning;
        }
      }
    });

    // Assign composite links with partners, sentence index, and badges
    const sentenceGroupCounters: Record<number, number> = {};

    compositeGroupsMap.forEach((groupData) => {
      const { groupKey, sentenceIndex, rawTagId, indices, compoundMeaning } = groupData;

      // Only form a composite group if it actually links 2 or more discontinuous parts,
      // or if it explicitly provides a custom compound meaning.
      if (indices.length < 2 && !compoundMeaning) {
        return;
      }

      const allPartsOrig = indices.map((idx) => words[idx]?.orig || '');
      const allPartsSeparated = indices.map((idx) => words[idx]?.trans || '');
      const fallbackCompound = compoundMeaning || allPartsSeparated.join(' ');

      if (!sentenceGroupCounters[sentenceIndex]) {
        sentenceGroupCounters[sentenceIndex] = 1;
      }
      const parsedNum = parseInt(rawTagId, 10);
      const groupNum = !isNaN(parsedNum) && parsedNum > 0 ? parsedNum : sentenceGroupCounters[sentenceIndex]++;

      indices.forEach((wIdx, partIdx) => {
        const currentWord = words[wIdx];
        if (!currentWord) return;

        const partners: MirrorCompositePartner[] = indices
          .filter((otherIdx) => otherIdx !== wIdx)
          .map((otherIdx) => ({
            pIdx,
            wIdx: otherIdx,
            orig: words[otherIdx]?.orig || '',
            cleanOrig: words[otherIdx]?.cleanOrig,
            separatedMeaning: words[otherIdx]?.trans || '',
          }));

        const link: MirrorCompositeLink = {
          id: groupKey,
          rawTagId,
          sentenceIndex,
          groupIndex: groupNum,
          partIndex: partIdx,
          totalParts: indices.length,
          compoundMeaning: fallbackCompound,
          separatedMeaning: currentWord.trans,
          allPartsOrig,
          allPartsSeparated,
          partners,
        };

        currentWord.composite = link;
      });
    });

    resultParagraphs.push({
      paraIndex: pIdx,
      words,
      rawMirrorText: mirrorParaRaw || words.map((w) => formatMirrorWordToCalqueToken(w)).join(' '),
    });
  });

  return {
    id: textId,
    textId,
    paragraphs: resultParagraphs,
    rawCalqueText: mirrorRawText,
    sourceModel: sourceModel || 'custom',
    updatedAt: new Date().toISOString(),
    untranslatedWords: existingUntranslated,
    passageReplacements: existingReplacements,
    compositeDisplayMode: existingCompositePref,
  };
}

/**
 * Calculates the exact foreign text query representation for asking the LLM about a composite word:
 * If there are words between the compound words in the sentence: "{word1} ... {word2} ... {word3} ... etc."
 * If there are no words between the compound words: "{word1} {word2}"
 * (e.g. "Bildung nennen sie’s, es zeichnet sie aus vor den Ziegenhirten" -> "zeichnet ... aus")
 */
export function getCompositeQueryWord(
  composite: MirrorCompositeLink,
  currentWordIdx?: number,
  cleanWord?: string,
  mirrorPara?: MirrorTranslationParagraph
): string {
  if (!composite) return cleanWord || '';

  // 1. If mirrorPara is provided, check the linear paragraph words for this composite group
  if (mirrorPara && composite.id) {
    const groupItems: { wIdx: number; text: string }[] = [];
    mirrorPara.words.forEach((w, idx) => {
      if (w.composite?.id === composite.id) {
        const text = w.cleanOrig || cleanWordToken(w.orig) || w.orig;
        groupItems.push({ wIdx: idx, text });
      }
    });

    if (groupItems.length > 0) {
      groupItems.sort((a, b) => a.wIdx - b.wIdx);
      let result = '';
      for (let i = 0; i < groupItems.length; i++) {
        if (i > 0) {
          const hasWordsBetween = groupItems[i].wIdx - groupItems[i - 1].wIdx > 1;
          result += hasWordsBetween ? ' ... ' : ' ';
        }
        result += groupItems[i].text;
      }
      if (result) return result;
    }
  }

  // 2. Fallback to partners list with index distance checking
  if (composite.partners && composite.partners.length > 0 && currentWordIdx !== undefined) {
    const currentText = cleanWord || composite.allPartsOrig?.[composite.partIndex] || '';
    const parts: { wIdx: number; text: string }[] = [
      { wIdx: currentWordIdx, text: currentText },
      ...composite.partners.map((p) => ({
        wIdx: p.wIdx,
        text: p.cleanOrig || cleanWordToken(p.orig) || p.orig,
      })),
    ].sort((a, b) => a.wIdx - b.wIdx);

    let result = '';
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        const hasWordsBetween = parts[i].wIdx - parts[i - 1].wIdx > 1;
        result += hasWordsBetween ? ' ... ' : ' ';
      }
      result += parts[i].text;
    }
    if (result) return result;
  }

  // 3. Fallback: allPartsOrig joined with ellipses if multiple parts
  if (composite.allPartsOrig && composite.allPartsOrig.length > 1) {
    return composite.allPartsOrig.join(' ... ');
  }

  return composite.allPartsOrig?.[0] || cleanWord || '';
}

/**
 * Formats an aligned MirrorWordPair back to its serializable token representation
 * (including composite brackets if present).
 */
export function formatMirrorWordToCalqueToken(word: MirrorWordPair): string {
  if (word.composite) {
    const sep = word.composite.separatedMeaning || word.trans;
    const comp = word.composite.compoundMeaning;
    const id =
      word.composite.rawTagId ||
      (word.composite.id.startsWith('s') ? word.composite.id.replace(/^s\d+_/, '') : word.composite.id) ||
      '1';
    const isFirstPart = !word.composite.partIndex || word.composite.partIndex === 0;
    if (comp && isFirstPart) {
      const compToken = comp.replace(/\s+/g, '-');
      return `${sep}[${id}:${compToken}]`;
    }
    return `${sep}[${id}]`;
  }
  return word.trans;
}

/**
 * Converts entire MirrorTranslationData back to formatted raw calque text.
 */
export function serializeMirrorDataToRawText(mirrorData: MirrorTranslationData): string {
  if (!mirrorData || !mirrorData.paragraphs) return '';
  return mirrorData.paragraphs
    .map((para) => para.words.map((w) => formatMirrorWordToCalqueToken(w)).join(' '))
    .join('\n\n');
}

/**
 * Validates and repairs existing MirrorTranslationData to ensure that composite groups
 * are strictly scoped by sentence within paragraphs rather than colliding across different sentences.
 */
export function ensureMirrorCompositeSentenceScoping(
  data: MirrorTranslationData,
  originalRawText: string
): MirrorTranslationData {
  if (!data || !data.paragraphs || data.paragraphs.length === 0) return data;

  let needsRepair = false;

  for (let pIdx = 0; pIdx < data.paragraphs.length; pIdx++) {
    const para = data.paragraphs[pIdx];
    if (!para || !para.words || para.words.length === 0) continue;

    const groupSentenceMap = new Map<string, Set<number>>();
    let sIdx = 0;
    for (let wIdx = 0; wIdx < para.words.length; wIdx++) {
      const w = para.words[wIdx];
      if (w.composite) {
        if (!groupSentenceMap.has(w.composite.id)) {
          groupSentenceMap.set(w.composite.id, new Set());
        }
        groupSentenceMap.get(w.composite.id)!.add(sIdx);
      }
      if (isWordSentenceTerminator(wIdx, para.words)) {
        sIdx++;
      }
    }

    // If any composite group spans more than one sentence or lacks sentence prefixing
    for (const [groupId, sentences] of groupSentenceMap.entries()) {
      if (sentences.size > 1 || !groupId.startsWith('s')) {
        needsRepair = true;
        break;
      }
    }
    if (needsRepair) break;
  }

  if (!needsRepair) {
    return data;
  }

  // Re-parse with clean sentence scoping while preserving user keepOrig / passageReplacements / preferences
  const rawCalque = data.rawCalqueText || serializeMirrorDataToRawText(data);
  return parseMirrorCalqueText(originalRawText, rawCalque, data.textId, data.sourceModel, data);
}

/**
 * Pre-computed default mirror translations for sample library texts with composite words included.
 */
export const DEFAULT_SAMPLE_MIRROR_TRANSLATIONS: Record<string, string> = {
  'text-nietzsche-zarathustra-vorrede': `Culture call they-it, it draws[1:distinguishes] them out[1] before the goat-herds. Therefore hear they it unwillingly, when one of contempt speaks. Thus speak I then to their pride: thus speak I to-them of the most-contemptible: but that is the last human.
Thus spoke Zarathustra to the people.`,

  'text-jung-liber-novus-1': `When I of the spirit this time speak, so must I say: he is a great ruler, full of power and violence-deed. He demands utility-value and performance. But the spirit of-the depth requires something else. He leads[1:leads-down] me down[1] into the dark caverns of-the unconscious, where the ancient symbols sleep.

"The soul, my friend, is no picture that one on the wall hangs[2:attaches-to]; she is a desert, full of serpents and scorpions, and yet is she the place, at which the living fountain springs."

As I these words down-wrote, knew I not, that the figures of-my fantasy not only dream-images were, but autonomous beings of-the collective unconscious. Philemon stepped[3:approached] to[3] me and spoke of the image of-the transformation, that in-the secret of-the night hidden lies.`,

  'text-nietzsche-zarathustra': `Three metamorphoses name I to-you of-the spirit: how the spirit to-a camel becomes, and to-a lion the camel, and to-a child finally the lion.

Much heavy is there for-the spirit, the strong, weight-bearing spirit, in-whom reverence dwells[1:inhabits]: after the heaviest and heaviest yearns his strength.

What is heavy? so asks the weight-bearing spirit, so kneels[2:kneels-down] he down[2], to-the camel like, and wants well loaded to-be. What is the heaviest, you heroes? so asks the weight-bearing spirit, that I it upon myself take[3:take-upon-myself] and of-my strength glad become.

But in the loneliest desert happens the second metamorphosis: to-a lion becomes here the spirit, freedom wants he for-himself to-capture and master to-be in his own desert.`,

  'text-paracelsus-alchemy': `The Mysterium Magnum is the motherly-source of-all things, wherein all creatures lying have as in a seed-form. Out-of the Mysterio Magno spring[1:originate-from] the four elements: Fire, Air, Water and Earth.

In the Prima Materia lies the hidden virtue and the secret of-the tincture. Who the mercurium not from the impurity to separate knows, he will the Quinta Essentia nevermore behold.

The Stone of-the Wise is not of gold made, but of the illumination of-the spirit, when the Sol and Luna each-other in-the hermetic vessel unite.`,

  'text-sefer-yetzirah-hebrew': `In-thirty and-two paths wondrous of-wisdom engraved Yah YHWH of-Hosts God of-Israel God living and-King of-Eternity El Shaddai Merciful and-Gracious High and-Exalted Dwelling Eternally and-Holy His-Name Exalted and-Holy is-He.

And-created [He] his-world with-three books: with-text and-number and-telling.

Ten Sefirot of-nothingness and-twenty and-two letters of-foundation: three mothers, seven doubles, and-twelve simples. Ten Sefirot of-nothingness, bridle your-mouth from-speaking and-your-heart from-pondering, and-if ran your-mouth to-speak and-your-heart to-ponder, return to-the-place.`,
};

/**
 * Returns pre-loaded mirror translation data for a given text if available.
 */
export function getInitialSampleMirrorTranslation(text: TextItem): MirrorTranslationData | null {
  const rawMirror = DEFAULT_SAMPLE_MIRROR_TRANSLATIONS[text.id];
  if (!rawMirror) return null;
  return parseMirrorCalqueText(text.content, rawMirror, text.id, 'philological-calque-v1');
}
