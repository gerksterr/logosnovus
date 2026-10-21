import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { formKey, relatedFor } from '../data/selectors';
import { useStore } from '../data/store';
import type { Text, Translation } from '../model/types';
import { applyLemmas, applyMeta, parseJsonLoose, pendingClarifications } from './clarify';

const now = Date.now();
const text: Text = { id: 't1', title: 'Die pflanze', lang: 'la1', content: 'Er ging in den Wald. Da gingen sie mit ihm, und wir gehen auch.', createdAt: now, updatedAt: now, auto: ['title', 'author'] };
const tr: Translation = { id: 'tr1', kind: 'word', lang: 'la1', textId: 't1', target: 'ging', createdAt: now, updatedAt: now, prompt: 'p', content: 'went' };
useStore.setState({
  langs: { la1: { id: 'la1', name: 'Gothic', updatedAt: 1 } }, // no code: forms are only normalized, nothing is grouped locally
  texts: { t1: text },
  translations: { tr1: tr },
  lemmas: {},
});

describe('clarifications', () => {
  it('reads JSON from fenced or chatty answers', () => {
    expect(parseJsonLoose('Sure:\n```json\n{"a": "b"}\n```')).toEqual({ a: 'b' });
    expect(parseJsonLoose('Here: [{"id": 1}] done')).toEqual([{ id: 1 }]);
    expect(parseJsonLoose('no json')).toBeNull();
  });

  it('collects the forms of studied texts, applies lemmas, groups forms by them', () => {
    const plan = pendingClarifications();
    expect(plan.lemmas[0].forms).toEqual(expect.arrayContaining(['ging', 'gingen', 'gehen', 'wald']));
    expect(relatedFor({ kind: 'word', lang: 'la1', text: 'gingen' })).toHaveLength(0);
    applyLemmas({ lang: 'la1', forms: ['ging', 'gingen', 'gehen'] }, 'Result: {"ging": "gehen", "gingen": "gehen"}');
    expect(formKey('la1', 'gingen')).toBe(formKey('la1', 'ging'));
    expect(relatedFor({ kind: 'word', lang: 'la1', text: 'gingen' }).map((t) => t.id)).toEqual(['tr1']);
    expect(useStore.getState().lemmas['la1|gehen'].lemma).toBe('gehen'); // unanswered forms map to themselves: not asked again
    expect(pendingClarifications().lemmas[0].forms).not.toContain('gingen');
  });

  it('fills in authors and auto titles, never a title typed by hand', () => {
    applyMeta({ ids: ['t1'] }, '[{"id": "t1", "author": "C. G. Jung", "title": "The plant", "work": "Liber Novus"}]');
    const t = useStore.getState().texts.t1;
    expect(t.author).toBe('C. G. Jung');
    expect(t.title).toBe('The plant');
    expect(t.metaChecked).toBeGreaterThan(0);
    expect(pendingClarifications().meta).toHaveLength(0);
  });
});
