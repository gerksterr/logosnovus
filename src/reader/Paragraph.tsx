// Renders one paragraph. All display modes share this DOM:
//   <span.c data-c>  chunk = one calque slot
//     <span.o>       original layer: words (.w data-w) and signs, each text span has data-o
//     <span.m>       mirror layer (calque gloss)
//     <span.cb>      composite badge (separable verbs)
// The reader's mode class decides which layer shows and whether chunks are
// stacked grids (zero-shift mirror / aligned / interlinear) or plain inline text.

import { memo, type CSSProperties, type ReactNode } from 'react';
import type { Composite } from '../calque/composites';
import { parseSlot } from '../calque/notation';
import { wordKey, type Doc } from '../text/document';
import { COLORS, type Markup, type Run } from '../text/markup';
import { PassageLayer } from './PassageLayer';
import type { PassageMark, Replacement } from './useReader';

export interface ParaProps {
  doc: Doc;
  pi: number;
  slots: string[] | null;
  comps: Map<number, Composite>;
  keep: Set<number>;
  replace: Replacement[];
  known: Set<string>;
  notes: [number, number][];
  compound: boolean;
  sel: number; // selected word index (or -1)
  passages: PassageMark[];
}

const colorStyle = (color?: string): CSSProperties | undefined => (color ? { color: COLORS[color] } : undefined);

interface Piece {
  a: number;
  b: number;
  w: number; // word index or -1
  color?: string;
  note: boolean;
}

/** Splits [from,to) at word, color-run and note boundaries. */
function pieces(doc: Doc, from: number, to: number, w0: number, w1: number, notes: [number, number][]): Piece[] {
  const cuts = new Set([from, to]);
  const words = doc.words.slice(w0, w1);
  for (const w of words) [w.start, w.end].forEach((x) => x > from && x < to && cuts.add(x));
  const colors = doc.runs.filter((r) => r.color && r.end > from && r.start < to);
  for (const r of colors) [r.start, r.end].forEach((x) => x > from && x < to && cuts.add(x));
  const ns = notes.filter(([s, e]) => e > from && s < to);
  for (const [s, e] of ns) [s, e].forEach((x) => x > from && x < to && cuts.add(x));
  const sorted = [...cuts].sort((x, y) => x - y);
  const out: Piece[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const wi = words.findIndex((w) => w.start <= a && w.end >= b);
    out.push({
      a,
      b,
      w: wi < 0 ? -1 : w0 + wi,
      color: colors.find((r) => r.start <= a && r.end >= b)?.color,
      note: ns.some(([s, e]) => s <= a && e >= b),
    });
  }
  return out;
}

function Orig({ doc, ps, known, sel }: { doc: Doc; ps: Piece[]; known: Set<string>; sel: number }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p.w < 0) {
      out.push(
        <span key={p.a} data-o={p.a} className={p.note ? 'n' : undefined} style={colorStyle(p.color)}>
          {doc.plain.slice(p.a, p.b)}
        </span>,
      );
      continue;
    }
    const group = [p];
    while (i + 1 < ps.length && ps[i + 1].w === p.w) group.push(ps[++i]);
    const word = doc.words[p.w];
    const cls = `w${word.letters ? '' : ' num'}${known.has(wordKey(word.text)) ? ' k' : ''}${sel === p.w ? ' sel' : ''}${p.note ? ' n' : ''}`;
    out.push(
      group.length === 1 && !p.color ? (
        <span key={p.a} className={cls} data-w={p.w} data-o={p.a}>
          {doc.plain.slice(p.a, p.b)}
        </span>
      ) : (
        <span key={p.a} className={cls} data-w={p.w}>
          {group.map((g) => (
            <span key={g.a} data-o={g.a} style={colorStyle(g.color)}>
              {doc.plain.slice(g.a, g.b)}
            </span>
          ))}
        </span>
      ),
    );
  }
  return <>{out}</>;
}

function Gloss({ m, from = 0 }: { m: Markup; from?: number }) {
  const text = m.plain.slice(from);
  const runs = m.runs.filter((r) => r.color && r.end > from);
  if (!runs.length) return <>{text}</>;
  const cuts = new Set([0, text.length]);
  for (const r of runs) [r.start - from, r.end - from].forEach((x) => x > 0 && x < text.length && cuts.add(x));
  const sorted = [...cuts].sort((a, b) => a - b);
  return (
    <>
      {sorted.slice(0, -1).map((a, i) => {
        const b = sorted[i + 1];
        const color = runs.find((r) => r.start - from <= a && r.end - from >= b)?.color;
        return (
          <span key={a} style={colorStyle(color)}>
            {text.slice(a, b)}
          </span>
        );
      })}
    </>
  );
}

