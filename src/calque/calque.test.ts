import { describe, expect, it } from 'vitest';
import { buildDoc } from '../text/document';
import { alignCalque, Flag, slotsToText } from './align';
import { compositeQuery, findComposites } from './composites';
import { parseSlot, tokenizeCalque } from './notation';

const PFLANZE =
  '[hang:5][Red]D[/Red][/hang]ie Pflanze, die wächst, treibt einen Schoss zur Rechten, und wenn dieser völlig gebildet ist, so will der natürliche Drang des Wachstums nicht über die Endknospe hinaus weiterwachsen, sondern er fließt zurück in den Stamm, in die Mutter des Zweiges und bahnt sich im Dunkeln und Stammhaften einen unsicheren Weg und findet zuletzt gerade die richtige Stelle zur Linken und treibt dort einen neuen Schoss hervor. Diese neue Richtung des Wachstums ist aber der früheren ganz entgegengesetzt. Und doch wächst die Pflanze in dieser Weise ebenmäßig, ohne Überspannung und Störung des Gleichgewichtes. Zur Rechten ist mein Denken, zur Linken mein Fühlen.';
const PFLANZE_CALQUE =
  '[hang:5][Red]T[/Red][/hang]he plant, which grows, drives a shoot to-the right, and when this completely formed is, so wants the natural urge of-the growth not over the end-bud beyond further-grow, but it flows back in the trunk, in the mother of-the branch and paves itself in-the dark and trunk-like a uncertain way and finds at-last just the right place to-the left and drives there a new shoot forth. This new direction of-the growth is but the earlier wholly opposite. And yet grows the plant in this way even-measured, without over-tension and disturbance of-the equilibrium. To-the right is my thinking, to-the left my feeling.';

const slotFor = (doc: ReturnType<typeof buildDoc>, slots: string[], src: string) =>
  slots[doc.chunks.findIndex((c) => doc.plain.slice(c.start, c.end) === src)];

describe('calque alignment', () => {
  it('aligns the Die Pflanze paragraph 1:1 (old drift regression)', () => {
    const doc = buildDoc(PFLANZE);
    const a = alignCalque(doc, PFLANZE_CALQUE);
    expect(doc.chunks.length).toBe(101);
    expect(a.uncertain).toBe(0);
    expect(slotFor(doc, a.slots, 'nicht')).toBe('not');
    expect(slotFor(doc, a.slots, 'Fühlen.')).toBe('feeling.');
    expect(a.slots[0]).toBe('[hang:5][Red]T[/Red][/hang]he');
  });

  it('turns a dropped word into one local gap instead of a cascade', () => {
    const doc = buildDoc(PFLANZE);
    const a = alignCalque(doc, PFLANZE_CALQUE.replace(' growth not over', ' growth over'));
    expect(a.uncertain).toBe(1);
    expect(slotFor(doc, a.slots, 'über')).toBe('over');
    expect(slotFor(doc, a.slots, 'Fühlen.')).toBe('feeling.');
  });

  it('absorbs a split hyphenated gloss', () => {
    const doc = buildDoc(PFLANZE);
    const a = alignCalque(doc, PFLANZE_CALQUE.replace('of-the branch', 'of the branch'));
    expect(slotFor(doc, a.slots, 'Zweiges')).toBe('branch');
    expect(a.flags.filter((f) => f === Flag.Merged).length).toBe(1);
    expect(slotFor(doc, a.slots, 'Fühlen.')).toBe('feeling.');
  });

  it('copes with glued dashes written apart', () => {
    const doc = buildDoc('„Was ist Stern“—so fragt der letzte Mensch und blinzelt.');
    const a = alignCalque(doc, '"What is star" — so asks the last human and blinks.');
    expect(slotFor(doc, a.slots, 'Stern“—so')).toBe('star" — so');
    expect(slotFor(doc, a.slots, 'fragt')).toBe('asks');
    expect(slotFor(doc, a.slots, 'blinzelt.')).toBe('blinks.');
  });

  it('keeps apparatus brackets aligned word by word', () => {
    const doc = buildDoc('20 Ἦσαν δὲ Ἕλληνές τινες [RP: τινες Ἕλληνές] ἐκ τῶν ἀναβαινόντων');
    const a = alignCalque(doc, '20 Were but Greeks some [RP: some Greeks] out-of the going-up-ones');
    expect(a.uncertain).toBe(0);
    expect(slotFor(doc, a.slots, '[RP:')).toBe('[RP:');
    expect(slotFor(doc, a.slots, 'Ἕλληνές]')).toBe('Greeks]');
  });

  it('aligns line by line when line counts match', () => {
    const doc = buildDoc('מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בָּעֲרָבִין?\nעַד סוֹף הָאַשְׁמוּרָה הָרִאשׁוֹנָה.');
    const a = alignCalque(doc, 'from-when recite-they ACC Shema in-the-evenings?\nuntil end the-watch the-first.');
    expect(a.uncertain).toBe(0);
    expect(a.slots[5]).toBe('until');
  });

  it('round-trips slots to text with the source layout', () => {
    const doc = buildDoc('a b\n\nc');
    expect(slotsToText(doc, ['x', 'y', 'z'])).toBe('x y\n\nz');
  });
});

describe('calque notation', () => {
  it('parses composite heads and parts', () => {
    expect(parseSlot('draws[1:distinguishes]')).toMatchObject({ tag: '1', meaning: 'distinguishes', gloss: { plain: 'draws' } });
    expect(parseSlot('out[1],')).toMatchObject({ tag: '1', gloss: { plain: 'out,' } });
    expect(parseSlot('saw[1:looked-at]').meaning).toBe('looked at');
  });
  it('treats editorial brackets and footnotes as text', () => {
    expect(parseSlot('[RP:').tag).toBeUndefined();
    expect(parseSlot('[1]').tag).toBeUndefined();
    expect(parseSlot('God[1]', 'Gott[1]').tag).toBeUndefined();
    expect(parseSlot('[hang:5][Red]T[/Red][/hang]he').tag).toBeUndefined();
  });
  it('keeps composite tags with spaces in one token', () => {
    expect(tokenizeCalque('he saw[1:looked at] it').map((t) => t.text)).toEqual(['he', 'saw[1:looked at]', 'it']);
    expect(tokenizeCalque('[RP: some Greeks]').map((t) => t.text)).toEqual(['[RP:', 'some', 'Greeks]']);
  });
});

describe('composites', () => {
  it('links separated parts and builds the lookup query', () => {
    const doc = buildDoc('Bildung nennen sie’s, es zeichnet sie aus vor den Ziegenhirten.');
    const a = alignCalque(doc, 'Education call they-it, it draws[1:distinguishes] them out[1] before the goat-herds.');
    const comps = findComposites(doc, a.slots);
    const head = comps.get(4)!;
    expect(head).toMatchObject({ part: 0, size: 2, meaning: 'distinguishes', members: [4, 6] });
    expect(compositeQuery(doc, head)).toBe('zeichnet ... aus');
  });
  it('scopes group numbers per sentence', () => {
    const doc = buildDoc('Er gab nach. Sie schrieb es nieder.');
    const comps = findComposites(doc, ['He', 'gave[1:yielded]', 'after[1].', 'She', 'wrote[1:recorded]', 'it', 'down[1].']);
    expect(comps.get(1)!.members).toEqual([1, 2]);
    expect(comps.get(4)!.members).toEqual([4, 6]);
    expect(compositeQuery(doc, comps.get(1)!)).toBe('gab nach.'.replace('.', ''));
  });
});
