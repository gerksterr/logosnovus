import { BookA, Bug, CircleAlert, Columns2, Copy, Cpu, ExternalLink, Globe, Layers, RefreshCw, SlidersHorizontal, Sparkles, Square, Trash2, Users, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { go, useBackClose } from '../app/router';
import { closeSheet, confirmDialog, toast, useUI, type SheetState } from '../app/ui';
import { docSig } from '../calque/align';
import { parseSlot } from '../calque/notation';
import { docFor, langName, promptsFor, targetKey, versionsFor, type Target } from '../data/selectors';
import { alive, getRec, remove, useStore } from '../data/store';
import { dismissQuery, isFor, markSeen, planLookup, saveTranslation, startLookup, stopQuery, useQueries, type Query } from '../llm/queries';
import { activeModel, modelLabel, prepare } from '../llm/run';
import type { Translation } from '../model/types';
import { speak } from '../reader/speech';
import { wordKey } from '../text/document';
import { Markdown } from '../ui/Markdown';
import { hasKey, ModelPicker, providerName } from '../ui/ModelPicker';
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
      if (!t.closest('.sheet, .text, .menu-backdrop, .mp-backdrop, .backdrop, .reader-bar, .reader-head, .dock, .sel-bar, .mode-bar, .minimap, nav, .topbar, .toasts')) closeSheet();
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
      <SheetBody key={targetKey(sheet.target)} sheet={sheet} />
    </>,
    document.body,
  );
}

const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const shortModel = (m?: string) => (m ?? '').split('/').pop() || 'model';

/** Word-for-word rendering of the target from the text's active calque (instant, offline). */
function calqueGloss(target: Target): string | null {
  const text = getRec('texts', target.textId);
  const cq = getRec('calques', text?.calqueId);
  if (!text || !cq || !target.anchor) return null;
  const doc = docFor(text);
  if (cq.sig !== docSig(doc)) return null;
  const [a, b] = target.anchor;
  const parts: string[] = [];
  for (let i = 0; i < doc.chunks.length; i++) {
    const c = doc.chunks[i];
    if (c.end <= a || c.start >= b || !cq.slots[i]) continue;
    const slot = parseSlot(cq.slots[i], doc.plain.slice(c.start, c.end));
    if (slot.meaning && target.kind === 'word') return slot.meaning; // separable verb: the compound meaning
    parts.push(slot.gloss.plain);
  }
  const out = parts.join(' ').replace(/\s+/g, ' ').trim();
  return out || null;
}

type Panel = null | 'composer' | 'many' | 'debug';

