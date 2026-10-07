// Grayscale overview of the whole text: paragraph shapes, where translations
// cluster (brighter = more), and the visible window (drag or tap to move).

import { useEffect, useRef } from 'react';
import { headerHeight } from './scroll';
import type { ReaderData } from './useReader';

interface Geo {
  docTop: number;
  docHeight: number;
  paras: { top: number; height: number }[];
}

function measure(): Geo | null {
  const body = document.querySelector('.reader-body') as HTMLElement | null;
  if (!body) return null;
  const docTop = body.getBoundingClientRect().top + scrollY;
  const paras = [...body.querySelectorAll<HTMLElement>('.para')].map((p) => {
    const r = p.getBoundingClientRect();
    return { top: r.top + scrollY - docTop, height: r.height };
  });
  return { docTop, docHeight: body.offsetHeight, paras };
}

export function Minimap({ data }: { data: ReaderData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useRef<Geo | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const g = (geo.current ??= measure());
      if (!g || !g.paras.length) return;
      const css = getComputedStyle(document.documentElement);
      const fg = css.getPropertyValue('--fg').trim() || '#ddd';
      const dpr = devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const scale = Math.min(h / Math.max(g.docHeight, 1), 0.25);
      const lh = Math.max(1.5, parseFloat(getComputedStyle(document.querySelector('.text')!).lineHeight) * scale);
      const { doc } = data;

      // text shape
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.18;
      g.paras.forEach((p, i) => {
        const lines = Math.max(1, Math.round((p.height * scale) / lh));
        const para = doc.paras[i];
        for (let k = 0; k < lines; k++) {
          const last = k === lines - 1;
          const fill = last ? 0.25 + (((para?.end ?? 0) * 7 + i) % 60) / 100 : 1;
          ctx.fillRect(6, p.top * scale + k * lh, (w - 16) * fill, Math.max(1, lh * 0.55));
        }
      });

      // translation density
      const yOf = (offset: number) => {
        const pi = doc.paras.findIndex((p) => p.end >= offset);
        const p = g.paras[pi];
        const para = doc.paras[pi];
        if (!p || !para) return null;
        return (p.top + ((offset - para.start) / Math.max(1, para.end - para.start)) * p.height) * scale;
      };
      ctx.globalAlpha = 0.5;
      for (const ps of data.passages) {
        const a = yOf(ps.start);
        const b = yOf(ps.end);
        if (a != null && b != null) ctx.fillRect(1, a, 3, Math.max(2, b - a));
      }
      ctx.globalAlpha = 0.35;
      for (const wd of doc.words) {
        if (!data.known.has(wd.text.normalize('NFC').toLowerCase())) continue;
        const y = yOf(wd.start);
        if (y != null) ctx.fillRect(w - 7, y - 1, 5, 2);
      }

      // viewport
      const top = (scrollY + headerHeight() - g.docTop) * scale;
      const vh = (innerHeight - headerHeight()) * scale;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(0, top, w, vh);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, top + 0.5, w - 1, Math.max(4, vh - 1));
    };
    const schedule = () => (frame ||= requestAnimationFrame(draw));
    const remeasure = () => {
      geo.current = null;
      schedule();
    };
    schedule();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', remeasure);
    const ro = new ResizeObserver(remeasure);
    const body = document.querySelector('.reader-body');
    if (body) ro.observe(body);
    return () => {
      removeEventListener('scroll', schedule);
      removeEventListener('resize', remeasure);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [data]);

  const jump = (clientY: number) => {
    const g = geo.current;
    const canvas = ref.current;
    if (!g || !canvas) return;
    const scale = Math.min(canvas.clientHeight / Math.max(g.docHeight, 1), 0.25);
    const y = (clientY - canvas.getBoundingClientRect().top) / scale;
    scrollTo({ top: g.docTop + y - (innerHeight - headerHeight()) / 2 - headerHeight() });
  };

  return (
    <canvas
      ref={ref}
      className="minimap"
      aria-label="Minimap"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        jump(e.clientY);
      }}
      onPointerMove={(e) => e.buttons && jump(e.clientY)}
    />
  );
}
