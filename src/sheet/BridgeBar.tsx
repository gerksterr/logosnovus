// Waiting Claude bridge requests: open the bridge (copies them all), bring the
// answers back (button, Ctrl+V anywhere, or automatically when this tab gets
// focus again once clipboard access was allowed).

import { ClipboardPaste, ExternalLink, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { confirmDialog, toast } from '../app/ui';
import { ANSWERS_OPEN, clearJobs, openBridge, receiveAnswers, useBridge } from '../llm/bridge';
import { Modal } from '../ui/Modal';

function take(text: string, quiet = false): boolean {
  const n = receiveAnswers(text);
  if (n == null) {
    if (!quiet) toast('That is not an answer from the Claude bridge. In the bridge, press “Copy answers” first.', 'error');
    return false;
  }
  toast(n ? `Claude answered ${n} ${n === 1 ? 'request' : 'requests'}.` : 'These answers were already added.');
  return true;
}

/** Reads the clipboard without prompting (only once the browser allows it). */
async function pickUp() {
  if (!useBridge.getState().jobs.length || !document.hasFocus()) return;
  try {
    const st = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    if (st.state !== 'granted') return;
    const text = await navigator.clipboard.readText();
    if (text.includes(ANSWERS_OPEN)) take(text, true);
  } catch {
    /* not supported: the button and Ctrl+V still work */
  }
}

export function pasteAnswers(openBox: () => void) {
  navigator.clipboard
    .readText()
    .then((text) => (text.includes(ANSWERS_OPEN) ? take(text) : openBox()))
    .catch(openBox);
}

export function useBridgeListeners() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.includes(ANSWERS_OPEN)) return;
      e.preventDefault();
      take(text);
    };
    const onVisible = () => document.visibilityState === 'visible' && setTimeout(() => void pickUp(), 150);
    document.addEventListener('paste', onPaste, true);
    addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('paste', onPaste, true);
      removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

/** Manual fallback: a box to paste the answers into. */
export function PasteBox({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <Modal
      title="Paste Claude's answers"
      onClose={onClose}
      footer={
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!text.trim()} onClick={() => take(text) && onClose()}>
            Add answers
          </button>
        </div>
      }
    >
      <p className="small muted">In the Claude bridge, press “Copy answers”, then paste here (long-press → Paste on a phone).</p>
      <textarea className="input code" rows={6} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Claude bridge → Logos Novus: …" />
    </Modal>
  );
}

export function BridgeSteps({ count }: { count: number }) {
  const [box, setBox] = useState(false);
  return (
    <div className="bridge-steps">
      <div className="wa-steps">
        <div className="wa-step">
          <span className="wa-n">1</span> Open the Claude bridge — {count > 1 ? `all ${count} waiting requests are` : 'the request is'} copied for you.
        </div>
        <div className="wa-step">
          <span className="wa-n">2</span> Paste there (Ctrl+V, or long-press → Paste). Claude answers on your account; then press “Copy answers”.
        </div>
        <div className="wa-step">
          <span className="wa-n">3</span> Come back here: the answers are picked up, or press “Paste answers”.
        </div>
      </div>
      <div className="row">
        <button className="btn violet" onClick={() => void openBridge()}>
          <ExternalLink size={14} /> Open Claude bridge
        </button>
        <button className="btn" onClick={() => pasteAnswers(() => setBox(true))}>
          <ClipboardPaste size={14} /> Paste answers
        </button>
      </div>
      {box && <PasteBox onClose={() => setBox(false)} />}
    </div>
  );
}

export function BridgeBar() {
  const jobs = useBridge((s) => s.jobs);
  const [box, setBox] = useState(false);
  if (!jobs.length) return null;
  return (
    <div className="bridge-bar" role="status">
      <Sparkles size={15} className="bb-icon" />
      <span className="bb-text">
        Claude bridge · <b>{jobs.length}</b> waiting
      </span>
      <button className="btn small violet" onClick={() => void openBridge()} title="Copies every waiting request and opens the bridge on claude.ai">
        <ExternalLink size={13} /> Open
      </button>
      <button className="btn small" onClick={() => pasteAnswers(() => setBox(true))} title="Bring Claude's answers back (Ctrl+V works too)">
        <ClipboardPaste size={13} /> Paste answers
      </button>
      <button
        className="icon-btn"
        aria-label="Cancel waiting requests"
        title="Cancel waiting requests"
        onClick={async () => (await confirmDialog(`Cancel ${jobs.length} waiting Claude ${jobs.length === 1 ? 'request' : 'requests'}?`, 'Cancel them')) && clearJobs()}
      >
        <X size={14} />
      </button>
      {box && <PasteBox onClose={() => setBox(false)} />}
    </div>
  );
}
