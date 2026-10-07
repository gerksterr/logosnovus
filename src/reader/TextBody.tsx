// The reading surface: renders paragraphs and turns pointer input into
// lookups. Display modes are a class on this element, so switching between
// original / mirror / aligned / interlinear never re-renders the text.

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSettings } from '../app/settings';
import { useUI } from '../app/ui';
import { useStore } from '../data/store';
import { compositeTarget, openTarget, openTranslation, wordTarget } from '../sheet/open';
import { copyText, selectionRange, snapToWords } from './dom';
import { useLazyParagraphs } from './lazy';
import { menuItems } from './menu';
import { noteRanges, Paragraph } from './Paragraph';
import { LAYOUT_EVENT, passageAt, useHover } from './PassageLayer';
import type { PassageMark, ReaderData } from './useReader';

export type DisplayMode = 'orig' | 'mirror' | 'aligned' | 'inter';

let lastPointer: string = 'mouse';
addEventListener('pointerdown', (e) => (lastPointer = e.pointerType), { capture: true });

export function TextBody({ data, mode, sel, onSelectWord }: { data: ReaderData; mode: DisplayMode; sel: number; onSelectWord: (wi: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [focus] = useState(() => data.reading?.pos);
  const lazy = useLazyParagraphs(data.doc, ref, focus);
  const s = useSettings();
  const compound = useStore((st) => !!st.prefs.prefs?.compound);
  const { doc } = data;
  const notes = useMemo(() => (s.dimNotes ? noteRanges(doc.plain) : []), [doc, s.dimNotes]);
  const effMode: DisplayMode = data.slots ? mode : 'orig';

  // passages split per paragraph (stable arrays keep paragraph memo hits)
  const perPara = useMemo(() => {
    const out = doc.paras.map(() => [] as PassageMark[]);
    for (const p of data.passages) doc.paras.forEach((para, i) => p.start < para.end && p.end > para.start && out[i].push(p));
    return out;
  }, [doc, data.passages]);
  const empty = useMemo<PassageMark[]>(() => [], []);

  useLayoutEffect(() => {
    dispatchEvent(new Event(LAYOUT_EVENT));
  }, [effMode, s.fontSize, s.lineHeight, s.font, s.width, s.justify]);

  const chunkWord = (el: HTMLElement): number | null => {
    const c = el.closest<HTMLElement>('[data-c]');
    if (!c) return null;
    const chunk = doc.chunks[+c.dataset.c!];
    const w = doc.words.slice(chunk.w0, chunk.w1).findIndex((x) => x.letters);
    return w < 0 ? null : chunk.w0 + w;
  };

  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed && ref.current?.contains(sel.anchorNode)) return; // the user is selecting
    const el = e.target as HTMLElement;
    const badge = el.closest<HTMLElement>('.cb');
    if (badge) {
      const comp = data.comps.get(+badge.dataset.c!);
      const t = comp && compositeTarget(data.text.id, doc, comp);
      if (t) openTarget(t);
      return;
    }
    let wi: number | null = null;
    const w = el.closest<HTMLElement>('[data-w]');
    if (w && !el.closest('.m, .cm')) wi = +w.dataset.w!;
    else if (el.closest('.m, .cm')) wi = chunkWord(el);
    if (wi != null) {
      const t = wordTarget(data.text.id, doc, wi);
      if (t) {
        onSelectWord(wi);
        openTarget(t);
      }
      return;
    }
    const p = el.closest<HTMLElement>('.para');
    const hit = p && passageAt(p, e.clientX, e.clientY);
    if (hit) openTranslation(hit.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target as HTMLElement;
    const overWord = el.closest('[data-w], .m, .cb');
    const p = el.closest<HTMLElement>('.para');
    const key = !overWord && p ? (passageAt(p, e.clientX, e.clientY)?.key ?? null) : null;
    if (useHover.getState().key !== key) useHover.setState({ key });
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (lastPointer !== 'mouse') return; // touch: keep native selection; the selection bar offers actions
    e.preventDefault();
    const el = e.target as HTMLElement;
    const root = ref.current!;
    const range = selectionRange(root, doc);
    const w = el.closest<HTMLElement>('[data-w]');
    const word = w && !el.closest('.m') ? +w.dataset.w! : el.closest('.m') ? chunkWord(el) : null;
    const c = el.closest<HTMLElement>('[data-c]');
    const p = el.closest<HTMLElement>('.para');
    const items = menuItems(data, {
      word: word ?? undefined,
      chunk: c ? +c.dataset.c! : undefined,
      range: range ? snapToWords(doc, range) : undefined,
      passage: p ? passageAt(p, e.clientX, e.clientY) : null,
    });
    if (items.length) useUI.setState({ menu: { x: e.clientX, y: e.clientY, items } });
  };

  const onCopy = (e: React.ClipboardEvent) => {
    const range = selectionRange(ref.current!, doc);
    if (!range) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', copyText(doc, range, data.slots, effMode === 'mirror'));
  };

  const style = {
    '--fs': `${s.fontSize}px`,
    '--lh': s.lineHeight,
    '--w': `${s.width}em`,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`text mode-${effMode}${effMode !== 'orig' ? ' grid' : ''} font-${s.font}${s.justify ? ' justify' : ''}`}
      style={style}
      lang={data.lang?.code}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={() => useHover.setState({ key: null })}
      onContextMenu={onContextMenu}
      onCopy={onCopy}
    >
      {doc.paras.map((_, pi) =>
        lazy.lazy && !lazy.mounted.has(pi) ? (
          <p key={pi} className="para ph" data-p={pi} style={{ height: lazy.estimate(pi, s.fontSize * s.lineHeight) }} />
        ) : (
        <Paragraph
          key={pi}
          doc={doc}
          pi={pi}
          slots={data.slots}
          comps={data.comps}
          keep={data.keep}
          replace={data.replace}
          known={data.known}
          notes={notes}
          compound={compound}
          sel={sel >= 0 && doc.words[sel] && doc.chunks[doc.words[sel].chunk].para === pi ? sel : -1}
          passages={perPara[pi].length ? perPara[pi] : empty}
        />
        ),
      )}
    </div>
  );
}
