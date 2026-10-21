import { Sparkles } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { go } from '../app/router';
import { askText, confirmDialog } from '../app/ui';
import { languages, promptsFor } from '../data/selectors';
import { inferMeta, LANGUAGE_NAMES } from './inferMeta';
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
  const [priv, setPriv] = useState(!!text?.private);
  // A new text fills in what it can from its content (and the most similar text in the library)
  // until a field is edited by hand.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const touch = (f: string) => !touched.has(f) && setTouched(new Set(touched).add(f));
  const [applied, setApplied] = useState<Set<'title' | 'author' | 'lang'>>(() => new Set());
  const deferred = useDeferredValue(content);
  const guess = useMemo(() => (!text && deferred.trim().length >= 20 ? inferMeta(deferred) : null), [text, deferred]);
  useEffect(() => {
    if (!guess) return;
    const got = new Set<'title' | 'author' | 'lang'>();
    if (guess.langId && !touched.has('lang')) (setLang(guess.langId), got.add('lang'));
    if (guess.title && !touched.has('title')) (setTitle(guess.title), got.add('title'));
    if (guess.author && !touched.has('author')) (setAuthor(guess.author), got.add('author'));
    if (guess.tags && !touched.has('tags')) setTags(guess.tags.join(', '));
    if (guess.wordPromptId && !touched.has('wordPrompt')) setWordPrompt(guess.wordPromptId);
    if (guess.passagePromptId && !touched.has('passagePrompt')) setPassagePrompt(guess.passagePromptId);
    setApplied(got);
  }, [guess]);
  const auto = [...applied].filter((f) => !touched.has(f));

  const dirty =
    title !== (text?.title ?? '') || author !== (text?.author ?? '') || content !== (text?.content ?? '') || lang !== (text?.lang ?? langs[0]?.id ?? '') ||
    wordPrompt !== (text?.wordPromptId ?? '') || passagePrompt !== (text?.passagePromptId ?? '') || tagList.join(',') !== (text?.tags ?? []).join(',') ||
    priv !== !!text?.private;

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
      auto: text ? text.auto?.filter((f) => !touched.has(f)) : auto.length ? auto : undefined,
      private: priv || undefined,
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
  const addGuessedLanguage = () => {
    if (!guess?.langName) return;
    const l = put('langs', { id: uid('lang'), name: guess.langName, code: guess.code, rtl: detectRtl(content), updatedAt: 0 });
    setLang(l.id);
    touch('lang');
  };
  const promptSelect = (kind: 'word' | 'passage', value: string, set: (v: string) => void) => (
    <select className="input" value={value} onChange={(e) => (touch(kind === 'word' ? 'wordPrompt' : 'passagePrompt'), set(e.target.value))}>
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
          <input className="input" value={title} onChange={(e) => (touch('title'), setTitle(e.target.value))} placeholder="e.g. Zarathustras Vorrede 5" />
        </label>
        <label className="field grow">
          <span>Author</span>
          <input className="input" value={author} onChange={(e) => (touch('author'), setAuthor(e.target.value))} />
        </label>
        <label className="field grow">
          <span>Tags</span>
          <input className="input" value={tags} onChange={(e) => (touch('tags'), setTags(e.target.value))} placeholder="e.g. Red Book, Jung" />
        </label>
      </div>
      <div className="row">
        <label className="field grow">
          <span>Language</span>
          <select className="input" value={lang} onChange={(e) => (touch('lang'), e.target.value === '+' ? void addLanguage() : setLang(e.target.value))}>
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
      {guess && (guess.code || guess.similarTitle || guess.work) && (
        <div className="auto-hint">
          <Sparkles size={14} />
          <span className="grow">
            Filled in from the text{guess.code ? `: ${LANGUAGE_NAMES[guess.code] ?? guess.code}` : ''}
            {guess.similarTitle ? ` · prompts and tags like “${guess.similarTitle}”` : ''}
            {guess.work ? ` · ${guess.work}` : ''}. Change any field to keep your own.
          </span>
          {guess.langName && !guess.langId && (
            <button className="btn small" onClick={addGuessedLanguage}>
              Add {guess.langName}
            </button>
          )}
        </div>
      )}
      <label className="check small">
        <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private: keep this text, its passages and calques out of the shared library
        (only on your devices)
      </label>
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
