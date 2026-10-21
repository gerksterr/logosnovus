// What the text editor fills in for a pasted text: language, title, author,
// tags and prompts — from the text itself and the most similar text already
// in the library. No model is used.

import { langCode } from '../data/selectors';
import { alive, useStore } from '../data/store';
import type { Id } from '../model/types';
import { detectLanguage, guessTitle, knownWork, mostSimilar } from '../text/infer';

export const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German', en: 'English', fr: 'French', la: 'Latin', it: 'Italian', es: 'Spanish', nl: 'Dutch', pt: 'Portuguese',
  grc: 'Ancient Greek', el: 'Greek', he: 'Hebrew', ar: 'Arabic', ru: 'Russian', sa: 'Sanskrit', syc: 'Syriac', cop: 'Coptic',
};

const SIMILAR = 0.12; // calibrated on a real library: same-author texts score 0.15-0.2, others under 0.09

export interface MetaGuess {
  code?: string;
  langId?: Id; // an existing language, if one matches
  langName?: string; // for a language not in the library yet
  title?: string;
  author?: string;
  authorFrom?: string; // why: the similar text's title, or the recognized work
  work?: string;
  similarTitle?: string;
  tags?: string[];
  wordPromptId?: Id;
  passagePromptId?: Id;
}

export function inferMeta(content: string, excludeId?: Id): MetaGuess {
  const s = useStore.getState();
  const out: MetaGuess = {};
  const lang = detectLanguage(content);
  const texts = alive(s.texts).filter((t) => !t.scratch && t.id !== excludeId);
  if (lang) {
    out.code = lang.code;
    const base = lang.code;
    const candidates = alive(s.langs).filter((l) => langCode(l.id).split('-')[0] === base || (base === 'el' && langCode(l.id) === 'grc'));
    const sim = mostSimilar(content, base, texts.map((t) => ({ id: t.id, content: t.content, lang: t.lang, code: langCode(t.lang) })));
    const similar = sim && sim.score >= SIMILAR ? s.texts[sim.id] : undefined;
    if (candidates.length) {
      const used = (id: Id) => texts.filter((t) => t.lang === id).length;
      out.langId = (similar && candidates.some((c) => c.id === similar.lang) ? similar.lang : candidates.sort((a, b) => used(b.id) - used(a.id))[0].id) as Id;
    } else out.langName = LANGUAGE_NAMES[base];
    if (similar) {
      out.similarTitle = similar.title;
      if (similar.author) [out.author, out.authorFrom] = [similar.author, `like “${similar.title}”`];
      if (similar.tags?.length) out.tags = similar.tags;
      out.wordPromptId = similar.wordPromptId;
      out.passagePromptId = similar.passagePromptId;
    }
    const work = knownWork(content, base);
    if (work) {
      out.work = work.work;
      if (!out.author && work.author) [out.author, out.authorFrom] = [work.author, work.work ? `recognized: ${work.work}` : 'recognized'];
    }
  }
  const title = guessTitle(content);
  if (title) out.title = title;
  return out;
}
