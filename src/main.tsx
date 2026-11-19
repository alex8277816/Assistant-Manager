import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { AppErrorBoundary, clearAppCachesAndReload } from './components/AppErrorBoundary.tsx';
import './index.css';

declare global {
  interface Window {
    __KAIRO_MOUNTED__?: boolean;
  }
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  clearAppCachesAndReload();
});

try {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    registerSW({
      immediate: true,
      onRegisterError(err) {
        console.warn('ServiceWorker registration skipped:', err);
      },
    });
  }
} catch {
  // Ignore SW registration errors in restricted browsers/webviews
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
  window.__KAIRO_MOUNTED__ = true;
  try {
    sessionStorage.removeItem('kairo_boot_recover_v1');
  } catch {
    // ignore
  }
}

