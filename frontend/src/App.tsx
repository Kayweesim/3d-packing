import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useStore } from '@/src/store'
import { SceneCanvas } from '@/src/components/3d/Canvas'
import { Sidebar } from '@/src/components/ui/Sidebar'

export default function App() {
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  return (
    <div className="dark flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`shrink-0 flex flex-col border-r border-border bg-sidebar transition-[width] duration-200 ${
          sidebarOpen ? 'w-72' : 'w-0 overflow-hidden border-0'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-sidebar-foreground">Container Packer</span>
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
      </div>
    </div>
  )
}
