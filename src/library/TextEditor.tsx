import { useState } from 'react';
import { go } from '../app/router';
import { askText, confirmDialog } from '../app/ui';
import { languages, promptsFor } from '../data/selectors';
import { put, uid, useStore } from '../data/store';
import type { Text } from '../model/types';
import { detectRtl } from '../text/document';
import { Modal } from '../ui/Modal';

export function TextEditor({ text, onClose }: { text?: Text; onClose: () => void }) {
  const prompts = useStore((s) => s.prompts);
  useStore((s) => s.langs);
  const langs = languages();
  const [title, setTitle] = useState(text?.title ?? '');
  const [author, setAuthor] = useState(text?.author ?? '');
  const [tags, setTags] = useState((text?.tags ?? []).join(', '));
  const tagList = tags.split(/[,#]/).map((t) => t.trim()).filter(Boolean);
  const [lang, setLang] = useState(text?.lang ?? langs[0]?.id ?? '');
  const [content, setContent] = useState(text?.content ?? '');
  const [wordPrompt, setWordPrompt] = useState(text?.wordPromptId ?? '');
  const [passagePrompt, setPassagePrompt] = useState(text?.passagePromptId ?? '');
  const dirty =
    title !== (text?.title ?? '') || author !== (text?.author ?? '') || content !== (text?.content ?? '') || lang !== (text?.lang ?? langs[0]?.id ?? '') ||
    wordPrompt !== (text?.wordPromptId ?? '') || passagePrompt !== (text?.passagePromptId ?? '') || tagList.join(',') !== (text?.tags ?? []).join(',');

  const close = async () => {
    if (!dirty || (await confirmDialog('Discard your changes?', 'Discard'))) onClose();
  };
  const save = () => {
    const now = Date.now();
    const rec = put('texts', {
      ...(text ?? { id: uid('text'), createdAt: now }),
      title: title.trim() || content.trim().split('\n')[0].slice(0, 60) || 'Untitled',
      author: author.trim() || undefined,
      tags: tagList.length ? [...new Set(tagList)] : undefined,
      lang,
      content,
      wordPromptId: wordPrompt || undefined,
      passagePromptId: passagePrompt || undefined,
      updatedAt: now,
    } as Text);
    onClose();
    if (!text) go(`/read/${encodeURIComponent(rec.id)}`);
  };
  const addLanguage = async () => {
    const name = (await askText('Name of the new language', '', 'Add'))?.trim();
    if (!name) return;
    const l = put('langs', { id: uid('lang'), name, rtl: detectRtl(content), updatedAt: 0 });
    setLang(l.id);
  };
  const promptSelect = (kind: 'word' | 'passage', value: string, set: (v: string) => void) => (
    <select className="input" value={value} onChange={(e) => set(e.target.value)}>
      <option value="">Automatic (first matching prompt)</option>
      {promptsFor(kind, lang, prompts).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <Modal
      title={text ? 'Edit text' : 'New text'}
      onClose={close}
      wide
      footer={
        <div className="row end">
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!content.trim()}>
            Save
          </button>
        </div>
      }
    >
      <div className="row">
        <label className="field grow">
          <span>Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Zarathustras Vorrede 5" />
        </label>
        <label className="field grow">
          <span>Author</span>
          <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="field grow">
          <span>Tags</span>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. Red Book, Jung" />
        </label>
      </div>
      <div className="row">
        <label className="field grow">
          <span>Language</span>
          <select className="input" value={lang} onChange={(e) => (e.target.value === '+' ? void addLanguage() : setLang(e.target.value))}>
            {langs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="+">+ Add language…</option>
          </select>
        </label>
        <label className="field grow">
          <span>Word prompt</span>
          {promptSelect('word', wordPrompt, setWordPrompt)}
        </label>
        <label className="field grow">
          <span>Passage prompt</span>
          {promptSelect('passage', passagePrompt, setPassagePrompt)}
        </label>
      </div>
      <label className="field">
        <span>Text</span>
        <textarea
          className="input text-input"
          rows={16}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          dir="auto"
          placeholder="Paste the foreign text. Markup: [Red]D[/Red]ie · [Blue]…[/Blue] · [hang:3][Red]D[/Red][/hang]ie (drop cap over 3 lines)"
        />
      </label>
    </Modal>
  );
}
