// Opening a word or passage: show saved versions if any, join a running
// request, or start a new one. Every entry point (clicks, selection bar,
// context menu, notes, dock) goes through here.

import { useSettings } from '../app/settings';
import { useUI } from '../app/ui';
import { docFor, sentenceAround, targetKey, versionsFor, type Target } from '../data/selectors';
import { getRec } from '../data/store';
import { markSeen, runningFor, startLookup, useQueries } from '../llm/queries';
import type { Composite } from '../calque/composites';
import { compositeQuery } from '../calque/composites';
import type { Doc } from '../text/document';

export function openTarget(target: Target, opts: { fresh?: boolean; dict?: boolean; promptId?: string; modelId?: string } = {}) {
  const key = targetKey(target);
  const versions = versionsFor(target);
  const running = runningFor(key);
  const dict = opts.dict ?? (target.kind === 'word' && useSettings.getState().lookup === 'dict' && !opts.fresh);
  if (dict) {
    useUI.setState({ sheet: { target, mode: 'dict' } });
    return;
  }
  if (running && !opts.fresh) {
    useUI.setState({ sheet: { target, queryId: running.id, mode: 'view' } });
    return;
  }
  if (versions.length && !opts.fresh) {
    // A finished, unseen query for this target is cleared from the dock by viewing it.
    const done = useQueries.getState().queries.find((q) => q.key === key && q.status === 'done');
    if (done) markSeen(done.id);
    useUI.setState({ sheet: { target, mode: 'view' } });
    return;
  }
  const queryId = startLookup(target, { promptId: opts.promptId, modelId: opts.modelId });
  useUI.setState({ sheet: { target, queryId: queryId ?? undefined, mode: queryId ? 'view' : 'web', modelId: opts.modelId } });
}

export function wordTarget(textId: string, doc: Doc, wi: number): Target | null {
  const text = getRec('texts', textId);
  const w = doc.words[wi];
  if (!text || !w || !w.letters) return null;
  let word = w.text;
  // keep a Greek elision mark (ἐπ’) so the lookup sees the elided form
  if (/[Ͱ-Ͽἀ-῿]/.test(word) && /^[’'᾽]/.test(doc.plain.slice(w.end, w.end + 1))) word += '’';
  return { kind: 'word', textId, lang: text.lang, text: word, anchor: [w.start, w.end], sentence: sentenceAround(doc, w.start, w.end) };
}

export function passageTarget(textId: string, doc: Doc, [a, b]: [number, number]): Target | null {
  const text = getRec('texts', textId);
  const passage = doc.plain.slice(a, b).trim();
  if (!text || !passage) return null;
  return { kind: 'passage', textId, lang: text.lang, text: passage, anchor: [a, b] };
}

export function compositeTarget(textId: string, doc: Doc, comp: Composite): Target | null {
  const text = getRec('texts', textId);
  if (!text) return null;
  const first = doc.chunks[comp.members[0]];
  const last = doc.chunks[comp.members[comp.members.length - 1]];
  return { kind: 'word', textId, lang: text.lang, text: compositeQuery(doc, comp), anchor: [first.start, last.end], sentence: sentenceAround(doc, first.start, last.end) };
}

/** Opens a saved translation by id (notes list, dock). */
export function openTranslation(id: string) {
  const t = getRec('translations', id);
  if (!t) return;
  const text = getRec('texts', t.textId);
  const doc = text ? docFor(text) : null;
  useUI.setState({
    sheet: {
      target: { kind: t.kind, textId: t.textId, lang: t.lang, text: t.target, anchor: t.anchor, sentence: doc && t.anchor ? sentenceAround(doc, t.anchor[0], t.anchor[1]) : undefined },
      versionId: id,
      mode: 'view',
    },
  });
}
