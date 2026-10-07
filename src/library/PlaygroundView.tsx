// Paste anything and read it at once, with every reader feature. The text is
// kept locally (one scratch text) until saved to the library.

import { Pencil, Save } from 'lucide-react';
import { useState } from 'react';
import { go } from '../app/router';
import { askText, toast } from '../app/ui';
import { languages } from '../data/selectors';
import { alive, getRec, put, putMany, uid, useStore } from '../data/store';
import { ReaderView } from '../reader/ReaderView';
import { detectRtl } from '../text/document';

const SCRATCH = 'scratch';

function guessLang(content: string, current: string): string {
  const langs = languages();
  const by = (name: string) => langs.find((l) => l.name.toLowerCase().includes(name))?.id;
  if (/[֐-׿]/.test(content)) return by('hebrew') ?? current;
  if (/[Ͱ-Ͽἀ-῿]/.test(content)) return by('greek') ?? current;
  if (/[؀-ۿ]/.test(content)) return by('arabic') ?? current;
  if (/[äöüß]/i.test(content)) return by('german') ?? current;
  return current;
}

export function PlaygroundView() {
  const scratch = useStore((s) => s.texts[SCRATCH]);
  const live = scratch && !scratch.deleted && scratch.content.trim() ? scratch : undefined;
  const [editing, setEditing] = useState(!live);
  const [draft, setDraft] = useState(live?.content ?? '');
  const [lang, setLang] = useState(live?.lang ?? languages()[0]?.id ?? '');

  const read = (content: string, l = lang) => {
    if (!content.trim()) return;
    const langId = l || guessLang(content, l);
    put('texts', { id: SCRATCH, title: 'Playground', lang: langId, content, createdAt: Date.now(), updatedAt: 0, scratch: true, calqueId: content === live?.content ? live?.calqueId : undefined });
    setLang(langId);
    setEditing(false);
  };

  const save = async () => {
    if (!live) return;
    const title = (await askText('Title for the library', live.content.trim().split('\n')[0].slice(0, 50), 'Save'))?.trim();
    if (!title) return;
    const id = uid('text');
    const s = useStore.getState();
    put('texts', { ...live, id, title, scratch: undefined, createdAt: Date.now() });
    // move the playground's translations and calques to the new text
    putMany('translations', alive(s.translations).filter((t) => t.textId === SCRATCH).map((t) => ({ ...t, textId: id })));
    putMany('calques', alive(s.calques).filter((c) => c.textId === SCRATCH).map((c) => ({ ...c, textId: id })));
    const reading = getRec('readings', SCRATCH);
    if (reading) put('readings', { ...reading, id });
    put('texts', { ...live, content: '', calqueId: undefined });
    toast('Saved to the library.');
    go(`/read/${encodeURIComponent(id)}`);
  };

  if (editing || !live)
    return (
      <div className="page playground">
        <div className="page-head">
          <h1>Playground</h1>
        </div>
        <p className="muted small">Paste a text — it becomes readable immediately: tap words, select passages, add a calque. Nothing is added to the library unless you save it.</p>
        <div className="row">
          <select className="input" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value)}>
            {languages().map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={() => read(draft)} disabled={!draft.trim()}>
            Read
          </button>
        </div>
        <textarea
          className="input text-input"
          rows={14}
          autoFocus
          dir="auto"
          placeholder="Paste foreign text here"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text/plain');
            if (!draft.trim() && pasted.trim()) {
              e.preventDefault();
              setDraft(pasted);
              const l = guessLang(pasted, lang);
              read(pasted, l);
            }
          }}
          style={{ marginTop: 12 }}
        />
        {detectRtl(draft) && <p className="small faint">Right-to-left text detected.</p>}
      </div>
    );

  return (
    <div className="playground-reader">
      <div className="row playground-actions">
        <button className="btn small" onClick={() => (setDraft(live.content), setEditing(true))}>
          <Pencil size={14} /> Edit text
        </button>
        <button className="btn small" onClick={save}>
          <Save size={14} /> Save to library
        </button>
      </div>
      <ReaderView textId={SCRATCH} embedded />
    </div>
  );
}
