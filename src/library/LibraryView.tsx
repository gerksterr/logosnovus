import { GripVertical, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { go } from '../app/router';
import { setSetting, useSettings, type LibrarySort } from '../app/settings';
import { confirmDialog, toast, useUI } from '../app/ui';
import { langName, translationIndex } from '../data/selectors';
import { alive, patch, remove, useStore } from '../data/store';
import { shareUrl, encodeShare } from '../data/share';
import type { Text } from '../model/types';
import { COLORS, parseMarkup } from '../text/markup';
import { moveRanks, sortTexts } from './order';
import { TextEditor } from './TextEditor';

const SORTS: [LibrarySort, string][] = [
  ['added', 'Newest first'],
  ['added-asc', 'Oldest first'],
  ['title', 'Title'],
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

export function LibraryView() {
  const texts = useStore((s) => s.texts);
  const translations = useStore((s) => s.translations);
  const calques = useStore((s) => s.calques);
  const sort = useSettings((s) => s.sort);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Text | 'new' | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const idx = translationIndex(translations);
    const out = new Map<string, { words: number; passages: number; last: number }>();
    for (const [id, list] of idx.byText) {
      out.set(id, {
        words: new Set(list.filter((t) => t.kind === 'word').map((t) => t.target.toLowerCase())).size,
        passages: list.filter((t) => t.kind === 'passage').length,
        last: Math.max(...list.map((t) => t.createdAt)),
      });
    }
    return out;
  }, [translations]);

  const activity = (t: Text) => Math.max(stats.get(t.id)?.last ?? 0, calques[t.calqueId ?? '']?.createdAt ?? 0, t.updatedAt);
  const ordered = useMemo(() => sortTexts(alive(texts).filter((t) => !t.scratch), sort, activity), [texts, sort, stats]);
  const filtered = q
    ? ordered.filter((t) => `${t.title} ${t.author ?? ''} ${langName(t.lang)}`.toLowerCase().includes(q.toLowerCase()))
    : ordered;
  const shown = drag ? (() => {
    const l = [...filtered];
    const [it] = l.splice(drag.from, 1);
    l.splice(drag.to, 0, it);
    return l;
  })() : filtered;

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
      if (shown[i] !== filtered[drag.from] && e.clientY > r.top + r.height / 2) to++;
    });
    to = Math.min(to, filtered.length - 1);
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const endDrag = () => {
    if (!drag) return;
    for (const c of moveRanks(filtered, drag.from, drag.to)) patch('texts', c.id, { rank: c.rank });
    setDrag(null);
  };

  const menu = (t: Text, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    useUI.setState({
      menu: {
        x: r.left - 160,
        y: r.bottom,
        title: t.title,
        items: [
          { label: 'Edit', icon: 'edit', run: () => setEditing(t) },
          { label: 'Copy share link', icon: 'link', run: () => void shareText(t).catch((er) => toast(String(er), 'error')) },
          {
            label: 'Delete',
            icon: 'trash',
            danger: true,
            run: async () => {
              if (await confirmDialog(`Delete “${t.title}” with its passages and calques? Word translations stay (they belong to the language).`)) deleteText(t);
            },
          },
        ],
      },
    });
  };

  return (
    <div className="page library">
      <div className="page-head">
        <h1>Library</h1>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> New text
        </button>
      </div>
      <div className="row toolbar">
        <label className="search grow">
          <Search size={16} />
          <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSetting('sort', e.target.value as LibrarySort)}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {sort === 'custom' && <p className="small faint">Drag the handle to reorder. Moved texts stay above the others; new texts appear right below them.</p>}
      <div className="cards" ref={listRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
        {shown.map((t, i) => {
          const st = stats.get(t.id);
          return (
            <article key={t.id} className={`text-card${drag && filtered[drag.from] === t ? ' dragging' : ''}`}>
              {sort === 'custom' && !q && (
                <button className="drag-handle" onPointerDown={(e) => startDrag(e, i)} aria-label="Drag to reorder">
                  <GripVertical size={18} />
                </button>
              )}
              <button
                className="card-main"
                onClick={() => {
                  if (!drag) go(`/read/${encodeURIComponent(t.id)}`);
                }}
              >
                <div className="card-title">{t.title}</div>
                <div className="small muted">
                  {[t.author, langName(t.lang)].filter(Boolean).join(' · ')}
                </div>
                <Excerpt content={t.content} rtl={useStore.getState().langs[t.lang]?.rtl} />
                <div className="small faint card-stats">
                  {st ? `${st.words} words · ${st.passages} passages` : 'no translations yet'}
                  {t.calqueId && calques[t.calqueId] && !calques[t.calqueId].deleted ? ' · calque' : ''}
                  {st?.last ? ` · last ${new Date(st.last).toLocaleDateString()}` : ''}
                </div>
              </button>
              <button className="icon-btn" onClick={(e) => menu(t, e)} aria-label="Text actions">
                <MoreHorizontal size={18} />
              </button>
            </article>
          );
        })}
      </div>
      {!ordered.length && (
        <div className="empty">
          <p>Your library is empty.</p>
          <p className="small">Add a text, try the Playground, or import a backup in Settings (old “Symbolic Text Decipher” backups work too).</p>
        </div>
      )}
      {editing && <TextEditor text={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** First lines with their [Red]/[hang] markup. */
function Excerpt({ content, rtl }: { content: string; rtl?: boolean }) {
  const { plain, runs } = parseMarkup(content.slice(0, 600));
  const text = plain.slice(0, 260); // whitespace is collapsed by CSS, so run offsets stay valid
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
      {plain.length > 260 ? '…' : ''}
    </p>
  );
}
