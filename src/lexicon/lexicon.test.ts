import { describe, expect, it } from 'vitest';
import { kwic, shortGloss } from './lexicon';

describe('shortGloss', () => {
  it('takes an italic rendering from the title line', () => {
    expect(shortGloss('### gewährtest — *thou didst vouchsafe / grant*\n\nInflected form of **`gewähren`**')).toBe('thou didst vouchsafe / grant');
  });

  it('skips headings and strips markdown from the first prose line', () => {
    expect(shortGloss('# **närrisch**\n\n### Meaning\n*Foolish, crazy, mad*, acting like a **Narr** (fool).')).toBe('Foolish, crazy, mad, acting like a Narr (fool).');
    expect(shortGloss('### ausgewischt - Brief Breakdown\n\n> Past participle of **auswischen** - *"wiped out"*')).toBe('Past participle of auswischen - "wiped out"');
  });

  it('keeps it to one line', () => {
    const g = shortGloss(`**fassen** ${'word '.repeat(80)}`);
    expect(g.length).toBeLessThanOrEqual(171);
    expect(g.endsWith('…')).toBe(true);
  });

  it('ignores tables and rules', () => {
    expect(shortGloss('| a | b |\n| --- | --- |\n---\nThe meaning.')).toBe('The meaning.');
  });
});

describe('kwic', () => {
  it('splits context around the word and flattens line breaks', () => {
    const plain = 'Als Zarathustra diese Worte\ngesprochen hatte, sahe er wieder das Volk an';
    const start = plain.indexOf('Worte');
    expect(kwic(plain, { start, end: start + 5 }, 12)).toEqual({ left: 'ustra diese ', key: 'Worte', right: ' gesprochen ' });
  });
});
