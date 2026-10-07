import { ArrowLeft, Layers, Map as MapIcon, NotebookText, Type } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { go } from '../app/router';
import { isTouch, setSetting, useSettings } from '../app/settings';
import { useUI } from '../app/ui';
import { versionsFor } from '../data/selectors';
import { put, useStore } from '../data/store';
import { openTarget, passageTarget } from '../sheet/open';
import { ModelSwitch } from '../ui/ModelSwitch';
import { CalquePanel } from './CalquePanel';
import { selectionRange, snapToWords } from './dom';
import { menuItems } from './menu';
import { Minimap } from './Minimap';
import { NotesDrawer } from './NotesDrawer';
import { ReaderOptions } from './ReaderOptions';
import { scrollToOffset, topOffset } from './scroll';
import { TextBody, type DisplayMode } from './TextBody';
import { useReader } from './useReader';

const modeKey = (id: string) => `logosnovus.mode.${id}`;

/** True when the reader is too narrow for the toolbar's mode switch (then the floating bar shows). */
function useNarrow(ref: React.RefObject<HTMLDivElement | null>) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth <= 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return narrow;
}
const MODES: [DisplayMode, string, string][] = [
  ['orig', 'Original', 'O'],
  ['mirror', 'Mirror', 'M'],
  ['aligned', 'Aligned', 'M'],
  ['inter', 'Interlinear', 'I'],
];

