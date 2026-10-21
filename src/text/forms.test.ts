import { describe, expect, it } from 'vitest';
import { germanStrongLemma, groupKey, normalize, stemGerman } from './forms';

const same = (code: string, ...words: string[]) => new Set(words.map((w) => groupKey(w, code))).size === 1;

describe('Snowball German', () => {
  it('matches the reference stemmer on its sample vocabulary', () => {
    // from snowballstem.org/algorithms/german (input → stem)
    const ref: [string, string][] = [
      ['aufeinanderbiss', 'aufeinanderbiss'],
      ['aufeinanderfolge', 'aufeinanderfolg'],
      ['aufeinanderfolgen', 'aufeinanderfolg'],
      ['aufeinanderfolgend', 'aufeinanderfolg'],
      ['aufeinanderfolgende', 'aufeinanderfolg'],
      ['aufeinanderfolgenden', 'aufeinanderfolg'],
      ['aufeinanderfolgt', 'aufeinanderfolgt'],
      ['aufeinanderfolgten', 'aufeinanderfolgt'],
      ['aufeinanderschlügen', 'aufeinanderschlug'],
      ['aufenthalt', 'aufenthalt'],
      ['aufenthalten', 'aufenthalt'],
      ['aufenthaltsort', 'aufenthaltsort'],
      ['käufer', 'kauf'],
      ['käuferin', 'kauferin'],
      ['kaufmännisch', 'kaufmann'],
      ['kaufleute', 'kaufleut'],
    ];
    for (const [w, stem] of ref) expect(stemGerman(normalize(w, 'de')), w).toBe(stem);
  });
});

describe('forms of the same word', () => {
  it('German strong verbs, with old spellings and prefixes', () => {
    expect(same('de', 'sehen', 'sah', 'sahe', 'gesehen', 'sieht', 'siehst', 'sähe', 'sahen')).toBe(true);
    expect(germanStrongLemma('nachging')).toBe('nachgehen');
    expect(same('de', 'nachging', 'nachgehen', 'nachgeht', 'nachgegangen')).toBe(true);
    expect(germanStrongLemma('ersannen')).toBe('ersinnen');
    expect(same('de', 'ersannen', 'ersinnen', 'ersann')).toBe(true);
    expect(same('de', 'ist', 'war', 'gewesen', 'sein', 'seyn')).toBe(true);
    expect(same('de', 'giebt', 'gibt', 'geben', 'gab')).toBe(true);
    expect(same('de', 'aufgestanden', 'aufstehen', 'stand')).toBe(false); // aufstehen is not stehen
  });

  it('German weak verbs and nouns', () => {
    expect(same('de', 'lachen', 'lacht', 'lachte', 'gelacht', 'lachend')).toBe(true);
    expect(same('de', 'Herz', 'Herzen', 'Herzens')).toBe(true);
    expect(same('de', 'Thür', 'Tür', 'Türen')).toBe(true);
    expect(same('de', 'sah', 'sagen')).toBe(false);
    expect(same('de', 'Volk', 'Völker')).toBe(true);
  });

  it('Greek accents, breathings and endings', () => {
    expect(same('grc', 'λόγος', 'λόγου', 'λόγον', 'λόγῳ', 'Λόγος')).toBe(true);
    expect(same('grc', 'λόγος', 'λέγω')).toBe(false);
  });

  it('Hebrew points, cantillation, final letters and prefixes', () => {
    expect(same('he', 'לֹֽ֣א', 'לא', 'לֹא')).toBe(true);
    expect(same('he', 'וְהָאָרֶץ', 'הָאָרֶץ', 'אֶרֶץ')).toBe(true);
    expect(same('he', 'משה', 'שה')).toBe(false);
  });

  it('a known lemma wins (clarified or corrected)', () => {
    const lemmas = new Map([['ging', 'gehen']]);
    expect(groupKey('ging', 'de', (f) => lemmas.get(f))).toBe(groupKey('gehen', 'de'));
    const own = new Map([['nichts', '=nichts']]);
    expect(groupKey('nichts', 'de', (f) => own.get(f))).not.toBe(groupKey('nicht', 'de'));
  });
});