/** Mirror markup for a chunk: the slot's own tags, or the source chunk's colors carried over. */
function mirrorMarkup(doc: Doc, ci: number, raw: string, keep: boolean): { m: Markup; tag?: string; miss: boolean } {
  const c = doc.chunks[ci];
  const source = doc.plain.slice(c.start, c.end);
  const srcRuns = doc.runs.filter((r) => r.end > c.start && r.start < c.end).map((r) => ({ ...r, start: Math.max(r.start, c.start) - c.start, end: Math.min(r.end, c.end) - c.start }));
  if (keep || !raw) return { m: { plain: source, runs: srcRuns }, miss: !keep };
  const slot = parseSlot(raw, source);
  const m = slot.gloss;
  if (!m.runs.length && srcRuns.length) {
    const len = m.plain.length;
    const runs: Run[] = [];
    for (const r of srcRuns) {
      if (r.start === 0 && r.end >= source.length) runs.push({ ...r, end: len });
      else if (r.start === 0) runs.push({ ...r, end: Math.min(len, r.end) });
    }
    return { m: { plain: m.plain, runs }, tag: slot.tag, miss: false };
  }
  return { m, tag: slot.tag, miss: false };
}

function ParagraphImpl(props: ParaProps) {
  const { doc, pi, slots, comps, keep, replace, known, notes, compound, sel, passages } = props;
  const para = doc.paras[pi];
  const items: ReactNode[] = [];
  let prevEnd = -1;

  const sep = (at: number) => {
    if (prevEnd < 0) return;
    const gap = doc.plain.slice(prevEnd, at);
    const breaks = gap.split('\n').length - 1;
    if (breaks) for (let k = 0; k < breaks; k++) items.push(<br key={`br${at}-${k}`} />);
    else items.push(' ');
  };

  for (let ci = para.c0; ci < para.c1; ci++) {
    const c = doc.chunks[ci];
    sep(c.start);
    const rep = replace.find((r) => r.c0 === ci);
    if (rep) {
      const last = doc.chunks[rep.c1];
      items.push(
        <span key={`g${ci}`} className="c grp" data-c={ci} data-ce={rep.c1}>
          <span className="o">
            <Orig doc={doc} ps={pieces(doc, c.start, last.end, c.w0, last.w1, notes)} known={known} sel={sel} />
          </span>
          {slots && <span className="m rep">{rep.text}</span>}
        </span>,
      );
      prevEnd = last.end;
      ci = rep.c1;
      continue;
    }

    const hang = doc.runs.find((r) => r.hang && r.start === c.start && r.end <= c.end);
    const capEnd = hang ? hang.end : c.start;
    const mm = slots ? mirrorMarkup(doc, ci, slots[ci], keep.has(ci)) : null;
    let mirrorFrom = 0;
    let capGloss = '';
    if (hang) {
      const capColor = doc.runs.find((r) => r.color && r.start <= c.start && r.end >= capEnd)?.color;
      let capMirror = '';
      let capMirrorColor = capColor;
      if (mm) {
        const own = mm.m.runs.find((r) => r.hang && r.start === 0);
        mirrorFrom = own ? own.end : [...mm.m.plain][0]?.length ?? 0;
        capMirror = mm.m.plain.slice(0, mirrorFrom);
        capGloss = capMirror;
        capMirrorColor = mm.m.runs.find((r) => r.color && r.start === 0)?.color ?? capColor;
      }
      items.push(
        <span key={`cap${ci}`} className="cap" style={{ '--n': hang.hang } as CSSProperties} data-c={ci}>
          <span className="co w" data-w={c.w0} data-o={c.start} style={colorStyle(capColor)}>
            {doc.plain.slice(c.start, capEnd)}
          </span>
          {mm && (
            <span className="cm" style={colorStyle(capMirrorColor)}>
              {capMirror}
            </span>
          )}
        </span>,
      );
    }

    const comp = comps.get(ci);
    const showCompound = compound && comp;
    items.push(
      <span key={ci} className={`c${mm?.miss ? ' miss' : ''}${keep.has(ci) ? ' keep' : ''}${comp ? ' comp' : ''}`} data-c={ci}>
        <span className="o">
          <Orig doc={doc} ps={pieces(doc, capEnd, c.end, c.w0, c.w1, notes)} known={known} sel={sel} />
        </span>
        {mm && (
          <span className={`m${showCompound && comp.part > 0 ? ' faded' : ''}`}>
            {capGloss && <span className="capg">{capGloss}</span>}
            {showCompound && comp.part === 0 ? comp.meaning : <Gloss m={mm.m} from={mirrorFrom} />}
          </span>
        )}
        {comp && (
          <span className="cb" data-g={comp.gid} data-c={ci}>
            {comp.label}
            {comp.part === 0 && !compound ? ` ${comp.meaning}` : ''}
          </span>
        )}
      </span>,
    );
    prevEnd = c.end;
  }

  return (
    <p className="para" data-p={pi} style={para.gap ? ({ '--gap': para.gap } as CSSProperties) : undefined} dir={doc.rtl ? 'rtl' : undefined}>
      {items}
      {passages.length > 0 && <PassageLayer doc={doc} pi={pi} passages={passages} />}
    </p>
  );
}

export const Paragraph = memo(ParagraphImpl);

/** [bracketed] apparatus ranges in the plain text (not markup — that is already stripped). */
export function noteRanges(plain: string): [number, number][] {
  return [...plain.matchAll(/\[[^\]\n]{1,200}\]/g)].map((m) => [m.index!, m.index! + m[0].length]);
}
