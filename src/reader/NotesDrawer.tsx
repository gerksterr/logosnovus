// All translations belonging to this text: its passages (in reading order,
// unanchored ones last) and the words of this text that have translations.

import { ChevronDown, ChevronRight, LocateFixed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { translationIndex, versionsFor } from '../data/selectors';
import { useStore } from '../data/store';
import { openTranslation } from '../sheet/open';
import { passageKey, wordKey } from '../text/document';
import { Drawer } from '../ui/Modal';
import { Markdown } from '../ui/Markdown';
import { scrollToOffset } from './scroll';
import type { ReaderData } from './useReader';

interface Item {
  key: string;
  kind: 'word' | 'passage';
  label: string;
  latestId: string;
  count: number;
  at?: number; // offset in text
  date: number;
  preview: string;
}

export function NotesDrawer({ data, onClose }: { data: ReaderData; onClose: () => void }) {
  const translations = useStore((s) => s.translations);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { doc, text } = data;

  const items = useMemo(() => {
    const out: Item[] = [];
    const seen = new Set<string>();
    for (const t of translationIndex(translations).byText.get(text.id) ?? []) {
      if (t.kind !== 'passage') continue;
      const k = passageKey(t.target);
      if (seen.has(k)) continue;
      seen.add(k);
      const versions = versionsFor({ kind: 'passage', textId: text.id, lang: t.lang, text: t.target }, translations);
      const mark = data.passages.find((p) => p.key === k);
      out.push({ key: `p${k}`, kind: 'passage', label: t.target, latestId: versions[0].id, count: versions.length, at: mark?.start, date: versions[0].createdAt, preview: versions[0].content });
    }
    const wordSeen = new Set<string>();
    for (const w of doc.words) {
      const k = wordKey(w.text);
      if (wordSeen.has(k) || !data.known.has(k)) continue;
      wordSeen.add(k);
      const versions = versionsFor({ kind: 'word', textId: text.id, lang: text.lang, text: w.text }, translations);
      if (!versions.length) continue;
      out.push({ key: `w${k}`, kind: 'word', label: w.text, latestId: versions[0].id, count: versions.length, at: w.start, date: versions[0].createdAt, preview: versions[0].content });
    }
    return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  }, [translations, data.passages, data.known, doc, text]);

  const filtered = q ? items.filter((i) => (i.label + ' ' + i.preview).toLowerCase().includes(q.toLowerCase())) : items;
  const groups: [string, Item[]][] = [
    ['Passages', filtered.filter((i) => i.kind === 'passage')],
    ['Words', filtered.filter((i) => i.kind === 'word')],
  ];
  const toggle = (k: string) => setOpen((s) => (s.has(k) ? (s.delete(k), new Set(s)) : new Set(s.add(k))));

  return (
    <Drawer
      title={`Translations · ${items.length}`}
      onClose={onClose}
      actions={
        <button className="btn small ghost" onClick={() => setOpen(open.size ? new Set() : new Set(filtered.map((i) => i.key)))}>
          {open.size ? 'Collapse all' : 'Expand all'}
        </button>
      }
    >
      <input className="input" placeholder="Search translations" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map(([name, list]) =>
        list.length ? (
          <section key={name} className="notes-group">
            <h3>
              {name} <span className="faint">{list.length}</span>
            </h3>
            {list.map((i) => (
              <div key={i.key} className={`note${open.has(i.key) ? ' open' : ''}`}>
                <div className="note-head">
                  <button className="note-toggle grow" onClick={() => toggle(i.key)}>
                    {open.has(i.key) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span className={`note-label${i.kind === 'passage' ? ' passage' : ''}`} dir="auto">
                      {i.label}
                    </span>
                    {i.count > 1 && <span className="badge">{i.count}</span>}
                    {i.at == null && i.kind === 'passage' && <span className="badge">not found in text</span>}
                  </button>
                  {i.at != null && (
                    <button
                      className="icon-btn"
                      title="Show in text"
                      onClick={() => {
                        const root = document.querySelector('.reader-body') as HTMLElement | null;
                        if (root) scrollToOffset(root, doc, i.at!, true);
                        if (innerWidth < 1100) onClose();
                      }}
                    >
                      <LocateFixed size={16} />
                    </button>
                  )}
                </div>
                {open.has(i.key) && (
                  <div className="note-body">
                    <Markdown text={i.preview} />
                    <button className="btn small" onClick={() => openTranslation(i.latestId)}>
                      Open{i.count > 1 ? ` (${i.count} versions)` : ''}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        ) : null,
      )}
      {!filtered.length && <div className="empty">{items.length ? 'Nothing matches.' : 'No translations yet. Tap a word or select a passage.'}</div>}
    </Drawer>
  );
}
