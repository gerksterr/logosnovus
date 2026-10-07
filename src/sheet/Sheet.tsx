import { Bug, ChevronLeft, ChevronRight, Copy, ExternalLink, RefreshCw, Square, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackClose } from '../app/router';
import { closeSheet, confirmDialog, toast, useUI, type SheetState } from '../app/ui';
import { langName, promptsFor, targetKey, versionsFor } from '../data/selectors';
import { alive, getRec, remove, useStore } from '../data/store';
import { markSeen, planLookup, saveTranslation, startLookup, stopQuery, useQueries, type Query } from '../llm/queries';
import { activeModel, modelLabel, prepare } from '../llm/run';
import type { Translation } from '../model/types';
import { Markdown } from '../ui/Markdown';
import { ModelSwitch } from '../ui/ModelSwitch';
import { Chat } from './Chat';
import { Dictionary } from './Dictionary';

export function Sheet() {
  const sheet = useUI((s) => s.sheet);
  useBackClose(!!sheet, closeSheet);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !useUI.getState().dialog && !useUI.getState().menu && closeSheet();
    // wide screens: a click on empty space beside the text closes the panel
    const onDown = (e: MouseEvent) => {
      if (innerWidth < 1100) return;
      const t = e.target as HTMLElement;
      if (!t.closest('.sheet, .text, .menu-backdrop, .backdrop, .reader-bar, .dock, .sel-bar, .mode-bar, .minimap, nav, .topbar, .toasts')) closeSheet();
    };
    addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [!!sheet]);
  if (!sheet) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={closeSheet} />
      <section className="sheet" aria-label="Translation">
        <SheetBody sheet={sheet} />
      </section>
    </>,
    document.body,
  );
}

