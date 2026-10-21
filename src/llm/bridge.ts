// Claude bridge: requests answered by a small claude.ai artifact on the
// viewer's own Claude account (no API key). An artifact cannot reach the
// network, claude.ai cannot be framed and drops the opener of a tab opened
// from here, so requests travel by clipboard, in batches: "Open Claude
// bridge" copies every waiting request, one paste there runs them all, one
// paste here (or picking it up when this tab regains focus) brings every
// answer back. Waiting requests survive a reload; their answers are then
// applied through the `resume` note each request carries.

import { create } from 'zustand';
import { getMeta, setMeta } from '../data/db';
import { getRec } from '../data/store';
import type { Model } from '../model/types';
import type { Turn } from './request';

/** The published bridge artifact (Settings can point elsewhere). */
export const BRIDGE_URL = 'https://claude.ai/artifact/KC9s5SXB1wwkm1qfbqPQpv';
export const bridgeUrl = () => getRec('prefs', 'prefs')?.bridgeUrl?.trim() || BRIDGE_URL;

export const TIERS = ['quick', 'default', 'complex'] as const;
export type Tier = (typeof TIERS)[number];
export const isTier = (s: string): s is Tier => (TIERS as readonly string[]).includes(s);

export type SampleTurn = { role: 'user' | 'assistant'; content: string };

/** What to do with an answer that arrives after the page was reloaded. */
export type Resume =
  | { type: 'lookup'; target: unknown; fields: Record<string, unknown> }
  | { type: 'chat'; store: 'translations' | 'calques'; id: string }
  | { type: 'calque'; textId: string; promptName?: string }
  | { type: 'clarify'; kind: string; data: unknown };

export interface BridgeJob {
  id: string;
  label: string;
  input: string | SampleTurn[];
  tier: Tier;
  model?: string; // a specific model id instead of a tier
  effort?: 'low' | 'medium' | 'high';
  json?: boolean; // the answer is machine-read
  at: number;
  resume?: Resume;
}

export interface BridgeAnswer {
  id: string;
  text?: string;
  model?: string; // model / tier that answered
  truncated?: boolean;
  error?: string;
}

export const JOBS_OPEN = '⟦LN-JOBS⟧';
export const JOBS_CLOSE = '⟦/LN-JOBS⟧';
export const ANSWERS_OPEN = '⟦LN-ANSWERS⟧';
export const ANSWERS_CLOSE = '⟦/LN-ANSWERS⟧';

export const useBridge = create<{ jobs: BridgeJob[] }>(() => ({ jobs: [] }));

interface Waiter {
  resolve: (a: BridgeAnswer) => void;
  reject: (e: Error) => void;
}
const waiters = new Map<string, Waiter>();
let orphanHandler: ((job: BridgeJob, answer: BridgeAnswer) => void) | null = null;
/** Applies answers whose request was made before a reload (registered by llm/queries). */
export const onOrphanAnswer = (fn: typeof orphanHandler) => void (orphanHandler = fn);

const persist = () => void setMeta('bridgeJobs', useBridge.getState().jobs).catch(() => {});

export async function loadBridgeJobs() {
  const jobs = (await getMeta<BridgeJob[]>('bridgeJobs').catch(() => null)) ?? [];
  if (jobs.length) useBridge.setState({ jobs });
}

/** Model → sample options. A model field that is not a tier names a specific Claude model. */
export function sampleOptions(model: Pick<Model, 'model' | 'effort'>): Pick<BridgeJob, 'tier' | 'model' | 'effort'> {
  const m = model.model.trim();
  if (isTier(m)) return { tier: m };
  return { tier: 'default', model: m || undefined, effort: model.effort };
}

/**
 * Chat turns → what the artifact's `sample` accepts: no system role (it
 * becomes the head of the first user turn), starting and ending on a user turn.
 */
export function toSampleInput(turns: Turn[]): string | SampleTurn[] {
  const system = turns.filter((t) => t.role === 'system').map((t) => t.content).join('\n\n');
  const chat: SampleTurn[] = turns.filter((t) => t.role !== 'system').map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content }));
  if (system) {
    if (chat[0]?.role === 'user') chat[0] = { role: 'user', content: `${system}\n\n${chat[0].content}` };
    else chat.unshift({ role: 'user', content: system });
  }
  while (chat.length && chat[0].role !== 'user') chat.shift();
  if (chat.length === 1) return chat[0].content;
  return chat;
}

