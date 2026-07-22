/**
 * App.tsx — root layout: collapsible sidebar (left) + 3D canvas area (right)
 * with the ActivePalletPanel overlay.
 *
 * Exports: App (default).
 * Side effects: toggles the `dark` class on <html> whenever darkMode changes,
 * which drives every Tailwind `dark:` style in the tree.
 */
import { useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useStore } from '@/src/store'
import { SceneCanvas } from '@/src/components/3d/Canvas'
import { Sidebar } from '@/src/components/ui/sidebar/Sidebar'
import { RightSidebar } from '@/src/components/ui/sidebar/RightSidebar'
import { ActivePalletPanel } from '@/src/components/ui/overlays/ActivePalletPanel'
import { AlgorithmVisualizer } from '@/src/components/ui/overlays/AlgorithmVisualizer'
import { PackingProgressModal } from '@/src/components/ui/overlays/PackingProgressModal'
import { PackingModeToggle } from '@/src/components/ui/overlays/PackingModeToggle'
import psaLogo from './assets/psa_logo.png'

export default function App() {
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const rightSidebarOpen = useStore((s) => s.rightSidebarOpen)
  const setRightSidebarOpen = useStore((s) => s.setRightSidebarOpen)
  const darkMode = useStore((s) => s.darkMode)
  const toggleDarkMode = useStore((s) => s.toggleDarkMode)

  // Tailwind `dark:` variants key off the .dark class on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Mobile backdrop — tap outside to close sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Mobile backdrop — tap outside to close the right sidebar */}
      {rightSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setRightSidebarOpen(false)}
        />
      )}

      {/* Sidebar
          Mobile  (<md): fixed overlay that slides in/out via transform; canvas always fills 100vw.
          Desktop (md+): part of the flex row with width transition as before. */}
      <aside
        className={`flex flex-col border-r border-border bg-sidebar
          fixed inset-y-0 left-0 z-30 w-72 transition-transform duration-300
          md:relative md:z-auto md:shrink-0 md:transition-[width] md:duration-300
          ${sidebarOpen
            ? 'translate-x-0 md:w-72'
            : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-0'
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

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* App title overlay — centered over the canvas, sidebar is a sibling so this never overlaps it */}
        <div className="pointer-events-none absolute top-0 inset-x-0 z-10 flex flex-col items-center gap-0.5 pt-3 px-16 text-center">
          <h1 className="text-lg font-bold tracking-tight text-foreground">CargoPilot</h1>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Intelligent Container Stuffing Optimisation
          </p>
          <p className="max-w-md text-[11px] leading-snug text-muted-foreground/80">
            Automatically generates the optimal container stuffing plan by considering cargo dimensions,
            stacking constraints, cargo compatibility, and pallet loading sequence.
          </p>
        </div>

        <SceneCanvas />
        <ActivePalletPanel />
        <PackingModeToggle />
      </div>

      {/* Right sidebar — opened by the PackingModeToggle.
          Mobile  (<md): fixed overlay that slides in/out from the right.
          Desktop (md+): part of the flex row with a width transition. */}
      <aside
        className={`flex flex-col border-l border-border bg-sidebar
          fixed inset-y-0 right-0 z-30 w-72 transition-transform duration-300
          md:relative md:z-auto md:shrink-0 md:transition-[width] md:duration-300
          ${rightSidebarOpen
            ? 'translate-x-0 md:w-72'
            : 'translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-0'
          }`}
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <RightSidebar />
        </div>
      </aside>

      <AlgorithmVisualizer />
      <PackingProgressModal />
    </div>
  )
}
