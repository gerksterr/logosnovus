import { BookOpen, Download, FlaskConical, GripVertical, LayoutGrid, Layers, Link2, List, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { go } from '../app/router';
import { setSetting, useSettings, type LibrarySort } from '../app/settings';
import { confirmDialog, toast } from '../app/ui';
import { defaultPrompt, langName } from '../data/selectors';
import { alive, getRec, patch, remove, useStore } from '../data/store';
import { shareUrl, encodeShare } from '../data/share';
import { modelLabel } from '../llm/run';
import type { Text } from '../model/types';
import { exportBackup, ImportButton } from '../settings/Backup';
import { COLORS, parseMarkup } from '../text/markup';
import { moveRanks, sortTexts } from './order';
import { ago, measure, progress, textStats } from './stats';
import { TextEditor } from './TextEditor';

const SORTS: [LibrarySort, string][] = [
  ['added', 'Newest first'],
  ['added-asc', 'Oldest first'],
  ['title', 'Title'],
  ['read', 'Recently read'],
  ['recent', 'Recently translated'],
  ['custom', 'Custom order'],
];

export function deleteText(t: Text) {
  const s = useStore.getState();
  for (const tr of alive(s.translations)) if (tr.textId === t.id && tr.kind === 'passage') remove('translations', tr.id);
  for (const c of alive(s.calques)) if (c.textId === t.id) remove('calques', c.id);
  remove('readings', t.id);
  remove('texts', t.id);
}

export async function shareText(t: Text) {
  const s = useStore.getState();
  const payload = await encodeShare({
    texts: [t],
    translations: alive(s.translations).filter((x) => x.textId === t.id || (x.kind === 'word' && x.lang === t.lang)),
    calques: alive(s.calques).filter((c) => c.id === t.calqueId),
    langs: alive(s.langs).filter((l) => l.id === t.lang),
  });
  const url = shareUrl(payload);
  await navigator.clipboard.writeText(url);
  toast(`Share link copied (${Math.round(url.length / 1024)} KB).`);
}

const open = (t: Text) => go(`/read/${encodeURIComponent(t.id)}`);

export function LibraryView() {
  const texts = useStore((s) => s.texts);
  const translations = useStore((s) => s.translations);
  const calques = useStore((s) => s.calques);
  const readings = useStore((s) => s.readings);
  useStore((s) => s.langs);
  useStore((s) => s.prompts);
  const sort = useSettings((s) => s.sort);
  const view = useSettings((s) => s.libraryView);
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('');
  const [tag, setTag] = useState('');
  const [editing, setEditing] = useState<Text | 'new' | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const stats = textStats(translations);
  const all = useMemo(() => alive(texts).filter((t) => !t.scratch), [texts]);
  const hasCalque = (t: Text) => !!t.calqueId && !!calques[t.calqueId] && !calques[t.calqueId].deleted;
  const readAt = (t: Text) => {
    const r = readings[t.id];
    return r && !r.deleted && r.pos ? r.updatedAt : 0;
  };
  const activity = (t: Text) => Math.max(stats.get(t.id)?.last ?? 0, calques[t.calqueId ?? '']?.createdAt ?? 0, t.updatedAt);
  const ordered = useMemo(
    () => (sort === 'read' ? sortTexts(all, 'recent', (t) => readAt(t) || t.createdAt / 1e3) : sortTexts(all, sort, activity)),
    [all, sort, stats, readings],
  );

  const langCounts = useMemo(() => count(all.map((t) => t.lang)), [all]);
  const tagCounts = useMemo(() => count(all.flatMap((t) => t.tags ?? [])), [all]);
  const needle = q.trim().toLowerCase();
  const filtered = ordered.filter(
    (t) =>
      (!lang || t.lang === lang) &&
      (!tag || t.tags?.includes(tag)) &&
      (!needle || `${t.title}\n${t.author ?? ''}\n${langName(t.lang)}\n${(t.tags ?? []).join(' ')}\n${t.content}`.toLowerCase().includes(needle)),
  );
  const shown = drag
    ? (() => {
        const l = [...filtered];
        const [it] = l.splice(drag.from, 1);
        l.splice(drag.to, 0, it);
        return l;
      })()
    : filtered;
  const canDrag = sort === 'custom' && !needle && !lang && !tag;

  const continuing = useMemo(
    () =>
      all
        .filter((t) => readAt(t) && progress(t, readings[t.id]) < 0.985)
        .sort((a, b) => readAt(b) - readAt(a))
        .slice(0, 3),
    [all, readings],
  );

  const startDrag = (e: React.PointerEvent, from: number) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from, to: from });
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag || !listRef.current) return;
    const cards = [...listRef.current.querySelectorAll<HTMLElement>('.text-card')];
    let to = 0;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const after = view === 'grid' ? e.clientY > r.bottom || (e.clientY > r.top && e.clientX > r.left + r.width / 2) : e.clientY > r.top + r.height / 2;
      if (shown[i] !== filtered[drag.from] && after) to++;
    });
    to = Math.min(to, filtered.length - 1);
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const endDrag = () => {
    if (!drag) return;
    for (const c of moveRanks(filtered, drag.from, drag.to)) patch('texts', c.id, { rank: c.rank });
    setDrag(null);
  };

  const del = async (t: Text) => {
    if (await confirmDialog(`Delete “${t.title}” with its passages and calques? Word translations stay (they belong to the language).`)) deleteText(t);
  };

  const totalTranslations = alive(translations).length;
  const calqueCount = all.filter(hasCalque).length;

  return (
    <div className="page wide library">
      <section className="hero">
        <div className="hero-text">
          <span className="badge amber caps">
            <BookOpen size={12} /> Reading room
          </span>
          <h1>Library</h1>
          <p>
            {all.length} texts · {langCounts.size} languages · {totalTranslations} translations{calqueCount ? ` · ${calqueCount} calques` : ''}
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={() => go('/play')}>
            <FlaskConical size={16} /> Playground
          </button>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> New text
          </button>
        </div>
      </section>

      {continuing.length > 0 && !needle && (
        <section>
          <h2 className="section-label">Continue reading</h2>
          <div className="continue-row">
            {continuing.map((t) => {
              const p = progress(t, readings[t.id]);
              return (
                <button key={t.id} className="cont-card" onClick={() => open(t)}>
                  <span className="meta">
                    <span className="badge lang caps">{langName(t.lang) || '—'}</span>
                    <span className="grow" />
                    {ago(readAt(t))}
                  </span>
                  <span className="t">{t.title}</span>
                  <span className="tc-progress">
                    <span className="progress">
                      <i style={{ width: `${Math.max(3, p * 100)}%` }} />
                    </span>
                    {Math.round(p * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="filters card">
        <label className="search">
          <Search size={16} />
          <input className="input" placeholder="Search titles, authors, tags and words in the texts" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="filter-row">
          <select className="input" value={sort} onChange={(e) => setSetting('sort', e.target.value as LibrarySort)} aria-label="Sort">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                Sort: {l}
              </option>
            ))}
          </select>
          <div className="chips scroll grow" role="group" aria-label="Language">
            <button className={`chip${!lang ? ' on' : ''}`} onClick={() => setLang('')}>
              All <span className="n">{all.length}</span>
            </button>
            {[...langCounts].map(([id, n]) => (
              <button key={id} className={`chip${lang === id ? ' on' : ''}`} onClick={() => setLang(lang === id ? '' : id)}>
                {langName(id) || 'Unknown'} <span className="n">{n}</span>
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Layout">
            <button className={view === 'grid' ? 'on' : ''} onClick={() => setSetting('libraryView', 'grid')} title="Cards" aria-label="Cards">
              <LayoutGrid size={16} />
            </button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setSetting('libraryView', 'list')} title="List" aria-label="List">
              <List size={16} />
            </button>
          </div>
        </div>
        {tagCounts.size > 0 && (
          <div className="chips scroll" role="group" aria-label="Tags">
            <span className="chips-label">Tags</span>
            {[...tagCounts].map(([t, n]) => (
              <button key={t} className={`chip${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>
                #{t} <span className="n">{n}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="lib-meta">
        <span>
          {filtered.length === all.length ? 'Texts' : 'Showing'}: <b>{filtered.length}</b>
          {filtered.length !== all.length ? ` of ${all.length}` : ''}
        </span>
        <span className="grow" />
        <button className="linkish" onClick={() => exportBackup(false)}>
          <Download size={14} /> Export backup
        </button>
        <ImportButton className="linkish" label="Import" />
      </div>
      {sort === 'custom' && canDrag && <p className="small faint">Drag the handle to reorder. Moved texts stay above the others; new texts appear right below them.</p>}

      <div
        className={`cards ${view === 'grid' ? 'grid' : 'list-view'}`}
        ref={listRef}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
      >
        {shown.map((t, i) => {
          const st = stats.get(t.id);
          const p = progress(t, readings[t.id]);
          const wp = getRec('prompts', t.wordPromptId) ?? defaultPrompt('word', t, t.lang);
          const pp = getRec('prompts', t.passagePromptId) ?? defaultPrompt('passage', t, t.lang);
          const wm = getRec('models', t.wordModelId);
          const pm = getRec('models', t.passageModelId);
          return (
            <article key={t.id} className={`text-card${drag && filtered[drag.from] === t ? ' dragging' : ''}`}>
              <div className="tc-top">
                {canDrag && (
                  <button className="drag-handle" onPointerDown={(e) => startDrag(e, i)} aria-label="Drag to reorder" title="Drag to reorder">
                    <GripVertical size={18} />
                  </button>
                )}
                <div className="badges">
                  <span className="badge lang caps">{langName(t.lang) || 'Unknown'}</span>
                  {st && <span className="badge">{st.translations} {st.translations === 1 ? 'translation' : 'translations'}</span>}
                  {hasCalque(t) && (
                    <span className="badge cyan caps" title="Has a word-for-word calque">
                      <Layers size={11} /> Calque
                    </span>
                  )}
                </div>
                <button className="icon-btn" onClick={() => setEditing(t)} title="Edit" aria-label="Edit">
                  <Pencil size={16} />
                </button>
                <button className="icon-btn" onClick={() => void shareText(t).catch((er) => toast(String(er), 'error'))} title="Copy share link" aria-label="Copy share link">
                  <Link2 size={16} />
                </button>
                <button className="icon-btn del" onClick={() => void del(t)} title="Delete" aria-label="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
              <button className="card-main" onClick={() => !drag && open(t)}>
                <h3 className="card-title">{t.title}</h3>
                {t.author && <div className="card-author">{t.author}</div>}
                <Excerpt content={t.content} rtl={getRec('langs', t.lang)?.rtl} />
              </button>
              {!!t.tags?.length && (
                <div className="tc-tags">
                  {t.tags.map((x) => (
                    <span key={x}>#{x}</span>
                  ))}
                </div>
              )}
              {p > 0 && (
                <div className="tc-progress" title="Reading position">
                  <span className="progress">
                    <i style={{ width: `${Math.max(2, p * 100)}%` }} />
                  </span>
                  {Math.round(p * 100)}%
                </div>
              )}
              <div className="tc-foot">
                <div className="tc-prompts">
                  <span className="pchip word" title="Word prompt">
                    <Sparkles size={13} /> {wp?.name ?? 'Default word prompt'}
                  </span>
                  <span className="pchip passage" title="Passage prompt">
                    <Sparkles size={13} /> {pp?.name ?? 'Default passage prompt'}
                  </span>
                  {(wm || pm) && (
                    <span className={`pchip model${(pm ?? wm)?.provider === 'web' ? ' web' : ''}`} title="Models chosen for this text">
                      <Sparkles size={13} /> {[wm && `words: ${modelLabel(wm)}`, pm && `passages: ${modelLabel(pm)}`].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
                <div className="tc-side">
                  <span className="tc-stat">
                    {measure(t.content).words.toLocaleString()} words{st?.words ? ` · ${st.words} looked up` : ''}
                  </span>
                  <button className="btn small amber" onClick={() => open(t)}>
                    <BookOpen size={14} /> {p > 0.01 && p < 0.985 ? 'Continue' : 'Read'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!all.length && (
        <div className="empty">
          <p>Your library is empty.</p>
          <p className="small">Add a text, try the Playground, or import a backup (old “Symbolic Text Decipher” backups work too).</p>
        </div>
      )}
      {!!all.length && !filtered.length && <div className="empty">Nothing matches.</div>}
      {editing && <TextEditor text={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function count(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return new Map([...m].sort((a, b) => b[1] - a[1]));
}

/** First lines with their [Red]/[hang] markup. */
function Excerpt({ content, rtl }: { content: string; rtl?: boolean }) {
  const { plain, runs } = parseMarkup(content.slice(0, 700));
  const text = plain.slice(0, 320); // whitespace is collapsed by CSS, so run offsets stay valid
  const cuts = new Set([0, text.length]);
  for (const r of runs) [r.start, r.end].forEach((x) => x > 0 && x < text.length && cuts.add(x));
  const sorted = [...cuts].sort((a, b) => a - b);
  return (
    <p className="excerpt" dir={rtl ? 'rtl' : 'auto'}>
      {sorted.slice(0, -1).map((a, i) => {
        const b = sorted[i + 1];
        const run = runs.filter((r) => r.start <= a && r.end >= b);
        const color = run.find((r) => r.color)?.color;
        const hang = run.some((r) => r.hang);
        return (
          <span key={a} style={{ color: color ? COLORS[color] : undefined }} className={hang ? 'mini-cap' : undefined}>
            {text.slice(a, b)}
          </span>
        );
      })}
      {plain.length > 320 ? '…' : ''}
    </p>
  );
}
