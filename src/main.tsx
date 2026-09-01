import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App.tsx';
import './index.css';

// Register Service Worker for offline PWA capability
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => console.log('[PWA] ServiceWorker registered with scope:', reg.scope),
      (err) => console.warn('[PWA] ServiceWorker registration failed:', err)
    );
  });
} else if ('serviceWorker' in navigator) {
  // Also register in dev mode to allow testing offline mode
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[PWA] Dev SW:', err));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
