// Reading position = plain-text offset of the first word on the top visible
// line. Offsets survive font, width, mode and device changes, unlike pixels.

import type { Doc } from '../text/document';
import { chunkAtOrAfter } from '../text/document';

export const headerHeight = () => (document.querySelector('.reader-bar') as HTMLElement | null)?.getBoundingClientRect().bottom ?? 0;

/** Offset of the first word visible below the header (null if none). */
export function topOffset(root: HTMLElement, doc: Doc): number | null {
  const box = root.getBoundingClientRect();
  const top = Math.max(headerHeight(), box.top) + 6;
  const xs = [box.left + 40, box.left + box.width / 2, box.right - 40];
  for (let y = top; y < top + 120; y += 6) {
    for (const x of xs) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el || !root.contains(el)) continue;
      const o = el.closest<HTMLElement>('[data-o]');
      if (o) return +o.dataset.o!;
      const c = el.closest<HTMLElement>('[data-c]');
      if (c) return doc.chunks[+c.dataset.c!].start;
    }
  }
  return null;
}

/** Scrolls so the line holding `offset` is the first line under the header. */
export function scrollToOffset(root: HTMLElement, doc: Doc, offset: number, smooth = false) {
  const ci = chunkAtOrAfter(doc, offset);
  if (ci < 0) return;
  const el = root.querySelector<HTMLElement>(`.c[data-c="${ci}"], .cap[data-c="${ci}"]`) ?? root.querySelector<HTMLElement>(`[data-c="${ci}"]`);
  if (!el) return;
  const y = el.getBoundingClientRect().top + scrollY - headerHeight() - 6;
  scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'instant' });
}
