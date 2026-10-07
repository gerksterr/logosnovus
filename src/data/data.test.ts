import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { convertLegacy, isLegacyBackup, keyProvider } from './legacy';
import { acceptIncoming } from './merge';
import { decodeShare, encodeShare } from './share';
import { initStore, merge, put, remove, flush, useStore } from './store';
import { loadAll, wipe } from './db';

const OLD = {
  version: 2,
  texts: [
    {
      id: 'text-1',
      title: 'Zarathustra Vorrede 5.',
      language: 'German',
      content: 'Bildung nennen sie’s, es zeichnet sie aus vor den Ziegenhirten.\n\nDrum hören sie ungern.',
      wordBlueprintId: 'bp-word',
      passageBlueprintId: 'pp-deleted-meanwhile',
      createdAt: '2026-08-25T10:00:00.000Z',
      updatedAt: '2026-08-25T10:00:00.000Z',
    },
  ],
  blueprints: [
    { id: 'bp-word', name: 'Nietzsche', type: 'word', template: "the word '{word}'", language: 'all', createdAt: '2026-08-05T16:37:27.735Z', updatedAt: '2026-09-03T16:33:29.912Z' },
    { id: 'wp-web-assist-default', name: 'Seed', type: 'word', template: 'x {word}', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ],
  languages: [{ id: 'lang-german', name: 'German', code: 'de', isRTL: false }],
  llmModelBlueprints: [
    { id: 'model-bp-1', name: 'opus', provider: 'openrouter', modelName: 'anthropic/claude-opus-5.5', temperature: 1, customApiKey: 'sk-or-v1-abcdefghijklmnop', isDefault: true, createdAt: '2026-10-03', updatedAt: '2026-10-03' },
    { id: 'llm-bp-web-assist-claude', provider: 'web-assist', modelName: 'x' },
  ],
  annotations: [
    { id: 'ann-1', textId: 'text-1', type: 'word', target: 'Bildung', result: '**Bildung** means…', queryUsed: 'q', blueprintName: 'Nietzsche', createdAt: '2026-09-01T00:00:00.000Z', modelUsed: 'm' },
    { id: 'ann-2', textId: 'text-1', type: 'passage', target: 'es zeichnet  sie aus', result: 'r', queryUsed: 'q2', createdAt: '2026-09-02T00:00:00.000Z' },
  ],
  decipherChats: { 'ann_ann-1': [{ id: 'c1', role: 'user', content: 'more?', createdAt: '2026-09-01T01:00:00.000Z' }] },
  mirrorTranslations: {
    'text-1': {
      textId: 'text-1',
      rawCalqueText: 'Education call they-it, it draws[1:distinguishes] them out[1] before the goat-herds.\n\nTherefore hear they unwillingly.',
      sourceModel: 'openrouter:x',
      untranslatedWords: ['Bildung'],
      updatedAt: '2026-09-05T00:00:00.000Z',
    },
  },
  calqueHistory: [],
  llmConfig: { provider: 'web-assist', customApiKey: 'sk-or-v1-abcdefghijklmnop' },
};

describe('legacy import', () => {
  it('detects and converts an old backup', () => {
    expect(isLegacyBackup(OLD)).toBe(true);
    const { bundle, keys, unanchored } = convertLegacy(OLD, { includeKeys: false });
    expect(bundle.texts![0]).toMatchObject({ id: 'text-1', lang: 'lang-german', wordPromptId: 'bp-word', passagePromptId: undefined });
    expect(bundle.prompts!.map((p) => p.id)).toEqual(['bp-word']);
    const passage = bundle.translations!.find((t) => t.id === 'ann-2')!;
    expect(passage.anchor).toEqual([22, 41]);
    expect(unanchored).toBe(0);
    expect(bundle.translations!.find((t) => t.id === 'ann-1')!.chat).toHaveLength(1);
    const cq = bundle.calques![0];
    expect(cq.slots[4]).toBe('draws[1:distinguishes]');
    expect(bundle.texts![0].calqueId).toBe(cq.id);
    expect(bundle.readings![0].keepWords).toEqual(['bildung']);
    expect(bundle.prefs![0].modelId).toBe('model-bp-1');
    expect(keys).toEqual([{ provider: 'openrouter', masked: 'sk-or-…mnop' }]);
    expect(bundle.secrets).toEqual([]);
    expect(convertLegacy(OLD, { includeKeys: true }).bundle.secrets![0]).toMatchObject({ id: 'openrouter' });
  });
  it('recognizes key providers', () => {
    expect(keyProvider('AIzaSyX')).toBe('gemini');
    expect(keyProvider('sk-ant-x')).toBe('anthropic');
  });
});

describe('merge', () => {
  it('keeps the newer record and adds unknown ones', () => {
    const cur = { a: { id: 'a', updatedAt: 5 }, b: { id: 'b', updatedAt: 5 } };
    const got = acceptIncoming(cur, [
      { id: 'a', updatedAt: 4 },
      { id: 'b', updatedAt: 6 },
      { id: 'c', updatedAt: 1 },
      { id: 3 } as never,
    ]);
    expect(got.map((r) => r.id)).toEqual(['b', 'c']);
  });
});

describe('share links', () => {
  it('round-trips a bundle', async () => {
    const payload = await encodeShare({ texts: [{ id: 't', updatedAt: 1, title: 'ä ש', lang: '', content: 'x'.repeat(5000), createdAt: 1 }] });
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload.length).toBeLessThan(400); // ~5 KB of JSON
    const back = await decodeShare(payload);
    expect(back.records.texts![0].title).toBe('ä ש');
  });
});

describe('store', () => {
  beforeEach(async () => {
    await wipe();
    await initStore();
  });
  it('seeds defaults, persists writes and tombstones deletions', async () => {
    expect(Object.keys(useStore.getState().prompts).length).toBeGreaterThan(0);
    put('texts', { id: 't1', title: 'T', lang: '', content: 'a', createdAt: 1, updatedAt: 0 });
    remove('prompts', 'p-calque');
    await flush();
    const disk = await loadAll();
    expect(disk.texts.find((t) => t.id === 't1')).toBeTruthy();
    expect(disk.prompts.find((p) => p.id === 'p-calque')!.deleted).toBe(true);
    await initStore(); // deleted seed is not resurrected
    expect(useStore.getState().prompts['p-calque'].deleted).toBe(true);
  });
  it('merges imports by last writer', () => {
    put('texts', { id: 't1', title: 'mine', lang: '', content: 'a', createdAt: 1, updatedAt: 0 });
    const n = merge({ texts: [{ id: 't1', title: 'old', lang: '', content: 'a', createdAt: 1, updatedAt: 1 }] }, 'import');
    expect(n).toBe(0);
    expect(useStore.getState().texts.t1.title).toBe('mine');
  });
});
