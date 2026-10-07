import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
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
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
