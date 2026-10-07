import { setSetting, useSettings, type Theme } from '../app/settings';
import { put, useStore } from '../data/store';
import { Modal } from '../ui/Modal';

const THEMES: [Theme, string][] = [
  ['night', 'Night'],
  ['ink', 'Black'],
  ['sepia', 'Sepia'],
  ['paper', 'Paper'],
];

export function ReaderOptions({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const prefs = useStore((st) => st.prefs.prefs);
  const setPref = (compound: boolean) => put('prefs', { ...(prefs && !prefs.deleted ? prefs : {}), id: 'prefs', updatedAt: 0, compound });
  return (
    <Modal title="Display" onClose={onClose} dismissable>
      <div className="field">
        <span>Theme</span>
        <div className="seg">
          {THEMES.map(([t, label]) => (
            <button key={t} className={s.theme === t ? 'on' : ''} onClick={() => setSetting('theme', t)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Font</span>
        <div className="seg">
          {(['serif', 'sans', 'mono'] as const).map((f) => (
            <button key={f} className={s.font === f ? 'on' : ''} onClick={() => setSetting('font', f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Size · {s.fontSize}px</span>
        <input type="range" min={13} max={30} value={s.fontSize} onChange={(e) => setSetting('fontSize', +e.target.value)} />
      </label>
      <label className="field">
        <span>Line spacing · {s.lineHeight.toFixed(2)}</span>
        <input type="range" min={1.3} max={2.4} step={0.05} value={s.lineHeight} onChange={(e) => setSetting('lineHeight', +e.target.value)} />
      </label>
      <label className="field">
        <span>Column width · {s.width}em</span>
        <input type="range" min={24} max={60} value={s.width} onChange={(e) => setSetting('width', +e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={s.justify} onChange={(e) => setSetting('justify', e.target.checked)} /> Justify text
      </label>
      <label className="check">
        <input type="checkbox" checked={s.dimNotes} onChange={(e) => setSetting('dimNotes', e.target.checked)} /> Dim [bracketed] notes
      </label>
      <label className="check">
        <input type="checkbox" checked={s.minimap} onChange={(e) => setSetting('minimap', e.target.checked)} /> Minimap
      </label>
      <hr className="sep" />
      <div className="field">
        <span>Word click opens</span>
        <div className="seg">
          <button className={s.lookup === 'ai' ? 'on' : ''} onClick={() => setSetting('lookup', 'ai')}>
            AI translation
          </button>
          <button className={s.lookup === 'dict' ? 'on' : ''} onClick={() => setSetting('lookup', 'dict')}>
            Quick dictionary
          </button>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={!!prefs?.compound} onChange={(e) => setPref(e.target.checked)} /> Mirror shows compound meanings of separated words
      </label>
      <label className="check">
        <input type="checkbox" checked={s.mirrorBar} onChange={(e) => setSetting('mirrorBar', e.target.checked)} /> Floating mirror switch on desktop
      </label>
    </Modal>
  );
}
