import { describe, expect, it } from 'vitest';
import { parseMarkup } from './markup';
import { buildDoc, findLoose, wordAt } from './document';

describe('markup', () => {
  it('parses colored letters', () => {
    const m = parseMarkup('[Red]D[/Red]iesen');
    expect(m.plain).toBe('Diesen');
    expect(m.runs).toEqual([{ start: 0, end: 1, color: 'red' }]);
  });
  it('handles improperly nested drop caps', () => {
    const m = parseMarkup('[hang:5][Red]D[/Red][/hang]ie Pflanze');
    expect(m.plain).toBe('Die Pflanze');
    expect(m.runs).toContainEqual({ start: 0, end: 1, hang: 5 });
    expect(m.runs).toContainEqual({ start: 0, end: 1, color: 'red' });
  });
  it('leaves other brackets alone', () => {
    expect(parseMarkup('ἐσμέν [RP: –] . [PHILEMON]').plain).toBe('ἐσμέν [RP: –] . [PHILEMON]');
  });
  it('closes unclosed tags at end of line', () => {
    const m = parseMarkup('[Blue]ab\ncd');
    expect(m.runs).toEqual([{ start: 0, end: 2, color: 'blue' }]);
  });
});

describe('document', () => {
  it('splits glued punctuation into separate words inside one chunk', () => {
    const d = buildDoc('Was ist Stern“—so fragt');
    expect(d.chunks.map((c) => d.plain.slice(c.start, c.end))).toEqual(['Was', 'ist', 'Stern“—so', 'fragt']);
    expect(d.words.map((w) => w.text)).toEqual(['Was', 'ist', 'Stern', 'so', 'fragt']);
    expect(d.words[3].chunk).toBe(2);
  });
  it('keeps apostrophes and hyphens inside words', () => {
    const d = buildDoc('nennen sie’s Ziegen-hirten');
    expect(d.words.map((w) => w.text)).toEqual(['nennen', 'sie’s', 'Ziegen-hirten']);
  });
  it('handles Hebrew niqqud, maqaf and geresh', () => {
    const d = buildDoc('גְּמָ׳ כָּל־הַנֶּאֱכָלִים');
    expect(d.words.map((w) => w.text)).toEqual(['גְּמָ', 'כָּל', 'הַנֶּאֱכָלִים']);
    expect(d.rtl).toBe(true);
  });
  it('marks numbers as non-letter words', () => {
    const d = buildDoc('20 Ἦσαν δὲ');
    expect(d.words[0].letters).toBe(false);
    expect(d.rtl).toBe(false);
  });
  it('groups lines into paragraphs and counts blank lines', () => {
    const d = buildDoc('a b\nc\n\n\nd');
    expect(d.paras.length).toBe(2);
    expect(d.paras[0].c1 - d.paras[0].c0).toBe(3);
    expect(d.paras[1].gap).toBe(2);
  });
  it('maps offsets to words through markup', () => {
    const d = buildDoc('[hang:3][Red]D[/Red][/hang]ie Pflanze');
    expect(d.plain).toBe('Die Pflanze');
    expect(d.words[wordAt(d, 5)].text).toBe('Pflanze');
  });
  it('finds passages despite whitespace and case differences', () => {
    const hay = 'Sie wollen dir zu\nHilfe   eilen, und du';
    const r = findLoose(hay, 'zu hilfe eilen');
    expect(r).not.toBeNull();
    expect(hay.slice(r!.start, r!.end)).toBe('zu\nHilfe   eilen');
  });
});
