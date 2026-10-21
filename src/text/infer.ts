// Guesses for a newly pasted text, without any model: its language (script
// and function words), title (a short first line), and author/work (the most
// similar text already in the library, else a few well-known works).

import { parseMarkup } from './markup';
import { normalize } from './forms';

const STOP: Record<string, string> = {
  de: 'der die das und ist nicht ich du er sie es wir ihr zu den dem des ein eine einen sich mit auf für von als auch wie so was aber noch nur wenn denn dass daß doch über hat sind war mir mich dir dich ihn uns im am vom zum zur meine seine',
  en: 'the and of to is in that it was he for on are with as his they be at this have from or by not but what all were which you my',
  fr: 'le la les de des du et est un une que qui dans pour pas sur au il elle nous vous ne se ce avec son sa ses mais',
  la: 'et in est non ad cum quod qui quae sed ut ex de enim autem esse sunt per ab nec quia hoc eius vel atque sicut deus nos vos',
  it: 'il lo gli di da del della che è un una non per con su come ma più nel alla sono',
  es: 'el los las de del y que en un una es no por con para se su al lo como más pero',
  nl: 'de het een en van is dat die niet ik je hij zij we met op voor aan er maar zijn',
  pt: 'o os as de do da dos das e que em um uma não para com por se mais',
};
const STOP_SETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));

const SCRIPTS: [RegExp, string][] = [
  [/[֐-׿]/, 'he'],
  [/[Ͱ-Ͽἀ-῿]/, 'greek'],
  [/[؀-ۿ]/, 'ar'],
  [/[Ѐ-ӿ]/, 'ru'],
  [/[ऀ-ॿ]/, 'sa'],
  [/[܀-ݏ]/, 'syc'],
  [/[Ⲁ-⳿]/, 'cop'],
  [/[A-Za-zÀ-ɏ]/, 'latin'],
];

export interface LangGuess {
  code: string;
  confidence: number; // 0..1
}

/** Language of a text from its script and, for the Latin alphabet, its function words. */
export function detectLanguage(text: string): LangGuess | null {
  const plain = parseMarkup(text).plain;
  const counts = new Map<string, number>();
  let letters = 0;
  for (const ch of plain) {
    if (!/\p{L}/u.test(ch)) continue;
    letters++;
    const s = SCRIPTS.find(([re]) => re.test(ch))?.[1];
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  if (letters < 3) return null;
  const [script, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const share = n / letters;
  if (script === 'greek') {
    const polytonic = (plain.match(/[ἀ-῿]|[̓̔͂ͅ]/g) ?? []).length;
    return { code: polytonic / Math.max(1, n) > 0.03 ? 'grc' : 'el', confidence: share };
  }
  if (script !== 'latin') return script ? { code: script, confidence: share } : null;
  const words = plain.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  let best = '';
  let hits = 0;
  for (const [code, set] of Object.entries(STOP_SETS)) {
    const h = words.reduce((k, w) => k + (set.has(w) ? 1 : 0), 0);
    if (h > hits) [best, hits] = [code, h];
  }
  if (!best) return null;
  return { code: best, confidence: Math.min(1, (hits / Math.max(1, words.length)) * 3) * share };
}

/** A short first line that reads like a heading; else nothing (the editor falls back to the first words). */
export function guessTitle(text: string): string | null {
  const lines = parseMarkup(text).plain.split('\n');
  const i = lines.findIndex((l) => l.trim());
  if (i < 0) return null;
  const first = lines[i].trim();
  const next = lines[i + 1]?.trim() ?? '';
  if (/^\d+\s/.test(first)) return null; // a numbered verse, not a heading
  if (first.length <= 80 && (!next || !/[.!?;:,]$/.test(first)) && first.split(/\s+/).length <= 12) return first.replace(/[.:]$/, '');
  return null;
}

// ---- similarity to texts already in the library

/** Distinctive words of a text: 5+ letters, normalized, function words dropped. */
export function vocabulary(text: string, code = ''): Set<string> {
  const plain = parseMarkup(text).plain;
  const stop = STOP_SETS[code];
  const out = new Set<string>();
  for (const m of plain.matchAll(/[\p{L}\p{M}]+/gu)) {
    const w = normalize(m[0], code);
    if (w.length >= 5 && !stop?.has(w)) out.add(w);
  }
  return out;
}

/** Cosine similarity of two vocabularies (0..1). */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const w of small) if (big.has(w)) shared++;
  return shared / Math.sqrt(a.size * b.size);
}

export interface Candidate {
  id: string;
  content: string;
  lang: string;
  code: string;
}

/** The library text most like this one, with its score. */
export function mostSimilar(text: string, code: string, library: Candidate[]): { id: string; score: number } | null {
  const v = vocabulary(text, code);
  let best: { id: string; score: number } | null = null;
  for (const c of library) {
    if (code && c.code && c.code.split('-')[0] !== code.split('-')[0]) continue;
    const score = similarity(v, vocabulary(c.content, c.code));
    if (!best || score > best.score) best = { id: c.id, score };
  }
  return best;
}

// ---- a few works recognizable from their names and formulas

const WORKS: { re: RegExp; code: string; author?: string; work: string }[] = [
  { re: /zarathustra/i, code: 'de', author: 'Friedrich Nietzsche', work: 'Also sprach Zarathustra' },
  { re: /\b(Geist der Tiefe|Geist dieser Zeit|Philemon|Ammonios|Izdubar)\b/, code: 'de', author: 'C. G. Jung', work: 'Das Rote Buch (Liber Novus)' },
  { re: /\b(Mephistopheles|Gretchen)\b/, code: 'de', author: 'Johann Wolfgang von Goethe', work: 'Faust' },
  { re: /\b(Paracelsus|Theophrastus|Iliaster|Archeus)\b/, code: '', author: 'Paracelsus', work: '' },
  { re: /μῆνιν|Ἀχιλλ|Πηληϊάδ/, code: 'grc', author: 'Homer', work: 'Iliad' },
  { re: /Σωκράτ/, code: 'grc', author: 'Plato', work: '' },
  { re: /Ἰησοῦ|Χριστ[οόὸῷῶ]|τοῦ θεοῦ/, code: 'grc', work: 'New Testament' },
  { re: /מתני׳|גמ׳|תנו רבנן|מֵאֵימָתַי|אָמַר רַבִּי|אמר רבי/, code: 'he', work: 'Talmud' },
  { re: /יְהוָה|יְהוָ֖ה|אֱלֹהִים/, code: 'he', work: 'Hebrew Bible' },
  { re: /\b(Dominus|Domini|Iesus|Christi)\b/, code: 'la', work: 'Latin Bible (Vulgate)' },
];

/** A famous work recognized by its names or formulas (only in its own language). */
export function knownWork(text: string, code = ''): { author?: string; work: string } | null {
  const head = parseMarkup(text.slice(0, 20000)).plain;
  const hit = WORKS.find((w) => (!w.code || !code || w.code === code.split('-')[0]) && w.re.test(head));
  return hit ? { author: hit.author, work: hit.work } : null;
}