export function jobsTicket(jobs: BridgeJob[]): string {
  const payload = { v: 1, jobs: jobs.map(({ resume: _r, at: _a, ...j }) => j) };
  return `Logos Novus → Claude bridge: ${jobs.length} ${jobs.length === 1 ? 'request' : 'requests'}. Paste all of this into the Claude bridge page.\n${JOBS_OPEN}${JSON.stringify(payload)}${JOBS_CLOSE}`;
}

export function answersTicket(answers: BridgeAnswer[]): string {
  return `Claude bridge → Logos Novus: ${answers.length} answers. Paste this into Logos Novus.\n${ANSWERS_OPEN}${JSON.stringify({ v: 1, answers })}${ANSWERS_CLOSE}`;
}

function between(text: string, open: string, close: string): unknown {
  const a = text.indexOf(open);
  const b = text.indexOf(close, a + open.length);
  if (a < 0 || b < 0) return null;
  try {
    return JSON.parse(text.slice(a + open.length, b));
  } catch {
    return null;
  }
}

export function parseAnswers(text: string): BridgeAnswer[] | null {
  const d = between(text, ANSWERS_OPEN, ANSWERS_CLOSE) as { answers?: unknown } | null;
  if (!d || !Array.isArray(d.answers)) return null;
  return d.answers.filter((a): a is BridgeAnswer => !!a && typeof (a as BridgeAnswer).id === 'string');
}

export function parseJobs(text: string): BridgeJob[] | null {
  const d = between(text, JOBS_OPEN, JOBS_CLOSE) as { jobs?: unknown } | null;
  if (!d || !Array.isArray(d.jobs)) return null;
  return d.jobs as BridgeJob[];
}

/** Copies every waiting request (call from a click: browsers want a user gesture). */
export async function copyJobs(): Promise<boolean> {
  const { jobs } = useBridge.getState();
  if (!jobs.length) return false;
  try {
    await navigator.clipboard.writeText(jobsTicket(jobs));
    return true;
  } catch {
    return false;
  }
}

export async function openBridge() {
  await copyJobs();
  window.open(bridgeUrl(), '_blank', 'noopener');
}

let seq = 0;
/** Queues one request and resolves with its answer whenever it is pasted back. */
export function bridgeAsk(model: Model, turns: Turn[], label: string, signal: AbortSignal, resume?: Resume): Promise<BridgeAnswer> {
  const job: BridgeJob = {
    id: `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label: label.slice(0, 120),
    input: toSampleInput(turns),
    ...sampleOptions(model),
    at: Date.now(),
    resume,
  };
  useBridge.setState((s) => ({ jobs: [...s.jobs, job] }));
  persist();
  void copyJobs(); // usually still inside the click that asked: the batch is ready to paste
  return new Promise<BridgeAnswer>((resolve, reject) => {
    waiters.set(job.id, { resolve, reject });
    const abort = () => {
      waiters.delete(job.id);
      dropJobs([job.id]);
      reject(new DOMException('Stopped', 'AbortError'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

export function dropJobs(ids: string[]) {
  const set = new Set(ids);
  useBridge.setState((s) => ({ jobs: s.jobs.filter((j) => !set.has(j.id)) }));
  persist();
}

/** Clears every waiting request (their requests stop). */
export function clearJobs() {
  const ids = useBridge.getState().jobs.map((j) => j.id);
  for (const id of ids) waiters.get(id)?.reject(new DOMException('Stopped', 'AbortError'));
  ids.forEach((id) => waiters.delete(id));
  dropJobs(ids);
}

/** Takes an answers ticket; returns how many answers were used (null: not a ticket). */
export function receiveAnswers(text: string): number | null {
  const answers = parseAnswers(text);
  if (!answers) return null;
  const { jobs } = useBridge.getState();
  const byId = new Map(jobs.map((j) => [j.id, j]));
  let used = 0;
  const done: string[] = [];
  for (const a of answers) {
    const job = byId.get(a.id);
    if (!job) continue; // already applied, or stopped meanwhile
    used++;
    done.push(a.id);
    const w = waiters.get(a.id);
    waiters.delete(a.id);
    if (w) w.resolve(a);
    else if (!a.error && a.text) orphanHandler?.(job, a);
  }
  dropJobs(done);
  return used;
}
