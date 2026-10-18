import { create } from 'zustand'
import type { ColumnId } from '../domain/types'
import { normalizeLabels } from './filters'
import type { BoardFilters } from './filters'

export type View = 'board' | 'requests' | 'inbox' | 'archive' | 'settings'
export const VIEWS: View[] = ['board', 'requests', 'inbox', 'archive', 'settings']

export type CardDrawerState = { mode: 'closed' } | { mode: 'edit'; id: string } | { mode: 'new'; column: ColumnId }

export const EMPTY_BOARD_FILTERS: BoardFilters = {
  query: '',
  assigneeIds: [],
  type: '',
  customer: '',
  blockedOnly: false,
  labels: [],
}

interface UiState {
  view: View
  cardDrawer: CardDrawerState
  requestDrawer: string | 'new' | null
  boardFilters: BoardFilters
  setView: (view: View) => void
  setBoardFilters: (filters: BoardFilters) => void
  clearBoardFilters: () => void
  toggleBoardLabel: (label: string) => void
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
  boardFilters: EMPTY_BOARD_FILTERS,
  setView: (view) => {
    if (window.location.hash !== `#/${view}`) window.location.hash = `/${view}`
    set({ view })
  },
  setBoardFilters: (boardFilters) => set({ boardFilters }),
  clearBoardFilters: () => set({ boardFilters: { ...EMPTY_BOARD_FILTERS, assigneeIds: [], labels: [] } }),
  toggleBoardLabel: (label) =>
    set((state) => {
      const key = normalizeLabels([label])[0]
      if (!key) return {}
      const labels = normalizeLabels(state.boardFilters.labels)
      return {
        boardFilters: {
          ...state.boardFilters,
          labels: labels.includes(key)
            ? labels.filter((selected) => selected !== key)
            : [...labels, key],
        },
      }
    }),
  openCard: (id) => set({ cardDrawer: { mode: 'edit', id }, requestDrawer: null }),
  newCard: (column) => set({ cardDrawer: { mode: 'new', column } }),
  closeCard: () => set({ cardDrawer: { mode: 'closed' } }),
  openRequest: (id) => set({ requestDrawer: id, cardDrawer: { mode: 'closed' } }),
  closeRequest: () => set({ requestDrawer: null }),
}))

window.addEventListener('hashchange', () => useUiStore.setState({ view: viewFromHash() }))