const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function SheetBody({ sheet }: { sheet: SheetState }) {
  const { target } = sheet;
  const key = targetKey(target);
  const translations = useStore((s) => s.translations);
  const versions = useMemo(() => versionsFor(target, translations), [translations, key]);
  const query = useQueries((s) => (sheet.queryId ? s.queries.find((q) => q.id === sheet.queryId) : undefined));
  const [vid, setVid] = useState<string | undefined>(sheet.versionId);
  const [composer, setComposer] = useState(false);
  const [debug, setDebug] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);

  useEffect(() => setVid(sheet.versionId), [sheet.versionId, key]);
  // A request that finished while we look at it: show the saved result and clear its dock entry.
  useEffect(() => {
    if (query?.status === 'done' && query.resultId) {
      setVid(query.resultId);
      markSeen(query.id);
    }
  }, [query?.status, query?.resultId, query?.id]);

  const live = query && query.status !== 'done' ? query : undefined;
  const idx = Math.max(0, versions.findIndex((v) => v.id === vid));
  const version: Translation | undefined = live ? undefined : versions[idx];
  const isWord = target.kind === 'word';

  const startNew = (opts: { promptId?: string; modelId?: string; promptText?: string; body?: string } = {}) => {
    const id = startLookup(target, opts);
    setComposer(false);
    if (id) useUI.setState({ sheet: { target, queryId: id, mode: 'view' } });
    else useUI.setState({ sheet: { target, mode: 'web', modelId: opts.modelId } });
  };

  return (
    <>
      <header className="sheet-head">
        <div className="grow">
          <div className={`sheet-target${isWord ? '' : ' passage'}${passageOpen ? ' open' : ''}`} dir="auto" lang={getRec('langs', target.lang)?.code} onClick={() => setPassageOpen(!passageOpen)}>
            {target.text}
          </div>
          <div className="small faint">
            {isWord ? 'Word' : 'Passage'} · {langName(target.lang) || 'unknown language'}
            {isWord && target.sentence && target.sentence !== target.text ? ` · “${target.sentence.slice(0, 90)}${target.sentence.length > 90 ? '…' : ''}”` : ''}
          </div>
        </div>
        <button className="icon-btn sheet-close" onClick={closeSheet} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      {sheet.mode === 'dict' ? (
        <div className="sheet-scroll">
          <Dictionary target={target} onAskAI={() => (versions.length ? useUI.setState({ sheet: { target, mode: 'view' } }) : startNew())} />
        </div>
      ) : sheet.mode === 'web' ? (
        <div className="sheet-scroll">
          <WebAssist sheet={sheet} onSaved={(id) => useUI.setState({ sheet: { target, mode: 'view', versionId: id } })} />
        </div>
      ) : (
        <>
          <div className="sheet-bar">
            {versions.length > 1 && !live && (
              <div className="row versions">
                <button className="icon-btn" disabled={idx >= versions.length - 1} onClick={() => setVid(versions[idx + 1].id)} aria-label="Older version">
                  <ChevronLeft size={16} />
                </button>
                <span className="small">
                  {versions.length - idx} / {versions.length}
                </span>
                <button className="icon-btn" disabled={idx === 0} onClick={() => setVid(versions[idx - 1].id)} aria-label="Newer version">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <div className="meta small faint grow">
              {live
                ? `${live.model}${live.status === 'running' ? ' · streaming' : ''}`
                : version
                  ? [fmtDate(version.createdAt), version.servedBy || version.model, version.promptName].filter(Boolean).join(' · ')
                  : ''}
            </div>
            {live?.status === 'running' ? (
              <button className="btn small" onClick={() => stopQuery(live.id)}>
                <Square size={13} /> Stop
              </button>
            ) : (
              <>
                <button className="btn small" onClick={() => startNew()} title="New translation with the default prompt and model">
                  <RefreshCw size={13} /> New
                </button>
                <button className={`btn small ghost${composer ? ' on' : ''}`} onClick={() => setComposer(!composer)}>
                  Options
                </button>
              </>
            )}
            {(version || live) && (
              <button className={`icon-btn${debug ? ' on' : ''}`} onClick={() => setDebug(!debug)} title="Raw request and response">
                <Bug size={15} />
              </button>
            )}
            {version && !live && (
              <>
                <button className="icon-btn" onClick={() => navigator.clipboard.writeText(version.content).then(() => toast('Copied.'))} title="Copy">
                  <Copy size={15} />
                </button>
                <button
                  className="icon-btn"
                  title="Delete this version"
                  onClick={async () => {
                    if (await confirmDialog(versions.length > 1 ? 'Delete this version? The others stay.' : 'Delete this translation?')) {
                      remove('translations', version.id);
                      if (versions.length <= 1) closeSheet();
                      else setVid(versions[idx === 0 ? 1 : idx - 1].id);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
          <div className="sheet-scroll">
            {composer && <Composer sheet={sheet} onSend={startNew} />}
            {debug && <Debug query={query} version={version} />}
            {live ? <LiveQuery q={live} onRetry={() => startNew()} /> : version ? <VersionView v={version} /> : <div className="empty">No translation yet.</div>}
          </div>
        </>
      )}
    </>
  );
}

function Reasoning({ text, live }: { text: string; live?: boolean }) {
  if (!text) return null;
  return (
    <details className="reasoning">
      <summary>
        {live && <span className="spin" />} Reasoning{live ? '…' : ''} <span className="faint">({text.length} chars)</span>
      </summary>
      <div className="reasoning-text">{text}</div>
    </details>
  );
}

function LiveQuery({ q, onRetry }: { q: Query; onRetry: () => void }) {
  const secs = Math.round((Date.now() - q.startedAt) / 1000);
  return (
    <div className="live">
      <Reasoning text={q.reasoning} live={q.status === 'running' && !q.content} />
      {q.content ? (
        <Markdown text={q.content} />
      ) : q.status === 'running' ? (
        <div className="row muted small">
          <span className="spin" /> {q.reasoning ? 'The model is reasoning…' : `Waiting for ${q.model}…`} {secs > 3 ? `${secs}s` : ''}
        </div>
      ) : null}
      {q.status === 'error' && (
        <div className="error-box">
          <p>{q.error}</p>
          <button className="btn small" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {q.status === 'stopped' && (
        <div className="row small muted">
          Stopped — this partial answer was not saved.
          <button className="btn small" onClick={onRetry}>
            Run again
          </button>
        </div>
      )}
    </div>
  );
}

function VersionView({ v }: { v: Translation }) {
  return (
    <div>
      <Reasoning text={v.reasoning ?? ''} />
      <Markdown text={v.content} />
      <Chat translationId={v.id} />
    </div>
  );
}

function Composer({ sheet, onSend }: { sheet: SheetState; onSend: (o: { promptId?: string; modelId?: string; promptText?: string; body?: string }) => void }) {
  const { target } = sheet;
  const prompts = useStore((s) => s.prompts);
  const list = promptsFor(target.kind, target.lang, prompts);
  const initial = planLookup(target);
  const [promptId, setPromptId] = useState(initial.prompt?.id ?? '');
  const [modelId, setModelId] = useState(activeModel()?.id ?? '');
  const plan = useMemo(() => planLookup(target, promptId, modelId), [target, promptId, modelId]);
  const [text, setText] = useState(plan.text);
  const [body, setBody] = useState<string | null>(null);
  useEffect(() => setText(plan.text), [plan.text]);
  const model = getRec('models', modelId);
  const generated = useMemo(() => {
    if (!model || model.provider === 'web') return '';
    try {
      return prepare(model, [...(plan.prompt?.system ? [{ role: 'system' as const, content: plan.prompt.system }] : []), { role: 'user', content: text }]).body;
    } catch (e) {
      return `// ${(e as Error).message}`;
    }
  }, [model, text, plan.prompt]);
  return (
    <div className="composer">
      <div className="row">
        <select className="input grow" value={promptId} onChange={(e) => setPromptId(e.target.value)} aria-label="Prompt">
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="grow">
          <ModelSwitch value={modelId} onChange={setModelId} />
        </div>
      </div>
      <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Prompt text" />
      {model?.provider !== 'web' && (
        <details className="raw">
          <summary>Request JSON {body != null && <span className="chip">edited</span>}</summary>
          <textarea className="input code" rows={10} spellCheck={false} value={body ?? generated} onChange={(e) => setBody(e.target.value)} />
        </details>
      )}
      <div className="row end">
        <button className="btn primary" onClick={() => onSend({ promptId, modelId, promptText: text, body: body ?? undefined })}>
          {model?.provider === 'web' ? 'Use web chat' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function Debug({ query, version }: { query?: Query; version?: Translation }) {
  return (
    <div className="debug">
      {query?.request && (
        <>
          <div className="small faint">POST {query.request.url}</div>
          <pre>{query.request.body}</pre>
        </>
      )}
      {query?.events && (
        <>
          <div className="small faint">Response events ({query.events.length}{query.events.length >= 400 ? ', capped' : ''})</div>
          <pre>{query.events.join('\n')}</pre>
        </>
      )}
      {version && !query?.request && (
        <>
          <div className="small faint">Saved request</div>
          <pre>{JSON.stringify({ prompt: version.prompt, model: version.model, servedBy: version.servedBy, provider: version.provider, created: new Date(version.createdAt).toISOString() }, null, 2)}</pre>
          <div className="small faint">Raw request/response bodies are kept for requests made in this session.</div>
        </>
      )}
    </div>
  );
}

/** Copy & paste through a chat website (Claude.ai, ChatGPT, AI Studio…) — no API key needed. */
function WebAssist({ sheet, onSaved }: { sheet: SheetState; onSaved: (id: string) => void }) {
  const { target } = sheet;
  const models = useStore((s) => s.models);
  const webModels = alive(models).filter((m) => m.provider === 'web');
  const active = activeModel();
  const [modelId, setModelId] = useState((sheet.modelId && models[sheet.modelId]?.provider === 'web' ? sheet.modelId : active?.provider === 'web' ? active.id : webModels[0]?.id) ?? '');
  const plan = planLookup(target, undefined, modelId);
  const [answer, setAnswer] = useState('');
  const model = getRec('models', modelId);
  useEffect(() => {
    navigator.clipboard?.writeText(plan.text).catch(() => {});
  }, [plan.text]);
  const save = () => {
    const t = saveTranslation(target, { prompt: plan.text, promptName: plan.prompt?.name, model: model ? modelLabel(model) : 'web chat', provider: 'web', content: answer.trim() });
    onSaved(t.id);
  };
  return (
    <div className="web-assist">
      <p className="small muted">The prompt is on your clipboard. Paste it into the chat, then paste the answer here.</p>
      <div className="row">
        <select className="input grow" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {webModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.model}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => navigator.clipboard.writeText(plan.text).then(() => toast('Prompt copied.'))}>
          <Copy size={14} /> Copy prompt
        </button>
        {model?.siteUrl && (
          <a className="btn" href={model.siteUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Open {model.model}
          </a>
        )}
      </div>
      <details className="raw">
        <summary>Prompt</summary>
        <pre>{plan.text}</pre>
      </details>
      <textarea className="input" rows={8} placeholder="Paste the answer here" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="row end">
        <button
          className="btn ghost"
          onClick={() =>
            navigator.clipboard
              .readText()
              .then(setAnswer)
              .catch(() => toast('Clipboard access was blocked; paste manually.', 'error'))
          }
        >
          Paste from clipboard
        </button>
        <button className="btn primary" disabled={!answer.trim()} onClick={save}>
          Save translation
        </button>
      </div>
      {answer.trim() && <Markdown text={answer} />}
    </div>
  );
}
