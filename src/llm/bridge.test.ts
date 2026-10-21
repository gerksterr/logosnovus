import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import type { Model } from '../model/types';
import {
  answersTicket,
  bridgeAsk,
  clearJobs,
  jobsTicket,
  onOrphanAnswer,
  parseAnswers,
  parseJobs,
  receiveAnswers,
  sampleOptions,
  toSampleInput,
  useBridge,
} from './bridge';

Object.assign(globalThis.navigator, { clipboard: { writeText: async () => {} } });

const model = (m: string, extra: Partial<Model> = {}): Model => ({ id: 'm', name: '', provider: 'claude', model: m, createdAt: 1, updatedAt: 1, ...extra });

describe('Claude bridge requests', () => {
  it('tiers and specific models', () => {
    expect(sampleOptions(model('quick'))).toEqual({ tier: 'quick' });
    expect(sampleOptions(model('complex'))).toEqual({ tier: 'complex' });
    expect(sampleOptions(model('claude-opus-5-5', { effort: 'high' }))).toEqual({ tier: 'default', model: 'claude-opus-5-5', effort: 'high' });
  });

  it('turns become what sample accepts: no system role, user first and last', () => {
    expect(toSampleInput([{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Mund?' }])).toBe('Be brief.\n\nMund?');
    expect(
      toSampleInput([
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
      ]),
    ).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
  });

  it('tickets survive surrounding text and leave private notes behind', () => {
    const job = { id: 'j1', label: 'Word · Mund', input: 'x', tier: 'default' as const, at: 5, resume: { type: 'chat' as const, store: 'translations' as const, id: 't' } };
    const t = jobsTicket([job]);
    expect(t).not.toContain('resume');
    expect(parseJobs(`copied:\n${t}\n…`)).toEqual([{ id: 'j1', label: 'Word · Mund', input: 'x', tier: 'default' }]);
    expect(parseAnswers(answersTicket([{ id: 'j1', text: 'mouth' }]))).toEqual([{ id: 'j1', text: 'mouth' }]);
    expect(parseAnswers('hello')).toBeNull();
  });
});

describe('answers coming back', () => {
  it('resolves the waiting request, ignores repeats and unknown ids', async () => {
    const ctl = new AbortController();
    const p = bridgeAsk(model('default'), [{ role: 'user', content: 'Mund?' }], 'Word · Mund', ctl.signal);
    const [job] = useBridge.getState().jobs;
    expect(job.label).toBe('Word · Mund');
    const ticket = answersTicket([{ id: job.id, text: 'mouth', model: 'claude-sonnet-5-5' }, { id: 'nope', text: 'x' }]);
    expect(receiveAnswers(ticket)).toBe(1);
    await expect(p).resolves.toMatchObject({ text: 'mouth', model: 'claude-sonnet-5-5' });
    expect(useBridge.getState().jobs).toHaveLength(0);
    expect(receiveAnswers(ticket)).toBe(0);
  });

  it('applies answers to requests made before a reload through their resume note', () => {
    const seen = vi.fn();
    onOrphanAnswer(seen);
    const job = { id: 'old', label: 'Word · Volk', input: 'Volk?', tier: 'quick' as const, at: 1, resume: { type: 'lookup' as const, target: { text: 'Volk' }, fields: {} } };
    useBridge.setState({ jobs: [job] }); // as loaded from storage after a reload: nobody waits for it
    expect(receiveAnswers(answersTicket([{ id: 'old', text: 'people' }]))).toBe(1);
    expect(seen).toHaveBeenCalledWith(job, { id: 'old', text: 'people' });
  });

  it('stopping a request takes it out of the batch', async () => {
    const ctl = new AbortController();
    const p = bridgeAsk(model('quick'), [{ role: 'user', content: 'x' }], 'x', ctl.signal);
    expect(useBridge.getState().jobs).toHaveLength(1);
    ctl.abort();
    await expect(p).rejects.toThrow('Stopped');
    expect(useBridge.getState().jobs).toHaveLength(0);
    const p2 = bridgeAsk(model('quick'), [{ role: 'user', content: 'y' }], 'y', new AbortController().signal);
    clearJobs();
    await expect(p2).rejects.toThrow('Stopped');
  });
});
