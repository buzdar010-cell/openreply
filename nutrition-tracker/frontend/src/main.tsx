import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { initTheme } from './lib/theme.ts'
import { reportClientError } from './lib/api.ts'

initTheme()

// Catches crashes that never reach the backend's own error handling at all --
// e.g. a stale cached build rendering broken UI, a null-ref in a component,
// a rejected promise nobody awaited. Reported the moment it happens, same as
// backend errors, rather than only ever surfacing as a tester's WhatsApp
// screenshot.
window.addEventListener('error', (event) => {
  reportClientError(event.message, event.error?.stack);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  reportClientError(message, reason instanceof Error ? reason.stack : undefined);
});

// Without this call, "registerType: 'autoUpdate'" in vite.config.ts does nothing --
// vite-plugin-pwa only wires up its update-check/reload behavior when this virtual
// module is actually imported and called; otherwise the build falls back to a bare
// `navigator.serviceWorker.register(...)` with no update logic at all (confirmed by
// reading the generated registerSW.js directly).
//
// Explicit onNeedRefresh (rather than trusting registerType: 'autoUpdate' to reload
// on its own) plus checking for updates aggressively -- on load, on every tab
// foreground, and on a short interval while open -- so that from this deploy onward,
// a plain refresh (or just leaving the tab open a minute) is enough to pick up a new
// version. No manual cache-clearing should ever be needed again after this one.
// (A precacheAndRoute-controlled page can't un-stick *itself* if it's still running
// JS from before this code existed -- that's a one-time manual clear, unavoidable --
// but every deploy from this one forward is covered.)
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update();
    });
    setInterval(() => registration.update(), 60_000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
