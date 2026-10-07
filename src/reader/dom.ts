// Bridges the rendered text and plain-text offsets.
//
// Every text-bearing span of the original layer carries data-o = its start
// offset in doc.plain and holds exactly one text node, so a DOM position maps
// to an exact offset. Mirror-layer positions map to their chunk. Copy and
// passage selection read the document model, never the DOM's text, so grid
// layouts and drop caps can't inject newlines or swallow letters.

import type { Doc } from '../text/document';
import { glossText } from '../calque/notation';

function pointOffset(root: HTMLElement, doc: Doc, node: Node, off: number, edge: 'start' | 'end'): number | null {
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)) as HTMLElement | null;
  if (!el || !root.contains(el)) return null;
  const o = el.closest<HTMLElement>('[data-o]');
  if (o && node.nodeType === Node.TEXT_NODE) return +o.dataset.o! + off;
  // Inside the mirror layer or a gloss: whole chunk.
  const m = el.closest('.m, .cb, .cm');
  const c = el.closest<HTMLElement>('[data-c]');
  if (m && c) {
    const first = doc.chunks[+c.dataset.c!];
    const last = doc.chunks[+(c.dataset.ce ?? c.dataset.c)!];
    return edge === 'start' ? first.start : last.end;
  }
  // Between spans (whitespace, paragraph edges): nearest original span after/before the point.
  const spans = [...root.querySelectorAll<HTMLElement>('.o [data-o], .co[data-o]')];
  const probe = document.createRange();
  probe.setStart(node, off);
  if (edge === 'start') {
    const next = spans.find((s) => probe.comparePoint(s, 0) >= 0);
    return next ? +next.dataset.o! : null;
  }
  for (let i = spans.length - 1; i >= 0; i--) {
    if (probe.comparePoint(spans[i], 0) <= 0) return +spans[i].dataset.o! + (spans[i].textContent?.length ?? 0);
  }
  return null;
}

/** Plain-text range of the current selection inside `root`, or null. */
export function selectionRange(root: HTMLElement, doc: Doc): [number, number] | null {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.commonAncestorContainer)) return null;
  const a = pointOffset(root, doc, r.startContainer, r.startOffset, 'start');
  const b = pointOffset(root, doc, r.endContainer, r.endOffset, 'end');
  if (a == null || b == null || b <= a) return null;
  return [a, b];
}

/** Expands a range to whole words and trims surrounding whitespace. */
export function snapToWords(doc: Doc, [a, b]: [number, number]): [number, number] {
  for (const w of doc.words) {
    if (w.start < a && w.end > a) a = w.start;
    if (w.start < b && w.end > b) b = w.end;
    if (w.start >= b) break;
  }
  while (a < b && /\s/.test(doc.plain[a])) a++;
  while (b > a && /\s/.test(doc.plain[b - 1])) b--;
  return [a, b];
}

/** Text for the clipboard: the visible layer, with the source's spacing. */
export function copyText(doc: Doc, [a, b]: [number, number], slots: string[] | null, mirrorVisible: boolean): string {
  if (!mirrorVisible || !slots) return doc.plain.slice(a, b);
  let out = '';
  let prev = -1;
  doc.chunks.forEach((c, i) => {
    if (c.end <= a || c.start >= b) return;
    if (prev >= 0) out += doc.plain.slice(prev, c.start).includes('\n') ? '\n' : ' ';
    out += glossText(slots[i] || '', doc.plain.slice(c.start, c.end)) || doc.plain.slice(c.start, c.end);
    prev = c.end;
  });
  return out;
}

/** DOM range covering plain offsets [a,b) in the original layer (for outlines in natural mode). */
export function domRange(root: HTMLElement, a: number, b: number): Range | null {
  const spans = [...root.querySelectorAll<HTMLElement>('[data-o]')];
  const locate = (off: number, end: boolean): [Node, number] | null => {
    for (const s of spans) {
      const start = +s.dataset.o!;
      const len = s.firstChild?.textContent?.length ?? 0;
      if (end ? off > start && off <= start + len : off >= start && off < start + len) return [s.firstChild!, off - start];
    }
    return null;
  };
  const s = locate(a, false);
  const e = locate(b, true);
  if (!s || !e) return null;
  const r = document.createRange();
  r.setStart(s[0], s[1]);
  r.setEnd(e[0], e[1]);
  return r;
}
