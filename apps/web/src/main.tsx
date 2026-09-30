import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);

// Registers the service worker, production only: it serves navigations cache-first,
// so dev would pin a stale index.html; in a module because import.meta.env is only substituted there.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // CACHE_NAME embeds the app version, so a new install means a new
            // deploy; reload to apply it instead of stranding the old build.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      },
      (err) => {
        // Never fatal: the app works fine without offline support.
        console.warn('Service worker registration failed:', err);
      },
    );
  });
}