export function ReaderView({ textId, embedded = false }: { textId: string; embedded?: boolean }) {
  const data = useReader(textId);
  const s = useSettings();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mode, setModeState] = useState<DisplayMode>(() => (localStorage.getItem(modeKey(textId)) as DisplayMode) || 'orig');
  const [sel, setSel] = useState(-1);
  const [panel, setPanel] = useState<null | 'notes' | 'calque' | 'options'>(null);
  const [selRange, setSelRange] = useState<[number, number] | null>(null);
  const sheetOpen = useUI((u) => !!u.sheet);
  const narrow = useNarrow(bodyRef);

  const setMode = useCallback(
    (m: DisplayMode) => {
      const anchor = bodyRef.current && data ? topOffset(bodyRef.current, data.doc) : null;
      setModeState(m);
      try {
        localStorage.setItem(modeKey(textId), m);
      } catch {
        /* ignore */
      }
      // keep the same line on top when the layout changes (interlinear is taller)
      requestAnimationFrame(() => {
        if (anchor != null && bodyRef.current && data) scrollToOffset(bodyRef.current, data.doc, anchor);
      });
    },
    [textId, data],
  );

  useEffect(() => {
    if (!embedded)
      try {
        localStorage.setItem('logosnovus.lastText', textId);
      } catch {
        /* ignore */
      }
  }, [textId, embedded]);

  // ---- keyboard: M flips mirror/aligned, O original, I interlinear
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      if (!data?.slots || useUI.getState().dialog) return;
      const k = e.key.toLowerCase();
      if (k === 'm') setMode(mode === 'mirror' ? 'aligned' : 'mirror');
      else if (k === 'o') setMode('orig');
      else if (k === 'i') setMode(mode === 'inter' ? 'orig' : 'inter');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [data?.slots, mode, setMode]);

  // ---- scroll memory: restore once per opened text, save while reading
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (!data || restored.current || !bodyRef.current) return;
    restored.current = true;
    const pos = data.reading?.pos;
    const root = bodyRef.current;
    if (pos) {
      scrollToOffset(root, data.doc, pos);
      document.fonts?.ready.then(() => scrollToOffset(root, data.doc, pos)); // fonts can change wrapping
    } else scrollTo({ top: 0 });
  }, [data]);

  useEffect(() => {
    if (!data || embedded) return;
    let last: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      timer = null;
      if (last == null) return;
      const cur = useStore.getState().readings[textId];
      if (cur?.pos === last) return;
      put('readings', { ...(cur && !cur.deleted ? cur : {}), id: textId, updatedAt: 0, pos: last });
    };
    const onScroll = () => {
      if (!bodyRef.current) return;
      const o = topOffset(bodyRef.current, data.doc);
      if (o != null) last = o;
      timer ??= setTimeout(save, 1200);
    };
    const onHide = () => document.visibilityState === 'hidden' && save();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
      if (timer) clearTimeout(timer);
      save(); // the last measured value, never a value read from a tearing-down DOM
    };
  }, [data?.doc, textId, embedded]);

  // ---- passage selection → bottom bar
  useEffect(() => {
    if (!data) return;
    const onSel = () => {
      const root = bodyRef.current;
      const r = root ? selectionRange(root, data.doc) : null;
      setSelRange(r ? snapToWords(data.doc, r) : null);
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [data?.doc]);

  // background text must not scroll under the phone sheet
  useEffect(() => {
    const lock = sheetOpen && innerWidth < 1100;
    document.documentElement.classList.toggle('locked', lock);
    return () => document.documentElement.classList.remove('locked');
  }, [sheetOpen]);

  if (!data) return <div className="empty">This text no longer exists.</div>;
  const { text, doc } = data;
  const hasCalque = !!data.slots;
  const selTarget = selRange ? passageTarget(text.id, doc, selRange) : null;
  const selSaved = selTarget ? versionsFor(selTarget).length > 0 : false;
  const effMode = hasCalque ? mode : 'orig';
  const showModeBar = hasCalque && (isTouch() || s.mirrorBar || narrow);

  return (
    <div className={`reader${panel === 'notes' ? ' with-notes' : ''}`}>
      <div className="reader-bar">
        {!embedded && (
          <button className="icon-btn hide-mobile" onClick={() => go('/')} title="Library">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="reader-title grow">
          <span className="t">{text.title}</span>
          {text.author && <span className="a"> · {text.author}</span>}
        </div>
        {hasCalque && (
          <div className="seg mode-seg hide-mobile" role="tablist" aria-label="Display mode">
            {MODES.map(([m, label, key]) => (
              <button key={m} className={effMode === m ? 'on' : ''} onClick={() => setMode(m)} title={`${label} (${key})`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="seg lookup-seg hide-mobile" title="What a word click opens">
          <button className={s.lookup === 'ai' ? 'on' : ''} onClick={() => setSetting('lookup', 'ai')}>
            AI
          </button>
          <button className={s.lookup === 'dict' ? 'on' : ''} onClick={() => setSetting('lookup', 'dict')}>
            Dictionary
          </button>
        </div>
        <ModelSwitch compact />
        <button className={`icon-btn${panel === 'calque' ? ' on' : ''}`} onClick={() => setPanel(panel === 'calque' ? null : 'calque')} title="Calque (word-for-word mirror)">
          <Layers size={18} />
        </button>
        <button className={`icon-btn${panel === 'notes' ? ' on' : ''}`} onClick={() => setPanel(panel === 'notes' ? null : 'notes')} title="Translations in this text">
          <NotebookText size={18} />
        </button>
        <button className={`icon-btn hide-mobile${s.minimap ? ' on' : ''}`} onClick={() => setSetting('minimap', !s.minimap)} title="Minimap">
          <MapIcon size={18} />
        </button>
        <button className="icon-btn" onClick={() => setPanel('options')} title="Display options">
          <Type size={18} />
        </button>
      </div>

      <div ref={bodyRef} className="reader-body">
        <TextBody data={data} mode={effMode} sel={sel} onSelectWord={setSel} />
      </div>

      {s.minimap && !embedded && <Minimap data={data} />}

      {showModeBar && (
        <div className={`mode-bar${selRange ? ' raised' : ''}`}>
          {MODES.map(([m, label]) => (
            <button key={m} className={effMode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {selTarget && selRange && (
        <div className="sel-bar" onPointerDown={(e) => e.preventDefault() /* keep the selection */}>
          <button
            className="btn primary"
            onClick={() => {
              openTarget(selTarget);
              getSelection()?.removeAllRanges();
            }}
          >
            {selSaved ? 'Open saved translation' : 'Translate passage'}
          </button>
          <button
            className="btn"
            onClick={(e) => {
              const items = menuItems(data, { range: selRange, word: doc.words.findIndex((w) => w.start >= selRange[0] && w.letters) });
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              useUI.setState({ menu: { x: r.left, y: r.top, items, title: selTarget.text.slice(0, 60) } });
            }}
          >
            More
          </button>
        </div>
      )}

      {panel === 'notes' && <NotesDrawer data={data} onClose={() => setPanel(null)} />}
      {panel === 'calque' && <CalquePanel text={text} onClose={() => setPanel(null)} />}
      {panel === 'options' && <ReaderOptions onClose={() => setPanel(null)} />}
    </div>
  );
}
