// Outline geometry for translated passages (pure functions, unit-tested).
//
// A passage's client rects are merged into one box per visual line. Boxes of
// consecutive lines are stretched to meet halfway through the line gap, so the
// outline is one contiguous shape (not one box per line) and the gap between
// lines counts as "inside" for hover and clicks. Lines that do not overlap
// horizontally start a new shape, so no bridge is drawn across unrelated text.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Merges rects into one box per visual line (rects whose vertical centers overlap). */
export function lineBoxes(rects: Box[]): Box[] {
  const sorted = rects.filter((r) => r.right - r.left > 0.5 && r.bottom - r.top > 0.5).sort((a, b) => a.top - b.top || a.left - b.left);
  if (!sorted.length) return [];
  const heights = sorted.map((r) => r.bottom - r.top).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)];
  const lines: Box[] = [];
  for (const r of sorted) {
    if (r.bottom - r.top > typical * 1.8) continue; // drop caps and other tall floats
    const mid = (r.top + r.bottom) / 2;
    const line = lines.find((l) => mid >= l.top && mid <= l.bottom);
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else lines.push({ ...r });
  }
  return lines.sort((a, b) => a.top - b.top);
}

/** Pads boxes, makes consecutive overlapping lines touch, and splits disjoint runs into separate shapes. */
export function shapes(lines: Box[], padX: number, padY: number): Box[][] {
  const boxes = lines.map((l) => ({ left: l.left - padX, right: l.right + padX, top: l.top - padY, bottom: l.bottom + padY }));
  const out: Box[][] = [];
  let cur: Box[] = [];
  boxes.forEach((b, i) => {
    const prev = boxes[i - 1];
    if (prev && Math.min(prev.right, b.right) - Math.max(prev.left, b.left) > 1) {
      const mid = (lines[i - 1].bottom + lines[i].top) / 2;
      prev.bottom = mid;
      b.top = mid;
      cur.push(b);
    } else {
      if (cur.length) out.push(cur);
      cur = [b];
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

/** SVG path of a stack of vertically touching boxes, with rounded corners. */
export function outlinePath(boxes: Box[], radius = 4): string {
  if (!boxes.length) return '';
  const pts: [number, number][] = [];
  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  pts.push([first.left, first.top], [first.right, first.top]);
  for (let i = 0; i < boxes.length - 1; i++) {
    const y = boxes[i].bottom;
    pts.push([boxes[i].right, y], [boxes[i + 1].right, y]);
  }
  pts.push([last.right, last.bottom], [last.left, last.bottom]);
  for (let i = boxes.length - 1; i > 0; i--) {
    const y = boxes[i].top;
    pts.push([boxes[i].left, y], [boxes[i - 1].left, y]);
  }
  // drop zero-length steps (equal edges on consecutive lines), then collinear points
  const same = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const dedup = pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return !same(p[0], q[0]) || !same(p[1], q[1]);
  });
  const clean = dedup.filter((p, i) => {
    const a = dedup[(i - 1 + dedup.length) % dedup.length];
    const b = dedup[(i + 1) % dedup.length];
    return !((same(a[0], p[0]) && same(p[0], b[0])) || (same(a[1], p[1]) && same(p[1], b[1])));
  });
  const n = clean.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const [px, py] = clean[(i - 1 + n) % n];
    const [vx, vy] = clean[i];
    const [nx, ny] = clean[(i + 1) % n];
    const lp = Math.hypot(px - vx, py - vy);
    const ln = Math.hypot(nx - vx, ny - vy);
    const r = Math.min(radius, lp / 2, ln / 2);
    const ax = vx + ((px - vx) / lp) * r;
    const ay = vy + ((py - vy) / lp) * r;
    const bx = vx + ((nx - vx) / ln) * r;
    const by = vy + ((ny - vy) / ln) * r;
    d += `${i ? 'L' : 'M'}${ax.toFixed(1)} ${ay.toFixed(1)}Q${vx.toFixed(1)} ${vy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  return d + 'Z';
}

export const contains = (shapes: Box[][], x: number, y: number) =>
  shapes.some((s) => s.some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom));
