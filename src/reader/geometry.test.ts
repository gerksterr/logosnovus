import { describe, expect, it } from 'vitest';
import { contains, lineBoxes, outlinePath, shapes } from './geometry';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('passage geometry', () => {
  it('merges word rects into one box per line and ignores drop caps', () => {
    const lines = lineBoxes([box(10, 0, 40, 20), box(45, 1, 90, 21), box(0, 30, 50, 50), box(0, 0, 30, 140)]);
    expect(lines).toEqual([box(10, 0, 90, 21), box(0, 30, 50, 50)]);
  });

  it('joins overlapping lines into one contiguous shape that covers the line gap', () => {
    const s = shapes([box(100, 0, 300, 20), box(0, 30, 300, 50), box(0, 60, 120, 80)], 0, 0);
    expect(s.length).toBe(1);
    expect(s[0][0].bottom).toBe(25);
    expect(s[0][1].top).toBe(25);
    expect(contains(s, 150, 27)).toBe(true); // between lines 1 and 2
    expect(contains(s, 200, 70)).toBe(false); // right of the last line
  });

  it('splits lines that do not overlap horizontally into separate shapes', () => {
    const s = shapes([box(250, 0, 300, 20), box(0, 30, 40, 50)], 0, 0);
    expect(s.length).toBe(2);
    expect(contains(s, 100, 25)).toBe(false); // no bridge across unrelated text
  });

  it('draws one closed outline with a step', () => {
    const d = outlinePath([box(100, 0, 300, 25), box(0, 25, 300, 50)], 0);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect((d.match(/Q/g) || []).length).toBe(6); // 6 corners after merging the flush right edge
  });
});
