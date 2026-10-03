import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

const demoParam = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('demo')
  : null;

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  if (demoParam === 'mobile-chat') {
    const { MobileChatPreview } = await import('./dev/MobileChatPreview');
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <MobileChatPreview />
        </ErrorBoundary>
      </StrictMode>,
    );
    return;
  }
  if (demoParam === 'mobile-app') {
    const { MobileAppPreview } = await import('./dev/MobileAppPreview');
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <MobileAppPreview />
        </ErrorBoundary>
      </StrictMode>,
    );
    return;
  }

  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void boot();

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