function SheetBody({ sheet }: { sheet: SheetState }) {
  const { target } = sheet;
  const key = targetKey(target);
  const translations = useStore((s) => s.translations);
  const versions = useMemo(() => versionsFor(target, translations), [translations, key]);
  const queries = useQueries((s) => s.queries);
  const mine = useMemo(() => queries.filter((q) => q.kind !== 'chat' && isFor(q, key)), [queries, key]);
  const live = mine.filter((q) => q.status !== 'done');
  const [openedAt] = useState(Date.now);
  const [sel, setSel] = useState<{ q?: string; v?: string }>(() => (sheet.queryId ? { q: sheet.queryId } : { v: sheet.versionId }));
  const [panel, setPanel] = useState<Panel>(null);
  const [compare, setCompare] = useState<[string, string] | null>(null);

  useEffect(() => {
    if (sheet.queryId) setSel({ q: sheet.queryId });
    else if (sheet.versionId) setSel({ v: sheet.versionId });
  }, [sheet.queryId, sheet.versionId]);
  // finished requests are saved versions now: show them and clear them from the dock
  useEffect(() => {
    for (const q of mine)
      if (q.status === 'done' && q.resultId) {
        if (!q.seen) markSeen(q.id);
        if (sel.q === q.id) setSel({ v: q.resultId });
      }
  }, [mine, sel.q]);

  const selQuery = sel.q ? live.find((q) => q.id === sel.q) : undefined;
  const version: Translation | undefined = selQuery ? undefined : (versions.find((v) => v.id === sel.v) ?? versions[0]);

  const startNew = (opts: { promptId?: string; modelId?: string; promptText?: string; body?: string } = {}) => {
    const id = startLookup(target, opts);
    setPanel(null);
    setCompare(null);
    if (id) setSel({ q: id });
    else useUI.setState({ sheet: { target, mode: 'web', modelId: opts.modelId ?? planLookup(target, opts.promptId).model?.id } });
  };
  const askMany = (modelIds: string[], promptId?: string) => {
    const ids = modelIds.map((m) => startLookup(target, { modelId: m, promptId, lane: true })).filter(Boolean) as string[];
    setPanel(null);
    setCompare(null);
    if (ids[0]) setSel({ q: ids[0] });
  };

  const del = async (v: Translation) => {
    if (!(await confirmDialog(versions.length > 1 ? 'Delete this version? The others stay.' : 'Delete this translation?'))) return;
    const i = versions.findIndex((x) => x.id === v.id);
    remove('translations', v.id);
    if (versions.length <= 1) closeSheet();
    else setSel({ v: versions[i === 0 ? 1 : i - 1].id });
  };

  return (
    <section className={`sheet${compare ? ' wide' : ''}`} aria-label="Translation">
      <SheetHead sheet={sheet} versions={versions} />
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
          {(versions.length > 0 || live.length > 0) && (
            <div className="vstrip" role="tablist" aria-label="Versions">
              {live.map((q) => (
                <span key={q.id} className={`vchip live ${q.status}${selQuery?.id === q.id && !compare ? ' on' : ''}`}>
                  <button onClick={() => (setSel({ q: q.id }), setCompare(null))} title={q.error ?? `${q.model} · ${q.status}`}>
                    {q.status === 'running' ? <span className="spin" /> : <CircleAlert size={13} />}
                    <span className="vm">{shortModel(q.model)}</span>
                  </button>
                  {q.status !== 'running' && (
                    <button className="vx" onClick={() => dismissQuery(q.id)} aria-label="Dismiss">
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
              {versions.map((v, i) => (
                <span key={v.id} className={`vchip${version?.id === v.id && !compare ? ' on' : ''}${compare?.includes(v.id) ? ' cmp' : ''}`}>
                  <button onClick={() => (setSel({ v: v.id }), setCompare(null))} title={`${fmtDate(v.createdAt)} · ${v.servedBy || v.model || ''} · ${v.promptName ?? ''}`}>
                    <span className="vn">{versions.length - i}</span>
                    <span className="vm">{v.provider === 'web' ? shortModel(v.model) || 'web' : shortModel(v.servedBy || v.model)}</span>
                    <span className="vd">{shortDate(v.createdAt)}</span>
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="sh-actions">
            {selQuery?.status === 'running' ? (
              <button className="btn small" onClick={() => stopQuery(selQuery.id)}>
                <Square size={13} /> Stop
              </button>
            ) : (
              <button className="btn small amber" onClick={() => startNew()} title="Ask again with this text's prompt and model">
                <RefreshCw size={13} /> {versions.length ? 'New' : 'Ask'}
              </button>
            )}
            <button className={`btn small${panel === 'composer' ? ' on' : ''}`} onClick={() => setPanel(panel === 'composer' ? null : 'composer')} title="Choose prompt and model, edit the prompt or the raw request">
              <SlidersHorizontal size={13} /> Options
            </button>
            <button className={`btn small${panel === 'many' ? ' on' : ''}`} onClick={() => setPanel(panel === 'many' ? null : 'many')} title="Ask several models at once and compare">
              <Users size={13} /> Several models
            </button>
            {versions.length > 1 && (
              <button
                className={`btn small hide-mobile-narrow${compare ? ' on' : ''}`}
                onClick={() => setCompare(compare ? null : [version?.id ?? versions[0].id, versions.find((v) => v.id !== (version?.id ?? versions[0].id))!.id])}
              >
                <Columns2 size={13} /> Compare
              </button>
            )}
          </div>
          <div className="sheet-scroll">
            {panel === 'composer' && <Composer sheet={sheet} onSend={startNew} />}
            {panel === 'many' && <AskMany target={target} onSend={askMany} />}
            {panel === 'debug' && <Debug query={selQuery ?? mine.find((q) => q.resultId && q.resultId === version?.id)} version={version} />}
            {compare ? (
              <Compare versions={versions} pair={compare} onChange={setCompare} />
            ) : selQuery ? (
              <LiveQuery q={selQuery} onRetry={() => startNew()} debug={panel === 'debug'} onDebug={() => setPanel(panel === 'debug' ? null : 'debug')} />
            ) : version ? (
              <VersionView
                v={version}
                recalled={version.createdAt < openedAt - 4000}
                tools={
                  <>
                    <button className={`icon-btn${panel === 'debug' ? ' on' : ''}`} onClick={() => setPanel(panel === 'debug' ? null : 'debug')} title="Raw request and response">
                      <Bug size={15} />
                    </button>
                    <button className="icon-btn" onClick={() => navigator.clipboard.writeText(version.content).then(() => toast('Copied.'))} title="Copy">
                      <Copy size={15} />
                    </button>
                    <button className="icon-btn" title="Delete this version" onClick={() => void del(version)}>
                      <Trash2 size={15} />
                    </button>
                  </>
                }
              />
            ) : (
              <div className="empty">No translation yet.</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SheetHead({ sheet, versions }: { sheet: SheetState; versions: Translation[] }) {
  const { target } = sheet;
  const isWord = target.kind === 'word';
  const phrase = isWord && /\s|…|\.\.\./.test(target.text.trim());
  const lang = getRec('langs', target.lang);
  const textRec = getRec('texts', target.textId);
  const [passageOpen, setPassageOpen] = useState(false);
  const gloss = useMemo(() => calqueGloss(target), [target]);
  const others = useMemo(() => {
    const ids = [...new Set(versions.map((v) => v.textId))].filter((id) => id !== target.textId);
    return ids.map((id) => getRec('texts', id)).filter(Boolean).map((t) => t!);
  }, [versions, target.textId]);
  const here = useMemo(() => {
    if (!isWord || !textRec || phrase) return 0;
    const k = wordKey(target.text);
    return docFor(textRec).words.filter((w) => w.letters && wordKey(w.text) === k).length;
  }, [isWord, textRec, target.text, phrase]);

  return (
    <header className="sheet-head">
      <div className="sh-top">
        <span className={`badge caps ${isWord ? (phrase ? 'cyan' : 'amber') : 'violet'}`}>
          <Sparkles size={11} /> {phrase ? 'Phrase' : isWord ? 'Word' : 'Passage'}
        </span>
        <span className="sh-src" title={textRec?.title}>
          {[langName(target.lang), textRec?.title].filter(Boolean).join(' · ')}
        </span>
        <button className="icon-btn" onClick={() => speak(target.text, lang?.code)} title="Speak" aria-label="Speak">
          <Volume2 size={17} />
        </button>
        {isWord && (
          <button
            className={`icon-btn${sheet.mode === 'dict' ? ' on' : ''}`}
            onClick={() => useUI.setState({ sheet: { ...sheet, mode: sheet.mode === 'dict' ? 'view' : 'dict' } })}
            title="Dictionary (Wiktionary)"
            aria-label="Dictionary"
          >
            <BookA size={17} />
          </button>
        )}
        <button className="icon-btn" onClick={closeSheet} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className={`sheet-target${isWord ? '' : ' passage'}${passageOpen ? ' open' : ''}`} dir="auto" lang={lang?.code} onClick={() => setPassageOpen(!passageOpen)}>
        {target.text}
      </div>
      {gloss && (
        <div className={`sh-gloss${isWord ? '' : ' passage'}`} title="From this text's calque (word for word)">
          <Layers size={13} /> <span>{gloss}</span>
        </div>
      )}
      {isWord && target.sentence && target.sentence !== target.text && <Sentence sentence={target.sentence} word={target.text} lang={lang?.code} />}
      {(here > 1 || others.length > 0) && (
        <div className="sh-others small">
          {here > 1 && <span>{here}× in this text</span>}
          {others.length > 0 && (
            <span>
              also looked up in{' '}
              {others.slice(0, 3).map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ', '}
                  <button className="linkish" onClick={() => go(`/read/${encodeURIComponent(t.id)}`)}>
                    {t.title}
                  </button>
                </span>
              ))}
              {others.length > 3 ? ` +${others.length - 3}` : ''}
            </span>
          )}
          {isWord && (
            <button className="linkish" onClick={() => go(`/lexicon/${encodeURIComponent(target.lang)}/${encodeURIComponent(target.text)}`)}>
              <BookA size={13} /> Lexicon
            </button>
          )}
        </div>
      )}
    </header>
  );
}

function Sentence({ sentence, word, lang }: { sentence: string; word: string; lang?: string }) {
  const s = sentence.length > 220 ? `${sentence.slice(0, 220)}…` : sentence;
  const i = s.indexOf(word);
  return (
    <div className="sh-sentence" dir="auto" lang={lang}>
      {i < 0 ? (
        s
      ) : (
        <>
          {s.slice(0, i)}
          <mark>{word}</mark>
          {s.slice(i + word.length)}
        </>
      )}
    </div>
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

function LiveQuery({ q, onRetry, debug, onDebug }: { q: Query; onRetry: () => void; debug: boolean; onDebug: () => void }) {
  const secs = Math.round((Date.now() - q.startedAt) / 1000);
  return (
    <div className="live">
      <div className="sh-meta">
        <span className="badge cyan">
          <Cpu size={11} /> {q.model}
        </span>
        {q.status === 'running' && <span className="small faint">streaming…</span>}
        <span className="tools">
          <button className={`icon-btn${debug ? ' on' : ''}`} onClick={onDebug} title="Raw request and response">
            <Bug size={15} />
          </button>
        </span>
      </div>
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

function VersionMeta({ v, recalled, tools }: { v: Translation; recalled?: boolean; tools?: React.ReactNode }) {
  const web = v.provider === 'web';
  return (
    <div className="sh-meta">
      <span className={`badge ${web ? 'violet' : 'cyan'}`} title={v.model}>
        {web ? <Globe size={11} /> : <Cpu size={11} />} {v.servedBy || v.model || 'unknown model'}
      </span>
      {v.promptName && (
        <span className={`badge ${v.kind === 'word' ? 'amber' : 'violet'}`}>
          <Sparkles size={11} /> {v.promptName}
        </span>
      )}
      {recalled && <span className="badge green">Saved</span>}
      <span className="small faint">{fmtDate(v.createdAt)}</span>
      {tools && <span className="tools">{tools}</span>}
    </div>
  );
}

function VersionView({ v, recalled, tools }: { v: Translation; recalled?: boolean; tools?: React.ReactNode }) {
  return (
    <div>
      <VersionMeta v={v} recalled={recalled} tools={tools} />
      <Reasoning text={v.reasoning ?? ''} />
      <Markdown text={v.content} />
      <Chat translationId={v.id} />
    </div>
  );
}

/** Two versions side by side (stacked on phones). */
function Compare({ versions, pair, onChange }: { versions: Translation[]; pair: [string, string]; onChange: (p: [string, string]) => void }) {
  const label = (v: Translation, i: number) => `#${versions.length - i} · ${shortModel(v.servedBy || v.model)} · ${shortDate(v.createdAt)}${v.promptName ? ` · ${v.promptName}` : ''}`;
  return (
    <div className="compare">
      {pair.map((id, side) => {
        const v = versions.find((x) => x.id === id) ?? versions[side];
        return (
          <div key={side} className="compare-col">
            <select className="input" value={v.id} onChange={(e) => onChange(side ? [pair[0], e.target.value] : [e.target.value, pair[1]])}>
              {versions.map((x, i) => (
                <option key={x.id} value={x.id}>
                  {label(x, i)}
                </option>
              ))}
            </select>
            <Markdown text={v.content} />
          </div>
        );
      })}
    </div>
  );
}

/** One question to several models at once; each answer becomes a version. */
function AskMany({ target, onSend }: { target: Target; onSend: (ids: string[], promptId?: string) => void }) {
  const models = useStore((s) => s.models);
  const prompts = useStore((s) => s.prompts);
  const api = alive(models)
    .filter((m) => m.provider !== 'web')
    .sort((a, b) => Number(hasKey(b)) - Number(hasKey(a)) || modelLabel(a).localeCompare(modelLabel(b)));
  const [picked, setPicked] = useState<Set<string>>(() => new Set([activeModel()?.id ?? ''].filter((id) => api.some((m) => m.id === id && hasKey(m)))));
  const list = promptsFor(target.kind, target.lang, prompts);
  const [promptId, setPromptId] = useState(planLookup(target).prompt?.id ?? '');
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  return (
    <div className="composer">
      <div className="small muted">The same question goes to every model you tick; each answer is saved as its own version, ready to compare.</div>
      <select className="input" value={promptId} onChange={(e) => setPromptId(e.target.value)} aria-label="Prompt">
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            Prompt: {p.name}
          </option>
        ))}
      </select>
      <div className="many-list">
        {api.map((m) => (
          <label key={m.id} className={`many-row${hasKey(m) ? '' : ' nokey'}`}>
            <input type="checkbox" disabled={!hasKey(m)} checked={picked.has(m.id)} onChange={() => toggle(m.id)} />
            <span className="grow">
              <span className="mp-row-name">{modelLabel(m)}</span>
              <span className="mp-row-meta">
                <span className="badge cyan">{providerName(m)}</span>
                <span className="mono faint">{m.model}</span>
                {!hasKey(m) && <span className="badge danger">no key</span>}
              </span>
            </span>
          </label>
        ))}
        {!api.length && <div className="small faint">No API models yet. Add some under Prompts → Models.</div>}
      </div>
      <div className="row end">
        <button className="btn primary" disabled={!picked.size} onClick={() => onSend([...picked], promptId || undefined)}>
          <Users size={15} /> Ask {picked.size || ''} {picked.size === 1 ? 'model' : 'models'}
        </button>
      </div>
    </div>
  );
}

function Composer({ sheet, onSend }: { sheet: SheetState; onSend: (o: { promptId?: string; modelId?: string; promptText?: string; body?: string }) => void }) {
  const { target } = sheet;
  const prompts = useStore((s) => s.prompts);
  const list = promptsFor(target.kind, target.lang, prompts);
  const initial = planLookup(target);
  const [promptId, setPromptId] = useState(initial.prompt?.id ?? '');
  const [modelId, setModelId] = useState(initial.model?.id ?? '');
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
        <ModelPicker value={modelId} onChange={setModelId} />
      </div>
      <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Prompt text" />
      {model?.provider !== 'web' && (
        <details className="raw">
          <summary>Request JSON {body != null && <span className="badge">edited</span>}</summary>
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
          <div className="small faint">
            Response events ({query.events.length}
            {query.events.length >= 400 ? ', capped' : ''})
          </div>
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
      <div className="wa-steps">
        <div className="wa-step">
          <span className="wa-n">1</span> The prompt is on your clipboard{plan.prompt ? ` (${plan.prompt.name})` : ''}.
        </div>
        <div className="wa-step">
          <span className="wa-n">2</span> Paste it into the chat, then copy the answer.
        </div>
        <div className="wa-step">
          <span className="wa-n">3</span> Paste the answer below and save it as a version.
        </div>
      </div>
      <div className="row">
        <ModelPicker value={modelId} onChange={setModelId} only="web" />
        <button className="btn" onClick={() => navigator.clipboard.writeText(plan.text).then(() => toast('Prompt copied.'))}>
          <Copy size={14} /> Copy prompt
        </button>
        {model?.siteUrl && (
          <a className="btn violet" href={model.siteUrl} target="_blank" rel="noopener noreferrer">
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
