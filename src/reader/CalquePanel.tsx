import { Copy, ExternalLink, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { confirmDialog, toast } from '../app/ui';
import { docFor, promptsFor } from '../data/selectors';
import { alive, getRec, patch, put, remove, useStore } from '../data/store';
import { calquePromptText, runningFor, saveCalque, startCalque, stopQuery, useQueries } from '../llm/queries';
import { activeModel, modelLabel, prepare } from '../llm/run';
import type { Calque, Text } from '../model/types';
import { Modal } from '../ui/Modal';
import { ModelPicker } from '../ui/ModelPicker';

type Tab = 'generate' | 'paste' | 'versions' | 'align';

const SOURCE_LABEL: Record<Calque['source'], string> = { ai: 'generated', import: 'pasted', web: 'web chat', edit: 'edited', legacy: 'imported' };

export function CalquePanel({ text, onClose }: { text: Text; onClose: () => void }) {
  const calques = useStore((s) => s.calques);
  const versions = useMemo(() => alive(calques).filter((c) => c.textId === text.id).sort((a, b) => b.createdAt - a.createdAt), [calques, text.id]);
  const [tab, setTab] = useState<Tab>(versions.length ? 'versions' : 'generate');
  return (
    <Modal title={`Calque · ${text.title}`} onClose={onClose} wide>
      <div className="seg tabs">
        {(['generate', 'paste', 'versions', 'align'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} disabled={t === 'align' && !text.calqueId}>
            {t === 'generate' ? 'Generate' : t === 'paste' ? 'Paste' : t === 'versions' ? `Versions (${versions.length})` : 'Alignment'}
          </button>
        ))}
      </div>
      {tab === 'generate' && <Generate text={text} onDone={() => setTab('align')} />}
      {tab === 'paste' && <Paste text={text} onDone={() => setTab('align')} />}
      {tab === 'versions' && <Versions text={text} versions={versions} />}
      {tab === 'align' && <Align text={text} />}
    </Modal>
  );
}

function usePromptChoice(text: Text) {
  const prompts = useStore((s) => s.prompts);
  const list = promptsFor('calque', text.lang, prompts);
  const [id, setId] = useState(list[0]?.id ?? '');
  return { list, prompt: getRec('prompts', id) ?? list[0], setId };
}

function Generate({ text, onDone }: { text: Text; onDone: () => void }) {
  const { list, prompt, setId } = usePromptChoice(text);
  const [modelId, setModelId] = useState(activeModel()?.id ?? '');
  const model = getRec('models', modelId);
  const [maxTokens, setMaxTokens] = useState<number | ''>(model?.maxTokens ?? 16000);
  const [body, setBody] = useState<string | null>(null); // null = generated from the inputs
  const [error, setError] = useState('');
  const queryId = useQueries((s) => s.queries.find((q) => q.key === `calque|${text.id}`)?.id);
  const q = useQueries((s) => s.queries.find((x) => x.id === queryId));

  const generated = useMemo(() => {
    if (!model || model.provider === 'web') return '';
    try {
      const promptText = calquePromptText(text, prompt);
      const turns = [...(prompt?.system ? [{ role: 'system' as const, content: prompt.system }] : []), { role: 'user' as const, content: promptText }];
      return prepare({ ...model, maxTokens: maxTokens || undefined }, turns).body;
    } catch (e) {
      return `// ${(e as Error).message}`;
    }
  }, [model, prompt, text, maxTokens]);

  useEffect(() => {
    if (q?.status === 'done' && q.resultId) {
      toast('Calque saved and aligned.');
      onDone();
    }
  }, [q?.status, q?.resultId, onDone]);

  if (model?.provider === 'web') return <Paste text={text} onDone={onDone} hint={`${modelLabel(model)} is a copy & paste model.`} />;

  const run = () => {
    setError('');
    const json = body ?? generated;
    if (json.startsWith('//')) return setError(json.slice(3));
    try {
      JSON.parse(json);
    } catch (e) {
      return setError(`Request is not valid JSON: ${(e as Error).message}`);
    }
    startCalque(text, { promptId: prompt?.id, modelId, body: json });
  };
  const running = q?.status === 'running';

  return (
    <div className="calque-gen">
      <div className="row">
        <label className="field grow">
          <span>Prompt</span>
          <select className="input" value={prompt?.id ?? ''} onChange={(e) => setId(e.target.value)}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span>Model</span>
          <ModelPicker value={modelId} onChange={setModelId} />
        </label>
        <label className="field" style={{ width: 130 }}>
          <span>Max tokens</span>
          <input className="input" type="number" min={256} step={1000} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value ? +e.target.value : '')} />
        </label>
      </div>
      <details className="raw">
        <summary>Request JSON {body != null && <span className="badge">edited</span>}</summary>
        <textarea className="input code" rows={12} spellCheck={false} value={body ?? generated} onChange={(e) => setBody(e.target.value)} />
        {body != null && (
          <button className="btn small ghost" onClick={() => setBody(null)}>
            Reset to generated request
          </button>
        )}
      </details>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        {running ? (
          <button className="btn" onClick={() => stopQuery(q!.id)}>
            <Square size={14} /> Stop
          </button>
        ) : (
          <button className="btn primary" onClick={run} disabled={!model}>
            Generate calque
          </button>
        )}
        {q && <span className="small muted">{running ? `Receiving… ${q.content.length} characters` : q.status === 'error' ? '' : q.status === 'stopped' ? 'Stopped.' : ''}</span>}
      </div>
      {q?.error && <p className="error-text">{q.error}</p>}
      {q && (q.content || q.reasoning) && <pre className="stream-box">{q.content || q.reasoning}</pre>}
    </div>
  );
}

