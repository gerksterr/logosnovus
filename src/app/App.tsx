import { BookOpen, FlaskConical, Library, ScrollText, Settings } from 'lucide-react';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { initStore, merge, useStore } from '../data/store';
import { decodeShare } from '../data/share';
import { countBundle } from '../data/merge';
import { LibraryView } from '../library/LibraryView';
import { PlaygroundView } from '../library/PlaygroundView';
import { PromptsView } from '../prompts/PromptsView';
import { ReaderView } from '../reader/ReaderView';
import { SettingsView } from '../settings/SettingsView';
import { Dock } from '../sheet/Dock';
import { Sheet } from '../sheet/Sheet';
import { startSync } from '../sync/cloud';
import { ContextMenu, Dialogs, Toasts } from '../ui/Modal';
import { go, useRoute, type Route } from './router';
import { useSettings } from './settings';
import { confirmDialog, toast } from './ui';

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
      return <ReaderView textId={route.id} />;
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
  ['play', '/play', 'Playground', FlaskConical],
  ['prompts', '/prompts', 'Prompts', ScrollText],
  ['settings', '/settings', 'Settings', Settings],
];

function lastRead(): string | null {
  try {
    return localStorage.getItem('logosnovus.lastText');
  } catch {
    return null;
  }
}

function navTarget(view: Route['view'], path: string) {
  if (view !== 'read') return path;
  const id = lastRead();
  return id ? `/read/${encodeURIComponent(id)}` : '/';
}

function TopBar({ route }: { route: Route }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go('/')}>
        Logos Novus
      </button>
      <nav>
        {NAV.map(([view, path, label]) => (
          <button key={view} className={route.view === view ? 'on' : ''} onClick={() => go(navTarget(view, path))}>
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="bottom-nav">
      {NAV.map(([view, path, label, Icon]) => (
        <button key={view} className={route.view === view ? 'on' : ''} onClick={() => go(navTarget(view, path))}>
          <Icon size={20} />
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
