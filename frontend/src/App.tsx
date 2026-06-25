/**
 * App.tsx — root layout: collapsible sidebar (left) + 3D canvas area (right)
 * with the ActivePalletPanel overlay.
 *
 * Exports: App (default).
 * Side effects: toggles the `dark` class on <html> whenever darkMode changes,
 * which drives every Tailwind `dark:` style in the tree.
 */
import { useEffect } from 'react'
import { PanelLeftClose, PanelLeftOpen, Sun, Moon } from 'lucide-react'
import { useStore } from '@/src/store'
import { SceneCanvas } from '@/src/components/3d/Canvas'
import { Sidebar } from '@/src/components/ui/Sidebar'
import { ActivePalletPanel } from '@/src/components/ui/ActivePalletPanel'
import { AlgorithmVisualizer } from '@/src/components/ui/AlgorithmVisualizer'
import psaLogo from './assets/psa_logo.png'

export default function App() {
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const darkMode = useStore((s) => s.darkMode)
  const toggleDarkMode = useStore((s) => s.toggleDarkMode)

  // Tailwind `dark:` variants key off the .dark class on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`shrink-0 flex flex-col border-r border-border bg-sidebar transition-[width] duration-500 ${
          sidebarOpen ? 'w-72' : 'w-0 overflow-hidden border-0'
        }`}
      >
        {/* PSA logo + dark mode toggle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <img src={psaLogo} alt="PSA Logo" className="h-8 w-auto object-contain" />
          <button
            onClick={toggleDarkMode}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Sidebar />
        </div>
      </aside>

      {/* Main canvas area */}
      <div className="relative flex flex-1 flex-col">
        <button
          onClick={toggleSidebar}
          className="absolute top-3 left-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <SceneCanvas />
        <ActivePalletPanel />
      </div>

      <AlgorithmVisualizer />
    </div>
  )
}
