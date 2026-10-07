import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { go } from '../app/router';
import { confirmDialog, toast } from '../app/ui';
import { languages } from '../data/selectors';
import { alive, getRec, put, remove, uid, useStore } from '../data/store';
import { BUILTIN_PROVIDERS, DEFAULT_BODIES, PLACEHOLDER_HELP, resolveProvider } from '../llm/providers';
import { fillPrompt, modelLabel } from '../llm/run';
import { testModel } from '../llm/queries';
import type { ApiFormat, Language, Model, Prompt, PromptKind, Provider } from '../model/types';
import { Modal } from '../ui/Modal';
import { useOpenRouterModels } from './openrouter';

const KINDS: [PromptKind, string, string][] = [
  ['word', 'Word prompts', 'Used when you tap a word. {word} is the word, {sentence} the sentence around it.'],
  ['passage', 'Passage prompts', 'Used for selected passages. {text} is the passage.'],
  ['calque', 'Calque prompts', 'Used to generate word-for-word mirror translations. {text} is the whole text.'],
];

export function PromptsView({ tab = 'prompts' }: { tab?: string }) {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Prompts & models</h1>
      </div>
      <div className="seg tabs">
        {[
          ['prompts', 'Prompts'],
          ['models', 'Models'],
          ['languages', 'Languages'],
        ].map(([t, l]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => go(`/prompts/${t}`)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'models' ? <Models /> : tab === 'languages' ? <Languages /> : <Prompts />}
    </div>
  );
}

// ---------------------------------------------------------------- prompts

function Prompts() {
  const prompts = useStore((s) => s.prompts);
  useStore((s) => s.langs);
  const [edit, setEdit] = useState<Prompt | null>(null);
  const list = alive(prompts);
  return (
    <>
      {KINDS.map(([kind, title, help]) => (
        <section key={kind} className="section">
          <div className="row">
            <h2 className="grow">{title}</h2>
            <button className="btn small" onClick={() => setEdit({ id: '', name: '', kind, lang: '', template: kind === 'word' ? '{word}' : '{text}', createdAt: 0, updatedAt: 0 })}>
              <Plus size={14} /> New
            </button>
          </div>
          <p className="small faint">{help}</p>
          <div className="list">
            {list
              .filter((p) => p.kind === kind)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <button key={p.id} className="list-row" onClick={() => setEdit(p)}>
                  <div className="grow">
                    <div>{p.name}</div>
                    <div className="small faint clamp">{p.template.replace(/\s+/g, ' ').slice(0, 140)}</div>
                  </div>
                  <span className="badge">{getRec('langs', p.lang)?.name ?? 'any language'}</span>
                </button>
              ))}
          </div>
        </section>
      ))}
      {edit && <PromptEditor prompt={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function PromptEditor({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const [p, setP] = useState(prompt);
  const set = (c: Partial<Prompt>) => setP({ ...p, ...c });
  const preview = fillPrompt(p.template, { word: 'Wachstum', text: 'Die Pflanze, die wächst, treibt einen Schoss zur Rechten.', sentence: 'Die Pflanze, die wächst, treibt einen Schoss zur Rechten.', language: getRec('langs', p.lang)?.name ?? 'German', title: 'Liber Novus', author: 'C. G. Jung' });
  const save = () => {
    put('prompts', { ...p, id: p.id || uid('p'), name: p.name.trim() || 'Untitled prompt', createdAt: p.createdAt || Date.now() });
    onClose();
  };
  return (
    <Modal
      title={p.id ? 'Edit prompt' : 'New prompt'}
      onClose={onClose}
      wide
      footer={
        <div className="row">
          {p.id && (
            <>
              <button
                className="btn ghost danger"
                onClick={async () => {
                  if (await confirmDialog(`Delete prompt “${p.name}”? Saved translations keep its name.`)) {
                    remove('prompts', p.id);
                    onClose();
                  }
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button className="btn ghost" onClick={() => (put('prompts', { ...p, id: uid('p'), name: `${p.name} (copy)`, createdAt: Date.now() }), onClose())}>
                <Copy size={14} /> Duplicate
              </button>
            </>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      }
    >
      <div className="row">
        <label className="field grow">
          <span>Name</span>
          <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!p.id} />
        </label>
        <label className="field">
          <span>Kind</span>
          <select className="input" value={p.kind} onChange={(e) => set({ kind: e.target.value as PromptKind })}>
            <option value="word">Word</option>
            <option value="passage">Passage</option>
            <option value="calque">Calque</option>
          </select>
        </label>
        <label className="field">
          <span>Language</span>
          <select className="input" value={p.lang} onChange={(e) => set({ lang: e.target.value })}>
            <option value="">Any language</option>
            {languages().map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Template</span>
        <textarea className="input" rows={10} value={p.template} onChange={(e) => set({ template: e.target.value })} />
      </label>
      <div className="row small faint">
        Placeholders:{' '}
        {['word', 'text', 'sentence', 'language', 'title', 'author'].map((k) => (
          <button key={k} className="chip" onClick={() => set({ template: `${p.template}{${k}}` })}>{`{${k}}`}</button>
        ))}
      </div>
      <details className="raw">
        <summary>System instruction (optional)</summary>
        <textarea className="input" rows={3} value={p.system ?? ''} onChange={(e) => set({ system: e.target.value || undefined })} />
      </details>
      <details className="raw">
        <summary>Preview with a sample</summary>
        <pre>{preview}</pre>
      </details>
    </Modal>
  );
}

// ---------------------------------------------------------------- models

function Models() {
  const models = useStore((s) => s.models);
  const providers = useStore((s) => s.providers);
  const prefs = useStore((s) => s.prefs.prefs);
  const [edit, setEdit] = useState<Model | null>(null);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const list = alive(models).sort((a, b) => modelLabel(a).localeCompare(modelLabel(b)));
  const active = prefs?.modelId;
  const setActive = (id: string) => put('prefs', { ...(prefs && !prefs.deleted ? prefs : {}), id: 'prefs', updatedAt: 0, modelId: id });
  return (
    <>
      <section className="section">
        <div className="row">
          <h2 className="grow">Models</h2>
          <button className="btn small" onClick={() => setEdit({ id: '', name: '', provider: 'openrouter', model: '', createdAt: 0, updatedAt: 0 })}>
            <Plus size={14} /> New
          </button>
        </div>
        <p className="small faint">The active model answers new requests everywhere; switch it from the reader or a translation too. Edit a model and every prompt uses the change.</p>
        <div className="list">
          {list.map((m) => (
            <div key={m.id} className={`list-row${m.id === active ? ' active' : ''}`}>
              <button className="icon-btn" onClick={() => setActive(m.id)} title="Use this model" aria-label="Use this model">
                {m.id === active ? <Check size={16} /> : <span className="dot" />}
              </button>
              <button className="grow plain" onClick={() => setEdit(m)}>
                <div>{modelLabel(m)}</div>
                <div className="small faint">
                  {resolveProvider(m.provider, providers)?.name ?? m.provider}
                  {m.name ? ` · ${m.model}` : ''}
                </div>
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="row">
          <h2 className="grow">Custom endpoints</h2>
          <button className="btn small" onClick={() => setEditProvider({ id: '', name: '', format: 'openai', baseUrl: '', updatedAt: 0 })}>
            <Plus size={14} /> New
          </button>
        </div>
        <p className="small faint">Any OpenAI-, Gemini- or Anthropic-compatible API: Ollama, LM Studio, DeepSeek, Mistral, Together…</p>
        <div className="list">
          {alive(providers).map((p) => (
            <button key={p.id} className="list-row" onClick={() => setEditProvider(p)}>
              <div className="grow">
                <div>{p.name}</div>
                <div className="small faint">
                  {p.format} · {p.baseUrl}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
      {edit && <ModelEditor model={edit} onClose={() => setEdit(null)} />}
      {editProvider && <ProviderEditor provider={editProvider} onClose={() => setEditProvider(null)} />}
    </>
  );
}

function ModelEditor({ model, onClose }: { model: Model; onClose: () => void }) {
  const providers = useStore((s) => s.providers);
  const models = useStore((s) => s.models);
  const translations = useStore((s) => s.translations);
  const [m, setM] = useState(model);
  const [test, setTest] = useState<string>('');
  const set = (c: Partial<Model>) => setM({ ...m, ...c });
  const provider = resolveProvider(m.provider, providers);
  const format: ApiFormat = provider?.format ?? 'openai';
  const catalog = useOpenRouterModels(m.provider === 'openrouter');
  const history = useMemo(() => {
    const out = new Set<string>();
    for (const x of alive(models)) if (x.provider === m.provider && x.model) out.add(x.model);
    for (const t of alive(translations)) if (t.provider === m.provider || t.provider === 'OpenRouter') t.model && !t.model.includes(' ') && out.add(t.model);
    return [...out];
  }, [models, translations, m.provider]);
  const options = [...new Set([...history, ...catalog.map((c) => c.id)])];
  const info = catalog.find((c) => c.id === m.model);

  useEffect(() => setTest(''), [m.model, m.provider]);
  const save = (asNew = false) => {
    const id = asNew || !m.id ? uid('m') : m.id;
    put('models', { ...m, id, name: asNew ? `${modelLabel(m)} (copy)` : m.name.trim(), createdAt: m.createdAt || Date.now() });
    onClose();
  };
  const runTest = async () => {
    setTest('Testing…');
    try {
      setTest(await testModel({ ...m, id: m.id || 'test' }));
    } catch (e) {
      setTest(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <Modal
      title={m.id ? 'Edit model' : 'New model'}
      onClose={onClose}
      wide
      footer={
        <div className="row">
          {m.id && (
            <>
              <button
                className="btn ghost danger"
                onClick={async () => {
                  if (await confirmDialog(`Delete model “${modelLabel(m)}”?`)) {
                    remove('models', m.id);
                    onClose();
                  }
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button className="btn ghost" onClick={() => save(true)}>
                <Copy size={14} /> Save as copy
              </button>
            </>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => save()} disabled={!m.model.trim()}>
            Save
          </button>
        </div>
      }
    >
      <div className="row">
        <label className="field grow">
          <span>Provider</span>
          <select className="input" value={m.provider} onChange={(e) => set({ provider: e.target.value })}>
            {BUILTIN_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {alive(providers).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (custom)
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span>{m.provider === 'web' ? 'Site name' : 'Model path'}</span>
          <input className="input" list="model-options" value={m.model} onChange={(e) => set({ model: e.target.value })} placeholder={m.provider === 'openrouter' ? 'e.g. anthropic/claude-opus-5.5' : ''} />
          <datalist id="model-options">
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
      </div>
      {info && (
        <p className="small faint">
          {info.name} · context {Math.round(info.context / 1000)}k · {info.free ? 'free' : `$${info.inPrice}/M in, $${info.outPrice}/M out`}
        </p>
      )}
      <label className="field">
        <span>Display name (optional — defaults to the model path)</span>
        <input className="input" value={m.name} onChange={(e) => set({ name: e.target.value })} placeholder={m.model} />
      </label>
      {m.provider === 'web' ? (
        <label className="field">
          <span>Chat site URL</span>
          <input className="input" value={m.siteUrl ?? ''} onChange={(e) => set({ siteUrl: e.target.value })} placeholder="https://claude.ai/new" />
        </label>
      ) : (
        <>
          <div className="row">
            <label className="field grow">
              <span>Temperature (blank = provider default)</span>
              <input className="input" type="number" step={0.1} min={0} max={2} value={m.temperature ?? ''} onChange={(e) => set({ temperature: e.target.value === '' ? undefined : +e.target.value })} />
            </label>
            <label className="field grow">
              <span>Max output tokens</span>
              <input className="input" type="number" step={256} min={1} value={m.maxTokens ?? ''} onChange={(e) => set({ maxTokens: e.target.value === '' ? undefined : +e.target.value })} />
            </label>
          </div>
          <details className="raw" open={!!m.body}>
            <summary>Request body template {m.body && <span className="badge">custom</span>}</summary>
            <p className="small faint">
              JSON sent to the API. Placeholders become JSON values; fields that end up null are dropped. Add anything the API accepts, e.g. OpenRouter{' '}
              <code>"reasoning": {'{'} "effort": "low" {'}'}</code> to speed up thinking models.
            </p>
            <textarea className="input code" rows={12} spellCheck={false} value={m.body ?? (format === 'web' ? '' : DEFAULT_BODIES[format])} onChange={(e) => set({ body: e.target.value })} />
            <div className="row small faint">
              {Object.entries(PLACEHOLDER_HELP).map(([k, v]) => (
                <span key={k} className="badge mono" title={v}>{`{${k}}`}</span>
              ))}
              {m.body && (
                <button className="btn small ghost" onClick={() => set({ body: undefined })}>
                  Reset to default
                </button>
              )}
            </div>
          </details>
          <div className="row">
            <button className="btn" onClick={runTest} disabled={!m.model.trim()}>
              Test connection
            </button>
            {test && <span className={`small ${test.startsWith('Failed') ? 'error-text' : 'muted'}`}>{test}</span>}
          </div>
        </>
      )}
    </Modal>
  );
}

function ProviderEditor({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const [p, setP] = useState(provider);
  const [key, setKey] = useState(getRec('secrets', provider.id)?.key ?? '');
  const save = () => {
    const id = p.id || uid('prov');
    put('providers', { ...p, id, name: p.name.trim() || 'Custom endpoint', baseUrl: p.baseUrl.trim().replace(/\/+$/, '') });
    if (key.trim()) put('secrets', { id, key: key.trim(), updatedAt: 0 });
    onClose();
  };
  return (
    <Modal
      title={p.id ? 'Edit endpoint' : 'New endpoint'}
      onClose={onClose}
      footer={
        <div className="row">
          {p.id && (
            <button className="btn ghost danger" onClick={async () => (await confirmDialog(`Delete “${p.name}”?`)) && (remove('providers', p.id), onClose())}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <span className="grow" />
          <button className="btn primary" onClick={save} disabled={!p.baseUrl.trim()}>
            Save
          </button>
        </div>
      }
    >
      <label className="field">
        <span>Name</span>
        <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Local Ollama" />
      </label>
      <label className="field">
        <span>API format</span>
        <select className="input" value={p.format} onChange={(e) => setP({ ...p, format: e.target.value as ApiFormat })}>
          <option value="openai">OpenAI compatible (…/chat/completions)</option>
          <option value="gemini">Gemini (…/models/X:streamGenerateContent)</option>
          <option value="anthropic">Anthropic (…/messages)</option>
        </select>
      </label>
      <label className="field">
        <span>Base URL</span>
        <input className="input" value={p.baseUrl} onChange={(e) => setP({ ...p, baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" />
      </label>
      <label className="field">
        <span>API key (optional)</span>
        <input className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
      </label>
    </Modal>
  );
}

// ---------------------------------------------------------------- languages

function Languages() {
  const langs = useStore((s) => s.langs);
  const texts = useStore((s) => s.texts);
  const [edit, setEdit] = useState<Language | null>(null);
  const used = (id: string) => alive(texts).filter((t) => t.lang === id).length;
  return (
    <section className="section">
      <div className="row">
        <h2 className="grow">Languages</h2>
        <button className="btn small" onClick={() => setEdit({ id: '', name: '', updatedAt: 0 })}>
          <Plus size={14} /> New
        </button>
      </div>
      <p className="small faint">Word translations are shared by all texts of the same language.</p>
      <div className="list">
        {alive(langs)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((l) => (
            <button key={l.id} className="list-row" onClick={() => setEdit(l)}>
              <div className="grow">
                {l.name} {l.rtl && <span className="badge">right-to-left</span>}
              </div>
              <span className="small faint">{used(l.id)} texts</span>
            </button>
          ))}
      </div>
      {edit && (
        <Modal
          title={edit.id ? 'Edit language' : 'New language'}
          onClose={() => setEdit(null)}
          footer={
            <div className="row">
              {edit.id && !used(edit.id) && (
                <button className="btn ghost danger" onClick={() => (remove('langs', edit.id), setEdit(null))}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <span className="grow" />
              <button
                className="btn primary"
                disabled={!edit.name.trim()}
                onClick={() => {
                  put('langs', { ...edit, id: edit.id || uid('lang'), name: edit.name.trim() });
                  setEdit(null);
                  toast('Language saved.');
                }}
              >
                Save
              </button>
            </div>
          }
        >
          <label className="field">
            <span>Name</span>
            <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Code (for speech and Wiktionary, e.g. de, he, grc, la)</span>
            <input className="input" value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value || undefined })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={!!edit.rtl} onChange={(e) => setEdit({ ...edit, rtl: e.target.checked })} /> Right-to-left script
          </label>
        </Modal>
      )}
    </section>
  );
}
