import { Redo2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CardDrawer } from './components/CardDrawer'
import { RequestDrawer } from './components/RequestDrawer'
import { Sidebar } from './components/Sidebar'
import { Toaster } from './components/Toaster'
import { redoWithToast, undoWithToast } from './lib/undo'
import { useUiStore } from './lib/ui-store'
import { canRedo, canUndo, useAppStore } from './store/useAppStore'
import { BoardView, KeyboardShortcutsDialog } from './views/BoardView'
import { ArchiveView } from './views/ArchiveView'
import { InboxView } from './views/InboxView'
import { RequestsView } from './views/RequestsView'
import { SettingsView } from './views/SettingsView'

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function isMacPlatform(): boolean {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform
  return /mac/i.test(platform)
}

export default function App() {
  const view = useUiStore((state) => state.view)
  const currentUserId = useAppStore((state) => state.currentUserId)
  const undoAvailable = useAppStore(canUndo)
  const redoAvailable = useAppStore(canRedo)
  const undoLabel = useAppStore((state) => state.past[state.past.length - 1]?.label)
  const redoLabel = useAppStore((state) => state.future[state.future.length - 1]?.label)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const modifier = isMacPlatform() ? '⌘' : 'Ctrl'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      const key = event.key.toLowerCase()
      const hasModifier = event.metaKey || event.ctrlKey
      if (!hasModifier) return
      const store = useAppStore.getState()
      if (key === 'z') {
        if (event.shiftKey ? store.future.length === 0 : store.past.length === 0) return
        event.preventDefault()
        if (event.shiftKey) redoWithToast()
        else undoWithToast()
      } else if (key === 'y' && store.future.length > 0) {
        event.preventDefault()
        redoWithToast()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-slate-200 bg-white px-5">
          <span className="mr-2 text-xs text-slate-400">History</span>
          <button
            type="button"
            aria-label="Undo"
            title={undoLabel ? `Undo ${undoLabel} (${modifier}+Z)` : `Undo (${modifier}+Z)`}
            disabled={!undoAvailable}
            onClick={undoWithToast}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Redo"
            title={
              redoLabel
                ? `Redo ${redoLabel} (${modifier}+Shift+Z / Ctrl+Y)`
                : `Redo (${modifier}+Shift+Z / Ctrl+Y)`
            }
            disabled={!redoAvailable}
            onClick={redoWithToast}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1">
          {view === 'board' && <BoardView />}
          {view === 'requests' && <RequestsView />}
          {view === 'inbox' && <InboxView key={currentUserId} />}
          {view === 'archive' && <ArchiveView />}
          {view === 'settings' && <SettingsView />}
        </div>
      </main>
      {shortcutsOpen && <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      <CardDrawer />
      <RequestDrawer />
      <Toaster />
    </div>
  )
}
