// The card above the text: what the text is, how far you are, and which
// prompt and model a word or passage lookup will use — all changeable here.

import { Globe, Layers, NotebookText, Pencil, Plus, Sparkles, Square, Volume2 } from 'lucide-react';
import { useMemo } from 'react';
import { defaultPrompt, langName, promptsFor } from '../data/selectors';
import { alive, getRec, patch, useStore } from '../data/store';
import { progress, textStats } from '../library/stats';
import type { Text } from '../model/types';
import { wordKey } from '../text/document';
import { ModelPicker } from '../ui/ModelPicker';
import { readAloud, stopSpeaking, useSpeech } from './speech';
import { topOffset } from './scroll';
import type { ReaderData } from './useReader';

export function ReaderHead({
  data,
  bodyRef,
  onCalque,
  onNotes,
  onEdit,
  style,
}: {
  data: ReaderData;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  onCalque: () => void;
  onNotes: () => void;
  onEdit: () => void;
  style?: React.CSSProperties;
}) {
  const { text, doc } = data;
  const translations = useStore((s) => s.translations);
  const st = textStats(translations).get(text.id);
  const speaking = useSpeech((s) => s.speaking);
  const p = progress(text, data.reading);

  // share of this text's distinct words that have a saved translation in the language
  const coverage = useMemo(() => {
    const all = new Set<string>();
    for (const w of doc.words) if (w.letters) all.add(wordKey(w.text));
    let known = 0;
    for (const k of all) if (data.known.has(k)) known++;
    return { distinct: all.size, known };
  }, [doc, data.known]);
  const wordCount = doc.words.filter((w) => w.letters).length;

  return (
    <section className="reader-head" style={style}>
      <div className="rh-badges">
        <span className="badge lang caps">{langName(text.lang) || 'Unknown language'}</span>
        {data.slots ? (
          <button className="badge cyan caps" onClick={onCalque} title="Open the calque panel: versions and alignment">
            <Layers size={11} /> Calque ready
          </button>
        ) : (
          <button className="badge caps" onClick={onCalque} title="Create a word-for-word mirror translation">
            <Plus size={11} /> Add calque
          </button>
        )}
        {text.tags?.map((t) => (
          <span key={t} className="badge">
            #{t}
          </span>
        ))}
      </div>
      <h1 className="rh-title" dir="auto">
        {text.title}
      </h1>
      {text.author && <div className="rh-author">{text.author}</div>}
      <div className="rh-stats">
        <span>{wordCount.toLocaleString()} words</span>
        {st && (
          <span>
            {st.words} words and {st.passages} passages looked up
          </span>
        )}
        {coverage.known > 0 && (
          <span title="Distinct words of this text with a saved translation in this language (from any text)">
            {Math.round((coverage.known / Math.max(1, coverage.distinct)) * 100)}% of its vocabulary in your lexicon
          </span>
        )}
        {p > 0 && <span>{Math.round(p * 100)}% read</span>}
      </div>
      <div className="rh-actions">
        <button
          className={`btn small${speaking ? ' on' : ''}`}
          onClick={() => {
            if (speaking) return stopSpeaking();
            const at = bodyRef.current ? topOffset(bodyRef.current, doc) : 0;
            readAloud(doc, at ?? 0, data.lang?.code);
          }}
          title="Read aloud from the top of the screen"
        >
          {speaking ? <Square size={14} /> : <Volume2 size={15} />} {speaking ? 'Stop' : 'Read aloud'}
        </button>
        <button className="btn small" onClick={onNotes} title="Every translation in this text">
          <NotebookText size={15} /> Notes {st ? <span className="btn-count">{st.translations}</span> : null}
        </button>
        <button className="btn small" onClick={onEdit}>
          <Pencil size={14} /> Edit text
        </button>
      </div>
      <div className="rh-lookups">
        <LookupRow text={text} kind="word" />
        <LookupRow text={text} kind="passage" />
      </div>
    </section>
  );
}

/** Prompt + model used when a word is clicked / a passage is translated, for this text. */
function LookupRow({ text, kind }: { text: Text; kind: 'word' | 'passage' }) {
  const prompts = useStore((s) => s.prompts);
  const models = useStore((s) => s.models);
  const list = promptsFor(kind, text.lang, prompts);
  const current = defaultPrompt(kind, text, text.lang);
  const promptKey = kind === 'word' ? 'wordPromptId' : 'passagePromptId';
  const modelKey = kind === 'word' ? 'wordModelId' : 'passageModelId';
  const modelId = text[modelKey] && getRec('models', text[modelKey]) ? text[modelKey]! : '';
  const isWeb = getRec('models', modelId)?.provider === 'web';
  const firstWeb = alive(models).find((m) => m.provider === 'web');
  return (
    <div className={`lookup-row ${kind}`}>
      <Sparkles size={15} className="lr-icon" />
      <span className="lr-label">{kind === 'word' ? 'Word' : 'Passage'}</span>
      <select className="lr-select" value={current?.id ?? ''} onChange={(e) => patch('texts', text.id, { [promptKey]: e.target.value || undefined })} aria-label={`${kind} prompt`}>
        {!current && <option value="">No prompt</option>}
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ModelPicker compact value={modelId} onChange={(id) => patch('texts', text.id, { [modelKey]: id || undefined })} defaultLabel="Active model" className="lr-model" />
      {firstWeb && (
        <button
          className={`btn small lr-web${isWeb ? ' violet' : ''}`}
          onClick={() => patch('texts', text.id, { [modelKey]: isWeb ? undefined : firstWeb.id })}
          title={isWeb ? 'Back to the active model' : `Ask through ${firstWeb.name} (copy & paste, no key)`}
        >
          <Globe size={13} /> Web assist
        </button>
      )}
    </div>
  );
}
