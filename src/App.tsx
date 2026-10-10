import { CardDrawer } from './components/CardDrawer'
import { RequestDrawer } from './components/RequestDrawer'
import { Sidebar } from './components/Sidebar'
import { useUiStore } from './lib/ui-store'
import { useAppStore } from './store/useAppStore'
import { BoardView } from './views/BoardView'
import { InboxView } from './views/InboxView'
import { RequestsView } from './views/RequestsView'
import { SettingsView } from './views/SettingsView'

export default function App() {
  const view = useUiStore((s) => s.view)
  const currentUserId = useAppStore((s) => s.currentUserId)
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased">
      <Sidebar />
      <main className="min-w-0 flex-1">
        {view === 'board' && <BoardView />}
        {view === 'requests' && <RequestsView />}
        {view === 'inbox' && <InboxView key={currentUserId} />}
        {view === 'settings' && <SettingsView />}
      </main>
      <CardDrawer />
      <RequestDrawer />
    </div>
  )
}
