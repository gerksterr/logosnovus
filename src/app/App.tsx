import { BookA, BookOpen, Cloud, Coffee, Contrast, FlaskConical, Library, Moon, ScrollText, Settings, Sun } from 'lucide-react';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { getRec, initStore, merge, useStore } from '../data/store';
import { decodeShare } from '../data/share';
import { countBundle } from '../data/merge';
import { LexiconView } from '../lexicon/LexiconView';
import { LibraryView } from '../library/LibraryView';
import { PlaygroundView } from '../library/PlaygroundView';
import { PromptsView } from '../prompts/PromptsView';
import { ReaderView } from '../reader/ReaderView';
import { SettingsView } from '../settings/SettingsView';
import { Dock } from '../sheet/Dock';
import { Sheet } from '../sheet/Sheet';
import { startSync, useSync } from '../sync/cloud';
import { ContextMenu, Dialogs, Toasts } from '../ui/Modal';
import { ModelPicker } from '../ui/ModelPicker';
import { go, useRoute, type Route } from './router';
import { setSetting, useSettings, type Theme } from './settings';
import { confirmDialog, toast, useUI } from './ui';

export function App() {
  const ready = useStore((s) => s.ready);
  const theme = useSettings((s) => s.theme);
  const route = useRoute();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  }, [theme]);

  useEffect(() => {
    initStore()
      .then(() => {
        void importShareFromHash();
        startSync();
      })
      .catch((e) => setFailed(String(e?.message || e)));
  }, []);

  if (failed) return <div className="empty">Could not open local storage: {failed}</div>;
  if (!ready) return <div className="splash">Λ</div>;
  return (
    <div className={`app view-${route.view}`}>
      <TopBar route={route} />
      <main>
        <Guard key={route.view === 'read' ? route.id : route.view}>
          <View route={route} />
        </Guard>
      </main>
      <BottomNav route={route} />
      <Sheet />
      <Dock />
      <ContextMenu />
      <Dialogs />
      <Toasts />
    </div>
  );
}

function View({ route }: { route: Route }) {
  switch (route.view) {
    case 'read':
      return <ReaderView textId={route.id} at={route.at} />;
    case 'lexicon':
      return <LexiconView lang={route.lang} word={route.word} />;
    case 'play':
      return <PlaygroundView />;
    case 'prompts':
      return <PromptsView tab={route.tab} />;
    case 'settings':
      return <SettingsView />;
    default:
      return <LibraryView />;
  }
}

const NAV: [Route['view'], string, string, typeof Library][] = [
  ['library', '/', 'Library', Library],
  ['read', '', 'Reader', BookOpen],
  ['lexicon', '/lexicon', 'Lexicon', BookA],
  ['play', '/play', 'Playground', FlaskConical],
  ['prompts', '/prompts', 'Prompts', ScrollText],
  ['settings', '/settings', 'Settings', Settings],
];
// phones: five tabs; Settings sits in the top bar
const PHONE_NAV = NAV.filter(([v]) => v !== 'settings');

export function lastRead(): string | null {
  try {
    const id = localStorage.getItem('logosnovus.lastText');
    return id && getRec('texts', id) ? id : null;
  } catch {
    return null;
  }
}

function navTarget(view: Route['view'], path: string) {
  if (view !== 'read') return path;
  const id = lastRead();
  return id ? `/read/${encodeURIComponent(id)}` : '/';
}

const THEMES: Theme[] = ['night', 'sepia', 'paper', 'ink'];
const THEME_ICON: Record<Theme, typeof Moon> = { night: Moon, sepia: Coffee, paper: Sun, ink: Contrast };

function ThemeButton() {
  const theme = useSettings((s) => s.theme);
  const I = THEME_ICON[theme];
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  return (
    <button className="icon-btn" onClick={() => setSetting('theme', next)} title={`Theme: ${theme} (switch to ${next})`} aria-label="Switch theme">
      <I size={18} />
    </button>
  );
}

/** Cloud status at a glance; opens the sync settings. */
function SyncButton({ compact = false }: { compact?: boolean }) {
  const { user, status, pending } = useSync();
  const label = !user ? 'Sign in' : status === 'synced' ? 'Synced' : status === 'syncing' || status === 'connecting' ? 'Syncing' : status === 'offline' ? 'Offline' : status === 'error' ? 'Sync error' : 'Cloud';
  const cls = !user ? '' : status === 'synced' ? ' ok' : status === 'error' ? ' err' : status === 'offline' ? ' off' : ' busy';
  return (
    <button className={`sync-btn${cls}${compact ? ' compact' : ''}`} onClick={() => go('/settings')} title={user ? `${user.email} · ${label}${pending ? ` · ${pending} to upload` : ''}` : 'Sign in with Google to sync your devices'}>
      {user ? <span className="avatar">{(user.name || user.email || '?').slice(0, 1).toUpperCase()}</span> : <Cloud size={16} />}
      {!compact && <span>{label}</span>}
      {user && <i className="dot" />}
    </button>
  );
}

function TopBar({ route }: { route: Route }) {
  // number keys switch pages (outside text fields)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      if (useUI.getState().dialog || useUI.getState().menu) return;
      const n = +e.key;
      if (n >= 1 && n <= NAV.length) go(navTarget(NAV[n - 1][0], NAV[n - 1][1]));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const title = NAV.find(([v]) => v === route.view)?.[2] ?? '';
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go('/')} title="Library">
        <span className="brand-mark">Λ</span>
        <span className="brand-name">Logos Novus</span>
      </button>
      <span className="topbar-title">{title}</span>
      <nav className="nav-pill">
        {NAV.map(([view, path, label, Icon], i) => (
          <button key={view} className={route.view === view ? 'on' : ''} onClick={() => go(navTarget(view, path))} title={`${label} (${i + 1})`}>
            <Icon size={16} />
            <span>{label}</span>
            <span className="kbd">{i + 1}</span>
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        <ModelPicker compact className="hide-tablet" />
        <SyncButton />
        <ThemeButton />
        <button className="icon-btn phone-only" onClick={() => go('/settings')} aria-label="Settings">
          <Settings size={19} />
        </button>
      </div>
    </header>
  );
}

function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="bottom-nav">
      {PHONE_NAV.map(([view, path, label, Icon]) => (
        <button key={view} className={route.view === view ? 'on' : ''} onClick={() => go(navTarget(view, path))}>
          <span className="bn-icon">
            <Icon size={21} />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

/** A crash in one view shows a message instead of a black screen. */
class Guard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty">
        <p>Something went wrong in this view.</p>
        <pre className="small">{this.state.error.message}</pre>
        <button className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

/** #share=… links: preview, then merge into the local library. */
async function importShareFromHash() {
  const m = /^#share=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + '#/');
  try {
    const backup = await decodeShare(m[1]);
    const counts = countBundle(backup.records);
    const summary = Object.entries(counts)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ');
    if (!(await confirmDialog(`Add shared data to your library? (${summary}) Your own data is kept; newer versions win.`, 'Add'))) return;
    const n = merge(backup.records, 'import');
    toast(`Added ${n} records from the shared link.`);
  } catch (e) {
    toast(`Could not read the shared link: ${(e as Error).message}`, 'error');
  }
}
