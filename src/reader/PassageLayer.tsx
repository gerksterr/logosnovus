// Draws contiguous outlines for translated passages inside one paragraph and
// records their shapes for hit-testing (hover/click between lines and words).

import { useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { Doc } from '../text/document';
import { domRange } from './dom';
import { lineBoxes, outlinePath, shapes, type Box } from './geometry';
import type { PassageMark } from './useReader';

export const useHover = create<{ key: string | null }>(() => ({ key: null }));

export interface HitShape {
  key: string;
  id: string;
  len: number;
  shapes: Box[][]; // relative to the paragraph
}
/** paragraph index → passage shapes (filled by mounted layers) */
export const hitShapes = new Map<number, HitShape[]>();

export const LAYOUT_EVENT = 'reader-layout';

interface Drawn {
  key: string;
  d: string;
}

export function PassageLayer({ doc, pi, passages }: { doc: Doc; pi: number; passages: PassageMark[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  const hot = useHover((s) => s.key);

  useLayoutEffect(() => {
    const svg = ref.current;
    const p = svg?.parentElement;
    if (!p) return;
    const para = doc.paras[pi];
    const compute = () => {
      const base = p.getBoundingClientRect();
      const grid = !!p.closest('.grid');
      const chunkEls = grid ? [...p.querySelectorAll<HTMLElement>('.c[data-c]')] : [];
      const out: Drawn[] = [];
      const hits: HitShape[] = [];
      for (const ps of passages) {
        const a = Math.max(ps.start, para.start);
        const b = Math.min(ps.end, para.end);
        if (b <= a) continue;
        let rects: DOMRect[] = [];
        if (grid) {
          for (const el of chunkEls) {
            const first = doc.chunks[+el.dataset.c!];
            const last = doc.chunks[+(el.dataset.ce ?? el.dataset.c)!];
            if (last.end > a && first.start < b) rects.push(el.getBoundingClientRect());
          }
        } else rects = [...(domRange(p, a, b)?.getClientRects() ?? [])];
        const rel = rects.map((r) => ({ left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top }));
        // nested passages are drawn slightly inset so shared edges stay visible
        const depth = passages.filter((o) => o !== ps && o.start <= ps.start && o.end >= ps.end && o.end - o.start > ps.end - ps.start).length;
        const sh = shapes(lineBoxes(rel), Math.max(0.5, 4 - 2 * depth), Math.max(-1.5, 1 - depth));
        out.push(...sh.map((s) => ({ key: ps.key, d: outlinePath(s, 5) })));
        hits.push({ key: ps.key, id: ps.id, len: ps.end - ps.start, shapes: sh });
      }
      hitShapes.set(pi, hits);
      setDrawn(out);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(p);
    addEventListener(LAYOUT_EVENT, compute);
    document.fonts?.ready.then(compute);
    return () => {
      ro.disconnect();
      removeEventListener(LAYOUT_EVENT, compute);
      hitShapes.delete(pi);
    };
  }, [doc, pi, passages]);

  return (
    <svg ref={ref} className="pl" aria-hidden="true">
      {drawn.map((x, i) => (
        <path key={i} d={x.d} className={hot === x.key ? 'hot' : undefined} />
      ))}
    </svg>
  );
}

/** Innermost passage at a point (client coordinates) in paragraph `p`, if any. */
export function passageAt(p: HTMLElement, x: number, y: number): HitShape | null {
  const list = hitShapes.get(+p.dataset.p!);
  if (!list) return null;
  const base = p.getBoundingClientRect();
  const rx = x - base.left;
  const ry = y - base.top;
  let best: HitShape | null = null;
  for (const h of list) {
    if (h.shapes.some((s) => s.some((b) => rx >= b.left && rx <= b.right && ry >= b.top && ry <= b.bottom)) && (!best || h.len < best.len)) best = h;
  }
  return best;
}
