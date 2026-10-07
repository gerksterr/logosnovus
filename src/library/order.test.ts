import { describe, expect, it } from 'vitest';
import type { Text } from '../model/types';
import { moveRanks, sortTexts } from './order';

const t = (id: string, createdAt: number, rank?: number): Text => ({ id, createdAt, rank, title: id, lang: '', content: '', updatedAt: 1 });
const apply = (texts: Text[], changes: { id: string; rank: number }[]) => texts.map((x) => ({ ...x, rank: changes.find((c) => c.id === x.id)?.rank ?? x.rank }));
const ids = (texts: Text[]) => sortTexts(texts, 'custom', () => 0).map((x) => x.id);

describe('custom library order', () => {
  it('moving a text up ranks only that text, above all unmoved ones', () => {
    let texts = [t('a', 1), t('b', 2), t('c', 3), t('d', 4)]; // newest first: d c b a
    texts = apply(texts, moveRanks(sortTexts(texts, 'custom', () => 0), 3, 0)); // move a to top
    expect(ids(texts)).toEqual(['a', 'd', 'c', 'b']);
    expect(texts.filter((x) => x.rank != null).map((x) => x.id)).toEqual(['a']);
  });
  it('new texts go below moved texts but above never-moved ones', () => {
    let texts = [t('a', 1), t('b', 2), t('c', 3)];
    texts = apply(texts, moveRanks(sortTexts(texts, 'custom', () => 0), 2, 0)); // a to top
    texts.push(t('new', 9));
    expect(ids(texts)).toEqual(['a', 'new', 'c', 'b']);
  });
  it('places a text between two moved texts', () => {
    let texts = [t('a', 1, 10), t('b', 2, 5), t('c', 3)];
    texts = apply(texts, moveRanks(sortTexts(texts, 'custom', () => 0), 2, 1));
    expect(ids(texts)).toEqual(['a', 'c', 'b']);
  });
  it('dropping below unmoved texts fixes the order above the drop point', () => {
    let texts = [t('a', 1), t('b', 2), t('c', 3), t('d', 4)]; // d c b a
    texts = apply(texts, moveRanks(sortTexts(texts, 'custom', () => 0), 0, 2)); // d below b
    expect(ids(texts)).toEqual(['c', 'b', 'd', 'a']);
  });
  it('sorts by recent activity and by title', () => {
    const texts = [t('b', 1), t('a', 2)];
    expect(sortTexts(texts, 'title', () => 0).map((x) => x.id)).toEqual(['a', 'b']);
    expect(sortTexts(texts, 'recent', (x) => (x.id === 'b' ? 9 : 1)).map((x) => x.id)).toEqual(['b', 'a']);
  });
});
