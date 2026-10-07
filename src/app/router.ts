// Hash routes (work from any static host and offline):
//   #/            library        #/read/<id>    reader
//   #/play        playground     #/prompts      prompts, models, languages
//   #/settings    settings
// Overlays (sheet, dialogs) push a history entry so Back closes them first.

import { useEffect, useRef, useSyncExternalStore } from 'react';

export type Route =
  | { view: 'library' }
  | { view: 'read'; id: string }
  | { view: 'play' }
  | { view: 'prompts'; tab?: string }
  | { view: 'settings' };

export function parseHash(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, '').split('/');
  if (a === 'read' && b) return { view: 'read', id: decodeURIComponent(b) };
  if (a === 'play') return { view: 'play' };
  if (a === 'prompts') return { view: 'prompts', tab: b };
  if (a === 'settings') return { view: 'settings' };
  return { view: 'library' };
}

const subscribe = (fn: () => void) => {
  addEventListener('hashchange', fn);
  return () => removeEventListener('hashchange', fn);
};
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseHash(hash);
}

export function go(path: string) {
  const n = stack.length;
  const nav = () => {
    if (location.hash !== `#${path}`) location.hash = path;
  };
  closeAllOverlays();
  if (n && (history.state as { overlayDepth?: number } | null)?.overlayDepth === n) {
    // unwind the overlays' history entries first, then navigate
    ignorePops++;
    addEventListener('popstate', () => setTimeout(nav, 0), { once: true });
    history.go(-n);
  } else nav();
}

// ---- overlay stack bound to browser history
interface Entry {
  id: number;
  close: () => void;
}
const stack: Entry[] = [];
let nextId = 1;
let ignorePops = 0;

addEventListener('popstate', (e) => {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  const depth = (e.state as { overlayDepth?: number } | null)?.overlayDepth ?? 0;
  while (stack.length > depth) stack.pop()!.close();
});

function push(close: () => void): number {
  const id = nextId++;
  stack.push({ id, close });
  history.pushState({ overlayDepth: stack.length }, '');
  return id;
}

function release(id: number) {
  const i = stack.findIndex((e) => e.id === id);
  if (i < 0) return;
  const isTop = i === stack.length - 1;
  stack.splice(i, 1);
  // Closed from the UI: drop our history entry so Back doesn't need an extra press.
  if (isTop && (history.state as { overlayDepth?: number } | null)?.overlayDepth === i + 1) {
    ignorePops++;
    history.back();
  }
}

function closeAllOverlays() {
  while (stack.length) stack.pop()!.close();
}

/** Registers an open overlay so the Back button (Android, browser) closes it. */
export function useBackClose(open: boolean, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    let popped = false;
    const id = push(() => {
      popped = true;
      ref.current();
    });
    return () => {
      if (!popped) release(id);
    };
  }, [open]);
}
