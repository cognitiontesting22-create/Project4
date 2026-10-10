import { create } from 'zustand'
import type { ColumnId } from '../domain/types'

export type View = 'board' | 'requests' | 'inbox' | 'settings'
export const VIEWS: View[] = ['board', 'requests', 'inbox', 'settings']

export type CardDrawerState = { mode: 'closed' } | { mode: 'edit'; id: string } | { mode: 'new'; column: ColumnId }

interface UiState {
  view: View
  cardDrawer: CardDrawerState
  requestDrawer: string | 'new' | null
  setView: (view: View) => void
  openCard: (id: string) => void
  newCard: (column: ColumnId) => void
  closeCard: () => void
  openRequest: (id: string | 'new') => void
  closeRequest: () => void
}

function viewFromHash(): View {
  const v = window.location.hash.replace(/^#\/?/, '') as View
  return VIEWS.includes(v) ? v : 'board'
}

export const useUiStore = create<UiState>((set) => ({
  view: viewFromHash(),
  cardDrawer: { mode: 'closed' },
  requestDrawer: null,
  setView: (view) => {
    if (window.location.hash !== `#/${view}`) window.location.hash = `/${view}`
    set({ view })
  },
  openCard: (id) => set({ cardDrawer: { mode: 'edit', id }, requestDrawer: null }),
  newCard: (column) => set({ cardDrawer: { mode: 'new', column } }),
  closeCard: () => set({ cardDrawer: { mode: 'closed' } }),
  openRequest: (id) => set({ requestDrawer: id, cardDrawer: { mode: 'closed' } }),
  closeRequest: () => set({ requestDrawer: null }),
}))

window.addEventListener('hashchange', () => useUiStore.setState({ view: viewFromHash() }))
