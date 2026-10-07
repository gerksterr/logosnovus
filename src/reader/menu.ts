// Context actions for a word, selection or passage. Used by the desktop
// right-click menu and the phone selection bar's "More" sheet.

import { askText, type MenuItem } from '../app/ui';
import { alive, getRec, put, useStore } from '../data/store';
import { versionsFor } from '../data/selectors';
import { wordKey } from '../text/document';
import { compositeTarget, openTarget, openTranslation, passageTarget, wordTarget } from '../sheet/open';
import type { HitShape } from './PassageLayer';
import type { ReaderData } from './useReader';

export interface MenuContext {
  word?: number; // word index
  chunk?: number;
  range?: [number, number]; // selected plain range (snapped)
  passage?: HitShape | null; // innermost saved passage at the pointer
}

const SPEECH_LANG: Record<string, string> = { grc: 'el-GR', arc: 'he-IL', la: 'it-IT' };

export function speak(text: string, code?: string) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  if (code) u.lang = SPEECH_LANG[code] ?? code;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function setReading(textId: string, change: (r: { keep: number[]; keepWords: string[]; replace: { start: number; end: number; text: string }[] }) => void) {
  const cur = useStore.getState().readings[textId];
  const r = { keep: [...(cur?.keep ?? [])], keepWords: [...(cur?.keepWords ?? [])], replace: [...(cur?.replace ?? [])] };
  change(r);
  put('readings', { ...(cur && !cur.deleted ? cur : {}), id: textId, updatedAt: 0, ...r });
}

const webModel = () => alive(useStore.getState().models).find((m) => m.provider === 'web');

export function menuItems(data: ReaderData, ctx: MenuContext): MenuItem[] {
  const { doc, text } = data;
  const items: MenuItem[] = [];
  const word = ctx.word != null ? wordTarget(text.id, doc, ctx.word) : null;
  const chunk = ctx.chunk ?? (ctx.word != null ? doc.words[ctx.word].chunk : undefined);
  const comp = chunk != null ? data.comps.get(chunk) : undefined;
  const web = webModel();

  if (ctx.range) {
    const t = passageTarget(text.id, doc, ctx.range);
    if (t) {
      const saved = versionsFor(t).length > 0;
      items.push({ label: saved ? 'Open saved passage translation' : 'Translate passage', icon: 'scroll', run: () => openTarget(t) });
      if (saved) items.push({ label: 'New passage translation', icon: 'refresh', run: () => openTarget(t, { fresh: true }) });
      if (web) items.push({ label: `Ask in ${web.name || web.model}`, icon: 'globe', run: () => openTarget(t, { fresh: true, modelId: web.id }) });
    }
  }
  if (word) {
    const saved = versionsFor(word).length > 0;
    items.push({ label: saved ? `Open “${word.text}”` : `Translate “${word.text}”`, icon: 'languages', run: () => openTarget(word, { dict: false }) });
    if (saved) items.push({ label: 'New translation', icon: 'refresh', run: () => openTarget(word, { fresh: true }) });
    items.push({ label: 'Quick dictionary', icon: 'book', run: () => openTarget(word, { dict: true }) });
    if (web) items.push({ label: `Ask in ${web.name || web.model}`, icon: 'globe', run: () => openTarget(word, { fresh: true, modelId: web.id }) });
    items.push({ label: 'Speak', icon: 'volume', run: () => speak(word.text, data.lang?.code) });
  }
  if (comp) {
    const t = compositeTarget(text.id, doc, comp);
    if (t) items.push({ label: `Translate “${t.text}”`, icon: 'link', run: () => openTarget(t) });
  }
  if (ctx.passage) {
    const id = ctx.passage.id;
    items.push({ label: 'Open passage translation here', icon: 'scroll', run: () => openTranslation(id) });
  }
  if (data.slots && chunk != null) {
    const c = doc.chunks[chunk];
    const kept = data.keep.has(chunk);
    const keys = doc.words.slice(c.w0, c.w1).map((w) => wordKey(w.text));
    const everywhere = keys.some((k) => data.reading?.keepWords?.includes(k));
    items.push({
      label: kept ? 'Show calque here again' : 'Keep original here (mirror)',
      icon: 'pin',
      run: () =>
        setReading(text.id, (r) => {
          r.keep = kept ? r.keep.filter((x) => x !== c.start) : [...r.keep, c.start];
          if (kept) r.keepWords = r.keepWords.filter((k) => !keys.includes(k));
        }),
    });
    if (!everywhere && keys.length)
      items.push({ label: `Keep “${doc.words[c.w0]?.text}” original everywhere`, icon: 'pin', run: () => setReading(text.id, (r) => void r.keepWords.push(...keys)) });
  }
  if (data.slots && ctx.range) {
    const [a, b] = ctx.range;
    const existing = data.reading?.replace?.find((r) => r.start < b && r.end > a);
    items.push({
      label: existing ? 'Edit mirror replacement…' : 'Replace mirror text…',
      icon: 'edit',
      run: async () => {
        const value = await askText('Mirror text for this passage', existing?.text ?? doc.plain.slice(a, b));
        if (value == null) return;
        setReading(text.id, (r) => {
          r.replace = r.replace.filter((x) => !(x.start < b && x.end > a));
          if (value.trim()) r.replace.push({ start: a, end: b, text: value.trim() });
        });
      },
    });
    if (existing)
      items.push({ label: 'Remove mirror replacement', icon: 'trash', danger: true, run: () => setReading(text.id, (r) => void (r.replace = r.replace.filter((x) => x !== r.replace.find((y) => y.start === existing.start)))) });
  }
  if (word) {
    const lang = getRec('langs', text.lang);
    const anchor = (lang?.name ?? '').replace(/ /g, '_');
    items.push({ label: 'Wiktionary', icon: 'external', run: () => open(`https://en.wiktionary.org/wiki/${encodeURIComponent(word.text)}${anchor ? `#${anchor}` : ''}`, '_blank', 'noopener') });
  }
  return items;
}
