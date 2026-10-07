// Calque ("mirror translation") notation — one English token per source chunk:
//   The plant, which grows, drives a shoot to-the right,
//   it draws[1:distinguishes] them out[1] before the goat-herds.
// `word[n:meaning]` opens composite group n (separable verbs, tmesis) and
// `word[n]` adds later parts. Groups are numbered per sentence.
// Markup tags ([Red], [hang:5]) may appear inside tokens and are kept.

import { COLORS, parseMarkup, type Markup } from '../text/markup';

const MARKUP_NAMES = new Set([...Object.keys(COLORS), 'hang']);
const TAG_RE = /\[([A-Za-z0-9_-]{1,8})(?::([^\]\n]*))?\]/g;
const HOST_RE = /[\p{L}\p{M}\p{N}]/u;

export interface Slot {
  gloss: Markup; // display text (tag removed) with its own markup runs
  tag?: string; // composite group number as written
  meaning?: string; // compound meaning (only on the first part)
}

/**
 * Parses one calque token. `source` is the aligned source chunk: a bracket
 * that also occurs in the source (e.g. a footnote "Gott[1]") is literal text.
 */
export function parseSlot(raw: string, source = ''): Slot {
  for (const m of raw.matchAll(TAG_RE)) {
    const id = m[1];
    if (MARKUP_NAMES.has(id.toLowerCase())) continue;
    const before = raw.slice(0, m.index);
    if (!HOST_RE.test(parseMarkup(before).plain)) continue;
    if (source.includes(`[${id}`)) continue;
    const rest = before + raw.slice(m.index! + m[0].length);
    const meaning = m[2]?.trim();
    return { gloss: parseMarkup(rest), tag: id, meaning: meaning ? meaning.replace(/[-_]+/g, ' ') : undefined };
  }
  return { gloss: parseMarkup(raw) };
}

export interface CalqueToken {
  text: string;
  line: number; // index of the non-blank line it came from
  lineEnd: boolean;
}

/**
 * Splits raw calque output into whitespace tokens, keeping composite tags such
 * as `saw[1:looked at]` (which may contain spaces) attached to their word.
 */
export function tokenizeCalque(raw: string): CalqueToken[] {
  const out: CalqueToken[] = [];
  let line = 0;
  for (const text of raw.replace(/\r\n?/g, '\n').split('\n')) {
    if (!text.trim()) continue;
    const toks: string[] = [];
    let cur = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '[' && cur && !/\s/.test(cur[cur.length - 1])) {
        const m = /^\[[A-Za-z0-9_-]{1,8}:[^\]\n]*\]/.exec(text.slice(i));
        if (m && !MARKUP_NAMES.has(m[0].slice(1, m[0].indexOf(':')).toLowerCase())) {
          cur += m[0];
          i += m[0].length - 1;
          continue;
        }
      }
      if (/\s/.test(ch)) {
        if (cur) toks.push(cur);
        cur = '';
      } else cur += ch;
    }
    if (cur) toks.push(cur);
    toks.forEach((t, k) => out.push({ text: t, line, lineEnd: k === toks.length - 1 }));
    line++;
  }
  return out;
}

/** Text shown for a slot when only the gloss (no tag) is wanted. */
export const glossText = (raw: string, source = '') => parseSlot(raw, source).gloss.plain;
