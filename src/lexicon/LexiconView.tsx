// Your words, per language: one row per word you looked up, with its
// calque meaning, a one-line gloss, all saved versions, and every place it
// occurs in your texts (keyword in context, a tap opens the text there).

import { BookA, ChevronDown, ChevronRight, ExternalLink, Layers, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { go } from '../app/router';
import { docFor, langName, targetKey, versionsFor } from '../data/selectors';
import { alive, getRec, useStore } from '../data/store';
import { ago } from '../library/stats';
import type { Translation } from '../model/types';
import { openTarget, openTranslation } from '../sheet/open';
import { wordKey } from '../text/document';
import { Markdown } from '../ui/Markdown';
import { entries, kwic, type Entry } from './lexicon';

type Sort = 'recent' | 'alpha' | 'versions' | 'occ';
const SORTS: [Sort, string][] = [
  ['recent', 'Recently looked up'],
  ['alpha', 'A–Z'],
  ['occ', 'Most frequent in your texts'],
  ['versions', 'Most versions'],
];

export function LexiconView({ lang: langParam, word }: { lang?: string; word?: string }) {
  const translations = useStore((s) => s.translations);
  const texts = useStore((s) => s.texts);
  const calques = useStore((s) => s.calques);
  useStore((s) => s.langs);

  // languages with saved translations, most used first
  const langs = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const t of alive(translations)) {
      if (!m.has(t.lang)) m.set(t.lang, new Set());
      if (t.kind === 'word') m.get(t.lang)!.add(wordKey(t.target));
    }
    return [...m].map(([l, words]) => [l, words.size] as const).sort((a, b) => b[1] - a[1]);
  }, [translations]);
  const lang = langParam && langs.some(([l]) => l === langParam) ? langParam : (langs[0]?.[0] ?? '');
  const [tab, setTab] = useState<'words' | 'passages'>('words');
  const [q, setQ] = useState(word ?? '');
  const [sort, setSort] = useState<Sort>('recent');
  const [open, setOpen] = useState<string | null>(word ? wordKey(word) : null);
  useEffect(() => {
    if (word) {
      setQ(word);
      setOpen(wordKey(word));
      setTab('words');
    }
  }, [word]);

  const all = useMemo(() => (lang ? entries(lang, translations, texts, calques) : []), [lang, translations, texts, calques]);
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    const f = all.filter((e) => !needle || e.key.includes(needle) || e.gloss.toLowerCase().includes(needle) || e.calque?.toLowerCase().includes(needle));
    const cmp: Record<Sort, (a: Entry, b: Entry) => number> = {
      recent: (a, b) => b.last - a.last,
      alpha: (a, b) => a.key.localeCompare(b.key),
      versions: (a, b) => b.versions.length - a.versions.length || b.last - a.last,
      occ: (a, b) => b.occ.length - a.occ.length || b.last - a.last,
    };
    return f.sort(cmp[sort]);
  }, [all, needle, sort]);
  const [limit, setLimit] = useState(150);

  // one row per passage (its newest version)
  const passages = useMemo(() => {
    const seen = new Set<string>();
    return alive(translations)
      .filter((t) => t.kind === 'passage' && t.lang === lang && (!needle || t.target.toLowerCase().includes(needle) || t.content.toLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((t) => {
        const k = targetKey({ ...t, text: t.target });
        return !seen.has(k) && !!seen.add(k);
      });
  }, [translations, lang, needle]);

  const vocab = useMemo(() => {
    let n = 0;
    for (const e of all) if (e.occ.length) n++;
    return n;
  }, [all]);

  return (
    <div className="page lexicon">
      <section className="hero">
        <div className="hero-text">
          <span className="badge amber caps">
            <BookA size={12} /> Lexicon
          </span>
          <h1>{langName(lang) || 'Lexicon'}</h1>
          <p>
            {all.length} words looked up{vocab ? ` · ${vocab} of them occur in your texts` : ''} · {passages.length} passages. Word translations belong to the language, so every text
            shares them.
          </p>
        </div>
      </section>

      <section className="filters card">
        {langs.length > 1 && (
          <div className="chips scroll" role="group" aria-label="Language">
            {langs.map(([id, n]) => (
              <button key={id} className={`chip${id === lang ? ' on' : ''}`} onClick={() => go(`/lexicon/${encodeURIComponent(id)}`)}>
                {langName(id) || 'Unknown'} <span className="n">{n}</span>
              </button>
            ))}
          </div>
        )}
        <div className="filter-row">
          <div className="seg" role="tablist">
            <button className={tab === 'words' ? 'on' : ''} onClick={() => setTab('words')}>
              Words <span className="faint">{all.length}</span>
            </button>
            <button className={tab === 'passages' ? 'on' : ''} onClick={() => setTab('passages')}>
              Passages <span className="faint">{passages.length}</span>
            </button>
          </div>
          <label className="search grow">
            <Search size={16} />
            <input className="input" placeholder={tab === 'words' ? 'Find a word or a meaning' : 'Find in passages and answers'} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {tab === 'words' && (
            <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {tab === 'words' ? (
        <div className="lex-list">
          {list.slice(0, limit).map((e) => (
            <WordItem key={e.key} e={e} open={open === e.key} onToggle={() => setOpen(open === e.key ? null : e.key)} />
          ))}
          {list.length > limit && (
            <button className="btn" onClick={() => setLimit(limit + 300)}>
              Show more ({list.length - limit})
            </button>
          )}
          {!list.length && <div className="empty">{all.length ? 'Nothing matches.' : 'No words looked up in this language yet.'}</div>}
        </div>
      ) : (
        <div className="lex-list">
          {passages.slice(0, limit).map((p) => (
            <PassageItem key={p.id} p={p} />
          ))}
          {!passages.length && <div className="empty">No passages.</div>}
        </div>
      )}
    </div>
  );
}

function WordItem({ e, open, onToggle }: { e: Entry; open: boolean; onToggle: () => void }) {
  const textsSeen = new Set(e.occ.map((o) => o.textId)).size;
  return (
    <div className={`lex-item${open ? ' open' : ''}`}>
      <button className="lex-row" onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown size={16} className="faint" /> : <ChevronRight size={16} className="faint" />}
        <span className="lex-word" dir="auto">
          {e.word}
        </span>
        <span className="lex-gloss">
          {e.calque && (
            <span className="lex-calque">
              <Layers size={12} /> {e.calque}
            </span>
          )}
          {e.gloss}
        </span>
        <span className="lex-counts">
          {e.versions.length > 1 && <span className="badge">{e.versions.length} versions</span>}
          {e.occ.length > 0 && (
            <span className="badge amber" title={`${e.occ.length} occurrences in ${textsSeen} texts`}>
              {e.occ.length}× · {textsSeen} {textsSeen === 1 ? 'text' : 'texts'}
            </span>
          )}
        </span>
      </button>
      {open && <WordDetail e={e} />}
    </div>
  );
}

function WordDetail({ e }: { e: Entry }) {
  const [full, setFull] = useState(false);
  const v = e.versions[0];
  const occ = e.occ.slice(0, 40);
  const openSheet = () => {
    const o = e.occ[0];
    const text = getRec('texts', o?.textId ?? v.textId);
    if (o && text) openTarget({ kind: 'word', textId: o.textId, lang: text.lang, text: v.target, anchor: [o.start, o.end] });
    else openTranslation(v.id);
  };
  return (
    <div className="lex-body">
      <div className="row small faint">
        <span>
          Last looked up {ago(v.createdAt)} in {getRec('texts', v.textId)?.title ?? 'a deleted text'}
          {v.promptName ? ` · ${v.promptName}` : ''} · {v.servedBy || v.model}
        </span>
        <span className="grow" />
        <button className="btn small amber" onClick={openSheet}>
          <ExternalLink size={13} /> Open {e.versions.length > 1 ? `all ${e.versions.length} versions` : 'translation'}
        </button>
      </div>
      <div className={`lex-answer${full ? ' full' : ''}`}>
        <Markdown text={v.content} />
        {!full && (
          <button className="lex-more" onClick={() => setFull(true)}>
            Show all
          </button>
        )}
      </div>
      {occ.length > 0 && (
        <div className="kwic">
          <div className="section-label">In your texts</div>
          {occ.map((o) => (
            <Kwic key={`${o.textId}:${o.start}`} textId={o.textId} start={o.start} end={o.end} />
          ))}
          {e.occ.length > occ.length && <div className="small faint">…and {e.occ.length - occ.length} more</div>}
        </div>
      )}
    </div>
  );
}

function Kwic({ textId, start, end }: { textId: string; start: number; end: number }) {
  const text = getRec('texts', textId);
  if (!text) return null;
  const { left, key, right } = kwic(docFor(text).plain, { start, end });
  const rtl = getRec('langs', text.lang)?.rtl;
  return (
    <button className="kwic-row" dir={rtl ? 'rtl' : 'ltr'} onClick={() => go(`/read/${encodeURIComponent(textId)}/${start}`)}>
      <span className="l">
        <span>{left}</span>
      </span>
      <span className="k">{key}</span>
      <span className="r">{right}</span>
      <span className="kwic-src">{text.title}</span>
    </button>
  );
}

function PassageItem({ p }: { p: Translation }) {
  const text = getRec('texts', p.textId);
  const n = versionsFor({ kind: 'passage', textId: p.textId, lang: p.lang, text: p.target }).length;
  return (
    <div className="lex-item">
      <button className="lex-row passage" onClick={() => openTranslation(p.id)}>
        <span className="lex-passage" dir="auto">
          {p.target}
        </span>
        <span className="lex-counts">
          {n > 1 && <span className="badge">{n} versions</span>}
          <span className="badge violet">{text?.title ?? 'deleted text'}</span>
        </span>
      </button>
      {text && p.anchor && (
        <div className="lex-body compact">
          <div className="row small faint">
            <span>
              {ago(p.createdAt)}
              {p.promptName ? ` · ${p.promptName}` : ''}
            </span>
            <span className="grow" />
            <button className="linkish" onClick={() => go(`/read/${encodeURIComponent(text.id)}/${p.anchor![0]}`)}>
              Show in text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
