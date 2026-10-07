// Inline markup used inside foreign texts (and echoed back inside calques):
//   [Red]D[/Red]iesen          colored letters (any key of COLORS)
//   [hang:3][Red]D[/Red][/hang] a drop cap hanging over 3 lines
// Anything else in square brackets ([RP: …], [1], [PHILEMON]) is ordinary text.

export const COLORS: Record<string, string> = {
  red: 'var(--ink-red)',
  blue: 'var(--ink-blue)',
  green: 'var(--ink-green)',
  gold: 'var(--ink-gold)',
};

export interface Run {
  start: number; // offset in the plain (tag-free) text
  end: number;
  color?: string; // key of COLORS
  hang?: number; // drop cap height in lines
}

export interface Markup {
  plain: string;
  runs: Run[];
}

const TAG_RE = new RegExp(`\\[(\\/?)(${Object.keys(COLORS).join('|')}|hang)(?::(\\d{1,2}))?\\]`, 'gi');

export function parseMarkup(src: string): Markup {
  const runs: Run[] = [];
  const open = new Map<string, { at: number; hang?: number }>();
  let plain = '';
  let last = 0;
  const close = (name: string, at: number) => {
    const o = open.get(name);
    if (!o) return;
    open.delete(name);
    if (at <= o.at) return;
    runs.push(name === 'hang' ? { start: o.at, end: at, hang: o.hang ?? 2 } : { start: o.at, end: at, color: name });
  };
  for (const m of src.matchAll(TAG_RE)) {
    plain += src.slice(last, m.index);
    last = m.index! + m[0].length;
    const name = m[2].toLowerCase();
    if (m[1]) close(name, plain.length);
    else {
      close(name, plain.length); // re-opening without closing ends the previous run
      open.set(name, { at: plain.length, hang: m[3] ? Math.max(1, Math.min(12, +m[3])) : undefined });
    }
  }
  plain += src.slice(last);
  // Unclosed tags end at the end of their line.
  for (const name of [...open.keys()]) {
    const at = open.get(name)!.at;
    const nl = plain.indexOf('\n', at);
    close(name, nl < 0 ? plain.length : nl);
  }
  runs.sort((a, b) => a.start - b.start || b.end - a.end);
  return { plain, runs };
}

export const stripMarkup = (src: string) => parseMarkup(src).plain;

/** Runs intersecting [start,end), re-based to that window. */
export function runsIn(runs: Run[], start: number, end: number): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (r.end <= start || r.start >= end) continue;
    out.push({ ...r, start: Math.max(r.start, start) - start, end: Math.min(r.end, end) - start });
  }
  return out;
}
