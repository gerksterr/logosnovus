// Read aloud from a plain-text offset, sentence by sentence (long utterances
// are cut off by some engines). The browser picks a voice for the language.

import { create } from 'zustand';
import type { Doc } from '../text/document';

export const useSpeech = create<{ speaking: boolean }>(() => ({ speaking: false }));
let token = 0;

// languages without voices of their own: the closest common voice
const SPEECH_LANG: Record<string, string> = { grc: 'el-GR', arc: 'he-IL', la: 'it-IT' };
const voiceLang = (code?: string) => (code ? (SPEECH_LANG[code] ?? code) : undefined);

export function speak(text: string, code?: string) {
  if (typeof speechSynthesis === 'undefined') return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  const lang = voiceLang(code);
  if (lang) u.lang = lang;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  token++;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  useSpeech.setState({ speaking: false });
}

/** Sentences of doc.plain from `offset` on. */
export function sentencesFrom(doc: Doc, offset: number): string[] {
  const rest = doc.plain.slice(Math.max(0, offset));
  return (rest.match(/[^.!?;:…׃\n]+[.!?;:…׃]*["'“”„»«’]*\s*/g) ?? []).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /\p{L}/u.test(s));
}

export function readAloud(doc: Doc, offset: number, code?: string) {
  stopSpeaking();
  const lang = voiceLang(code);
  if (typeof speechSynthesis === 'undefined') return;
  const mine = ++token;
  const queue = sentencesFrom(doc, offset);
  useSpeech.setState({ speaking: true });
  const next = () => {
    if (mine !== token) return;
    const s = queue.shift();
    if (!s) return useSpeech.setState({ speaking: false });
    const u = new SpeechSynthesisUtterance(s);
    if (lang) u.lang = lang;
    u.onend = next;
    u.onerror = () => mine === token && useSpeech.setState({ speaking: false });
    speechSynthesis.speak(u);
  };
  next();
}
