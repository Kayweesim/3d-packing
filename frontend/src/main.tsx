/**
 * main.tsx — application entry point.
 *
 * Mounts <App /> into the #root element under React StrictMode.
 * Side effects: imports the global stylesheet (Tailwind v4 via index.css).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