function Paste({ text, onDone, hint }: { text: Text; onDone: () => void; hint?: string }) {
  const { list, prompt, setId } = usePromptChoice(text);
  const [raw, setRaw] = useState('');
  const web = alive(useStore.getState().models).filter((m) => m.provider === 'web');
  const promptText = calquePromptText(text, prompt);
  const use = () => {
    if (!raw.trim()) return;
    const { uncertain } = saveCalque(text, raw, { source: 'import', promptName: prompt?.name });
    toast(uncertain ? `Calque saved. ${uncertain} slot(s) need a look in Alignment.` : 'Calque saved and aligned.');
    onDone();
  };
  return (
    <div>
      {hint && <p className="muted small">{hint}</p>}
      <p className="small muted">1. Copy the prompt and run it in any chat. 2. Paste the answer below.</p>
      <div className="row">
        <select className="input grow" value={prompt?.id ?? ''} onChange={(e) => setId(e.target.value)}>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => navigator.clipboard.writeText(promptText).then(() => toast('Prompt copied.'))}>
          <Copy size={14} /> Copy prompt ({Math.round(promptText.length / 1000)}k chars)
        </button>
        {web.map((m) => (
          <a key={m.id} className="btn ghost" href={m.siteUrl} target="_blank" rel="noopener noreferrer" onClick={() => navigator.clipboard.writeText(promptText).catch(() => {})}>
            <ExternalLink size={14} /> {m.model}
          </a>
        ))}
      </div>
      <textarea className="input" rows={10} placeholder="Paste the calque here" value={raw} onChange={(e) => setRaw(e.target.value)} style={{ marginTop: 12 }} />
      <div className="row end">
        <button className="btn primary" onClick={use} disabled={!raw.trim()}>
          Use this calque
        </button>
      </div>
    </div>
  );
}

function Versions({ text, versions }: { text: Text; versions: Calque[] }) {
  const [view, setView] = useState<string | null>(null);
  if (!versions.length) return <div className="empty">No calque yet. Generate one or paste one.</div>;
  return (
    <div className="list">
      {versions.map((c) => (
        <div key={c.id} className={`list-row${c.id === text.calqueId ? ' active' : ''}`}>
          <div className="grow">
            <div>
              {new Date(c.createdAt).toLocaleString()} · {SOURCE_LABEL[c.source]}
              {c.id === text.calqueId && <span className="badge">in use</span>}
            </div>
            <div className="small muted">
              {[c.model, c.promptName, `${c.slots.filter(Boolean).length} words`].filter(Boolean).join(' · ')}
            </div>
            {view === c.id && <pre className="stream-box">{c.raw ?? c.slots.join(' ')}</pre>}
          </div>
          <button className="btn small ghost" onClick={() => setView(view === c.id ? null : c.id)}>
            {view === c.id ? 'Hide' : 'View'}
          </button>
          {c.id !== text.calqueId && (
            <button className="btn small" onClick={() => patch('texts', text.id, { calqueId: c.id })}>
              Use
            </button>
          )}
          <button
            className="icon-btn"
            title="Delete this version"
            onClick={async () => {
              if (!(await confirmDialog('Delete this calque version?'))) return;
              remove('calques', c.id);
              if (c.id === text.calqueId) patch('texts', text.id, { calqueId: versions.find((v) => v.id !== c.id)?.id });
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {runningFor(`calque|${text.id}`) && <p className="small muted">A new calque is being generated…</p>}
    </div>
  );
}

function Align({ text }: { text: Text }) {
  const calque = useStore((s) => (text.calqueId ? s.calques[text.calqueId] : undefined));
  const doc = docFor(text);
  const [pi, setPi] = useState(0);
  const [onlyOdd, setOnlyOdd] = useState(false);
  if (!calque || calque.deleted) return <div className="empty">No calque in use.</div>;
  const odd = (i: number) => !calque.slots[i] || /\s/.test(calque.slots[i].replace(/\[[^\]]*\]/g, ''));
  const rows = onlyOdd ? doc.chunks.map((_, i) => i).filter(odd) : doc.chunks.map((_, i) => i).filter((i) => doc.chunks[i].para === pi);
  const setSlot = (i: number, v: string) => {
    if (v === calque.slots[i]) return;
    const slots = [...calque.slots];
    slots[i] = v.trim();
    put('calques', { ...calque, slots });
  };
  return (
    <div>
      <div className="row">
        <select className="input" style={{ width: 'auto' }} value={pi} onChange={(e) => setPi(+e.target.value)} disabled={onlyOdd}>
          {doc.paras.map((p, i) => (
            <option key={i} value={i}>
              ¶ {i + 1}: {doc.plain.slice(p.start, Math.min(p.end, p.start + 40))}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyOdd} onChange={(e) => setOnlyOdd(e.target.checked)} /> Only slots that need a look ({doc.chunks.filter((_, i) => odd(i)).length})
        </label>
      </div>
      <p className="small muted">Edit a gloss and leave the field to save. Notation: word[1:meaning] … part[1] links separated parts.</p>
      <div className="align-grid">
        {rows.map((i) => (
          <label key={`${calque.id}-${i}`} className={`align-row${odd(i) ? ' odd' : ''}`}>
            <span className="src" dir="auto">
              {doc.plain.slice(doc.chunks[i].start, doc.chunks[i].end)}
            </span>
            <input className="input" defaultValue={calque.slots[i]} onBlur={(e) => setSlot(i, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </label>
        ))}
      </div>
    </div>
  );
}

