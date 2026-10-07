// Long texts (whole books) mount paragraphs only as they come near the
// viewport; the rest are empty placeholders with an estimated height. Layout
// and mode switches then cost what is on screen, not the whole book.
// Short texts (every chapter-sized text) render completely, as before.

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Doc } from '../text/document';

export const LAZY_THRESHOLD = 60_000; // characters

let revealHook: ((pi: number) => Promise<void>) | null = null;
/** Makes sure paragraph `pi` is rendered (resolves after it is in the DOM). */
export const reveal = (pi: number): Promise<void> => (revealHook ? revealHook(pi) : Promise.resolve());

export function useLazyParagraphs(doc: Doc, rootRef: RefObject<HTMLElement | null>, focus: number | undefined) {
  const lazy = doc.plain.length > LAZY_THRESHOLD;
  const [mounted, setMounted] = useState<Set<number>>(() => {
    if (!lazy) return new Set();
    const fp = Math.max(0, focus != null ? doc.paras.findIndex((p) => p.end >= focus) : 0);
    return new Set(range(fp - 4, fp + 30, doc.paras.length));
  });
  const pending = useRef<(() => void)[]>([]);

  const mount = (from: number, to: number) =>
    setMounted((cur) => {
      const add = range(from, to, doc.paras.length).filter((i) => !cur.has(i));
      return add.length ? new Set([...cur, ...add]) : cur;
    });

  useEffect(() => {
    if (!lazy) return;
    revealHook = (pi) =>
      new Promise((resolve) => {
        pending.current.push(resolve);
        mount(pi - 4, pi + 12);
      });
    return () => void (revealHook = null);
  }, [lazy, doc]);

  // resolve reveal() promises once the new paragraphs are painted
  useEffect(() => {
    if (!pending.current.length) return;
    const done = pending.current.splice(0);
    requestAnimationFrame(() => done.forEach((r) => r()));
  }, [mounted]);

  useEffect(() => {
    const root = rootRef.current;
    if (!lazy || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) {
          const pi = +(e.target as HTMLElement).dataset.p!;
          mount(pi - 3, pi + 10);
        }
      },
      { rootMargin: '1500px 0px 1500px 0px' },
    );
    root.querySelectorAll('.para.ph').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [lazy, mounted, rootRef]);

  const charsPerLine = useMemo(() => {
    const root = rootRef.current;
    const fs = root ? parseFloat(getComputedStyle(root).fontSize) || 19 : 19;
    const width = root ? Math.min(root.clientWidth - 44, 38 * fs) : 700;
    return Math.max(20, width / (fs * 0.5));
  }, [rootRef.current, doc]);

  const estimate = (pi: number, lineHeightPx: number) => {
    const p = doc.paras[pi];
    const lines = doc.plain
      .slice(p.start, p.end)
      .split('\n')
      .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
    return lines * lineHeightPx;
  };

  return { lazy, mounted, estimate };
}

function range(from: number, to: number, n: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, from); i < Math.min(n, to); i++) out.push(i);
  return out;
}
