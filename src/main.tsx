import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import './styles.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Responsive tables: copy each header into its cells' data-label (shown as card labels on phones).
const labelTables = () =>
  document.querySelectorAll('table.rt').forEach((t) => {
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '')
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => td.setAttribute('data-label', heads[i] ?? '')))
  })
let raf = 0
new MutationObserver(() => {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(labelTables)
}).observe(document.getElementById('root')!, { childList: true, subtree: true })

// Service worker only in production builds (dev uses Vite HMR, which a SW would fight).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
