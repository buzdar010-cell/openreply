import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { initTheme } from './lib/theme.ts'

initTheme()

// Without this call, "registerType: 'autoUpdate'" in vite.config.ts does nothing --
// vite-plugin-pwa only wires up its update-check/reload behavior when this virtual
// module is actually imported and called; otherwise the build falls back to a bare
// `navigator.serviceWorker.register(...)` with no update logic at all (confirmed by
// reading the generated registerSW.js directly). `immediate: true` checks for a new
// version as soon as the app loads, not just on the browser's own ~24h SW freshness
// check -- important while this app is being deployed multiple times a day.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
