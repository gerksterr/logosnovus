import { TextItem, MirrorTranslationData, MirrorTranslationParagraph, MirrorWordPair, MirrorCompositeLink, MirrorCompositePartner } from '../types';
import { parseParagraph, cleanWordToken, stripFormattingTags, splitTextIntoParagraphs } from './textUtils';

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
6. Keep non-translated punctuation and signs (periods, commas, quotation marks, footnote numbers [1], [a], brackets) attached to their corresponding words (e.g., "out[1:distinguishes]," or "out,[1:distinguishes]").
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
  // Match whitespace-separated tokens (keeping punctuation attached)
  const tokens = clean.split(/\s+/).filter((t) => t.length > 0);
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
 */
export function parseMirrorToken(rawToken: string): ParsedMirrorTokenInfo {
  if (!rawToken) {
    return { raw: '', separatedGloss: '' };
  }

  // Regex pattern supporting [id:compound], [id=compound], [id], {id:compound}, <id:compound>
  const compositeMatch = rawToken.match(
    /^([^\[\{<]+?)(?:\[([a-zA-Z0-9_-]+)(?:[:=]([^\]]+))?\]|\{([a-zA-Z0-9_-]+)(?:[:=]([^\}]+))?\}|<([a-zA-Z0-9_-]+)(?:[:=]([^>]+))?>)(.*)$/
  );

  if (compositeMatch) {
    const prefixWord = compositeMatch[1] || '';
    const id = compositeMatch[2] || compositeMatch[4] || compositeMatch[6] || '';
    const compoundRaw = compositeMatch[3] || compositeMatch[5] || compositeMatch[7] || '';
    const trailingPunct = compositeMatch[8] || '';

    const separatedGloss = `${prefixWord}${trailingPunct}`;
    const compoundMeaning = compoundRaw ? compoundRaw.replace(/[-_]/g, ' ').trim() : undefined;

    return {
      raw: rawToken,
      separatedGloss,
      compositeId: id.trim(),
      compoundMeaning,
    };
  }

  return {
    raw: rawToken,
    separatedGloss: rawToken,
  };
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

    origWordTokens.forEach((token, wIdx) => {
      if (token.type !== 'word') return;
      const origWord = token.plainText;
      const cleanOrig = token.cleanWord;

      let rawTransToken = '';
      if (canUseStrictParagraphMode && wIdx < paraMirrorTokens.length) {
        rawTransToken = paraMirrorTokens[wIdx];
        globalMirrorTokenIdx++;
      } else if (globalMirrorTokenIdx < allMirrorTokens.length) {
        rawTransToken = allMirrorTokens[globalMirrorTokenIdx++];
      } else {
        rawTransToken = cleanOrig;
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

    // 4. Resolve Discontinuous Composite Word Groups in this paragraph
    const compositeGroups: Record<
      string,
      {
        indices: number[];
        compoundMeaning?: string;
      }
    > = {};

    tempCompositeTokens.forEach((info, wIdx) => {
      if (!info || !info.compositeId) return;
      const id = info.compositeId;
      if (!compositeGroups[id]) {
        compositeGroups[id] = { indices: [] };
      }
      compositeGroups[id].indices.push(wIdx);
      if (info.compoundMeaning && !compositeGroups[id].compoundMeaning) {
        compositeGroups[id].compoundMeaning = info.compoundMeaning;
      }
    });

    // Assign composite links with partners and badges
    let groupCounter = 1;
    Object.entries(compositeGroups).forEach(([groupId, groupData]) => {
      const { indices, compoundMeaning } = groupData;
      if (indices.length < 2) {
        // Even single tagged words can retain their compound gloss if specified
      }

      const allPartsOrig = indices.map((idx) => words[idx]?.orig || '');
      const allPartsSeparated = indices.map((idx) => words[idx]?.trans || '');
      const fallbackCompound = compoundMeaning || allPartsSeparated.join(' ');
      const currentGroupNum = groupCounter++;

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
          id: groupId,
          groupIndex: currentGroupNum,
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
 * Formats an aligned MirrorWordPair back to its serializable token representation
 * (including composite brackets if present).
 */
export function formatMirrorWordToCalqueToken(word: MirrorWordPair): string {
  if (word.composite) {
    const sep = word.composite.separatedMeaning || word.trans;
    const comp = word.composite.compoundMeaning;
    const id = word.composite.id || '1';
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
