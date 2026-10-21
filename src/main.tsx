import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/app.css';
import './styles/reader.css';
import './styles/panels.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: the service worker precaches the whole app (see vite.config.ts).
// Browsers look for a new version only when the page is (re)loaded, and a tab can
// stay open for days (changing the #route never reloads it), so also look when the
// tab comes back into view and every hour. A new version takes over and reloads.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      onRegisteredSW(_url, reg) {
        if (!reg) return;
        const check = () => void reg.update().catch(() => {});
        setInterval(check, 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      },
    }),
  );
}
