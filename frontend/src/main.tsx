/**
 * main.tsx — application entry point.
 *
 * Mounts <App /> into the #root element under React StrictMode.
 * Side effects: imports the global stylesheet (Tailwind v4 via index.css) and
 * opens the backend keep-alive stream (see below).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Keep-alive link to the local backend: the packaged exe watches these
// connections and shuts itself down once every app tab has closed. The
// browser closes the stream automatically when the tab goes away, and
// EventSource auto-reconnects if the backend restarts. Harmless in dev
// (the dev server never self-terminates).
new EventSource('/api/keepalive')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
