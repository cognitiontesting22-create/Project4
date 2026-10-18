import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import clsx from 'clsx'
import { Ban, ChevronDown, Download, Plus, Search, Tag, TriangleAlert, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { COLUMNS, type Card, type ColumnId, type Member } from '../domain/types'
import { parseBoardFile, serializeBoard, type ParsedBoard } from '../domain/boardFile'
import { formatDays, timeInColumnDays } from '../domain/history'
import { isStale, medianCycleTimeDays, shippedInWindow } from '../domain/metrics'
import { wipBlockReason } from '../domain/wip'
import { dependencyBlockReason, isDependencyBlocked, openBlockers } from '../domain/dependencies'
import { Avatar } from '../components/Avatar'
import { CardView, SortableCard } from '../components/CardItem'
import { btnPrimary, COLUMN_ACCENT, TYPE_META } from '../lib/meta'
import { filterCards, normalizeLabels, type BoardFilters } from '../lib/filters'
import { keyboardMoveTarget, type MoveDir } from '../lib/keyboard'
import { useNow } from '../lib/useNow'
import { useUiStore } from '../lib/ui-store'
import { useToastStore } from '../lib/toast'
import { useAppStore } from '../store/useAppStore'

type Order = Record<ColumnId, string[]>
const isColumn = (id: string): id is ColumnId => COLUMNS.some((column) => column.id === id)
const directions: Record<string, MoveDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

function isFiltersActive(filters: BoardFilters): boolean {
  return Boolean(
    filters.query.trim() ||
      filters.assigneeIds.length ||
      filters.type ||
      filters.customer ||
      filters.blockedOnly ||
      filters.labels.length,
  )
}

function focusCard(cardId: string) {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`)
      ?.focus()
  })
}

type BoardImportDialogState =
  | { type: 'error'; filename: string; reason: string }
  | {
      type: 'confirm'
      filename: string
      board: Extract<ParsedBoard, { ok: true }>
      currentCount: number
    }

export function BoardView() {
  const cards = useAppStore((state) => state.cards)
  const columnOrder = useAppStore((state) => state.columnOrder)
  const members = useAppStore((state) => state.members)
  const settings = useAppStore((state) => state.settings)
  const moveCard = useAppStore((state) => state.moveCard)
  const importBoard = useAppStore((state) => state.importBoard)
  const filters = useUiStore((state) => state.boardFilters)
  const setFilters = useUiStore((state) => state.setBoardFilters)
  const clearFilters = useUiStore((state) => state.clearBoardFilters)
  const toggleLabelFilter = useUiStore((state) => state.toggleBoardLabel)
  const openCard = useUiStore((state) => state.openCard)
  const newCard = useUiStore((state) => state.newCard)
  const showToast = useToastStore((state) => state.showToast)
  const now = useNow()

  const [dragOrder, setDragOrder] = useState<Order | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [blockedHover, setBlockedHover] = useState<{ column: ColumnId; message: string } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [importDialog, setImportDialog] = useState<BoardImportDialogState | null>(null)

  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const activeCards = useMemo(() => cards.filter((card) => !card.archivedAt), [cards])
  const shipped = useMemo(() => shippedInWindow(cards, now), [cards, now])
  const median = medianCycleTimeDays(shipped)
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  )
  const customers = useMemo(
    () => [...new Set(activeCards.map((card) => card.customer).filter(Boolean))].sort(),
    [activeCards],
  )
  const filteredCards = useMemo(() => filterCards(cards, filters), [cards, filters])
  const filteredIds = useMemo(
    () => new Set(filteredCards.map((card) => card.id)),
    [filteredCards],
  )
  const filtered = isFiltersActive(filters)
  const visibleOrder = useMemo(() => {
    const order = {} as Order
    for (const column of COLUMNS) {
      order[column.id] = columnOrder[column.id].filter(
        (id) => byId.has(id) && filteredIds.has(id),
      )
    }
    return order
  }, [byId, columnOrder, filteredIds])
  const order = dragOrder ?? visibleOrder
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const wipLimit = settings.doingWipLimit
  const doingCount = columnOrder.doing.length
  const doingIsFull = wipLimit > 0 && doingCount >= wipLimit
  const doingBlockReason = wipBlockReason({ cards, settings }, null)
  const totalVisible = COLUMNS.reduce((count, column) => count + visibleOrder[column.id].length, 0)
  const blockedCount = cards.filter(
    (card) => card.column !== 'done' && (card.blocked || isDependencyBlocked(cards, card)),
  ).length
  const escalations = cards.filter((card) => card.type === 'escalation' && card.column !== 'done').length

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const containerOf = (id: string, currentOrder: Order): ColumnId | undefined =>
    isColumn(id)
      ? id
      : COLUMNS.find((column) => currentOrder[column.id].includes(id))?.id

  const moveWithFeedback = (
    id: string,
    to: ColumnId,
    toIndex: number,
    restoreFocus = false,
  ) => {
    const before = useAppStore.getState()
    const cardBefore = before.cards.find((card) => card.id === id)
    if (!cardBefore) return
    const oldColumn = cardBefore.column
    const oldIndex = before.columnOrder[oldColumn].indexOf(id)
    const result = moveCard(id, to, toIndex)
    if (!result.ok) {
      showToast({ message: result.reason, variant: 'error' })
      return
    }

    const current = useAppStore.getState()
    const cardAfter = current.cards.find((card) => card.id === id)
    const position = current.columnOrder[to].indexOf(id)
    if (!cardAfter || (oldColumn === to && oldIndex === position)) return
    const columnTitle = COLUMNS.find((column) => column.id === to)?.title ?? to
    setAnnouncement(
      `Moved '${cardAfter.title}' to ${columnTitle}, position ${position + 1} of ${current.columnOrder[to].length}`,
    )
    if (restoreFocus) focusCard(id)
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    setDragOrder(visibleOrder)
    setBlockedHover(null)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) {
      setBlockedHover(null)
      return
    }
    const activeCard = byId.get(String(active.id))
    const destination = containerOf(String(over.id), dragOrder ?? visibleOrder)
    const refusal =
      activeCard && activeCard.column !== 'doing' && destination === 'doing' && doingIsFull
        ? { column: 'doing' as const, message: `WIP limit reached · ${doingCount}/${wipLimit}` }
        : activeCard && activeCard.column !== 'done' && destination === 'done'
          ? (() => {
              const reason = dependencyBlockReason(cards, activeCard.blockedBy)
              return reason ? { column: 'done' as const, message: reason } : null
            })()
          : null
    setBlockedHover((current) =>
      current?.column === refusal?.column && current?.message === refusal?.message ? current : refusal,
    )
    if (refusal) return

    setDragOrder((previous) => {
      if (!previous) return previous
      const from = containerOf(String(active.id), previous)
      const to = containerOf(String(over.id), previous)
      if (!from || !to || from === to) return previous
      const target = previous[to]
      const foundIndex = isColumn(String(over.id))
        ? target.length
        : target.indexOf(String(over.id))
      const overIndex = foundIndex < 0 ? target.length : foundIndex
      return {
        ...previous,
        [from]: previous[from].filter((id) => id !== String(active.id)),
        [to]: [
          ...target.slice(0, overIndex),
          String(active.id),
          ...target.slice(overIndex),
        ],
      }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id)
    let final = dragOrder
    setActiveId(null)
    setDragOrder(null)
    setBlockedHover(null)
    if (!final || !over) return

    const overId = String(over.id)
    let source = containerOf(id, final)
    let destination = containerOf(overId, final) ?? source
    if (!source || !destination) return
    if (source !== destination) {
      const destinationItems = final[destination].filter((item) => item !== id)
      const overIndex = isColumn(overId)
        ? destinationItems.length
        : Math.max(0, destinationItems.indexOf(overId))
      final = {
        ...final,
        [source]: final[source].filter((item) => item !== id),
        [destination]: [
          ...destinationItems.slice(0, overIndex),
          id,
          ...destinationItems.slice(overIndex),
        ],
      }
      source = destination
    }

    if (!isColumn(overId) && final[source].includes(overId) && overId !== id) {
      const list = final[source]
      final = {
        ...final,
        [source]: arrayMove(list, list.indexOf(id), list.indexOf(overId)),
      }
    }

    const list = final[source]
    const position = list.indexOf(id)
    const otherVisible = list.filter((item) => item !== id)
    const fullOrder = columnOrder[source].filter((item) => item !== id)
    let toIndex = fullOrder.length
    const nextVisibleId = list[position + 1]
    const previousVisibleId = list[position - 1]
    if (nextVisibleId) {
      const nextIndex = fullOrder.indexOf(nextVisibleId)
      if (nextIndex >= 0) toIndex = nextIndex
    } else if (previousVisibleId) {
      const previousIndex = fullOrder.indexOf(previousVisibleId)
      if (previousIndex >= 0) toIndex = previousIndex + 1
    } else if (otherVisible.length === 0) {
      toIndex = fullOrder.length
    }

    const card = byId.get(id)
    const oldIndex = card ? columnOrder[card.column].indexOf(id) : -1
    if (card && card.column === source && oldIndex === toIndex) return
    moveWithFeedback(id, source, toIndex)
  }

  const onCardKeyDown = (cardId: string, event: KeyboardEvent<HTMLDivElement>) => {
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()

    if (event.altKey) {
      const target = keyboardMoveTarget(columnOrder, cardId, direction)
      if (target) moveWithFeedback(cardId, target.to, target.toIndex, true)
      return
    }

    const from = containerOf(cardId, visibleOrder)
    if (!from) return
    const index = visibleOrder[from].indexOf(cardId)
    let targetId: string | undefined
    if (direction === 'up' || direction === 'down') {
      targetId = visibleOrder[from][index + (direction === 'up' ? -1 : 1)]
    } else {
      const columnIndex = COLUMNS.findIndex((column) => column.id === from)
      const delta = direction === 'left' ? -1 : 1
      for (
        let nextColumnIndex = columnIndex + delta;
        nextColumnIndex >= 0 && nextColumnIndex < COLUMNS.length;
        nextColumnIndex += delta
      ) {
        const adjacent = visibleOrder[COLUMNS[nextColumnIndex].id]
        if (adjacent.length) {
          targetId = adjacent[Math.min(index, adjacent.length - 1)]
          break
        }
      }
    }
    if (targetId) focusCard(targetId)
  }

  const exportBoardFile = () => {
    const blob = new Blob([serializeBoard({ cards, columnOrder })], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relay-board-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setFileMenuOpen(false)
  }

  const handleBoardFile = async (file: File) => {
    setFileMenuOpen(false)
    try {
      const text = await file.text()
      const result = parseBoardFile(text, {
        memberIds: members.map((member) => member.id),
        requestIds: useAppStore.getState().requests.map((request) => request.id),
        currentUserId: useAppStore.getState().currentUserId,
      })
      if (!result.ok) {
        setImportDialog({ type: 'error', filename: file.name, reason: result.reason })
        return
      }
      setImportDialog({
        type: 'confirm',
        filename: file.name,
        board: result,
        currentCount: cards.length,
      })
    } catch {
      setImportDialog({
        type: 'error',
        filename: file.name,
        reason: 'This file could not be read.',
      })
    }
  }

  const confirmBoardImport = () => {
    if (importDialog?.type !== 'confirm') return
    const count = importDialog.board.cards.length
    importBoard({
      cards: importDialog.board.cards,
      columnOrder: importDialog.board.columnOrder,
    })
    setImportDialog(null)
    showToast({
      message: `Imported ${count} cards`,
      variant: 'info',
      action: {
        label: 'Undo',
        onClick: () => {
          const label = useAppStore.getState().undo()
          if (label) showToast({ message: `Undid: ${label}`, variant: 'info' })
        },
      },
    })
  }

  const activeCard = activeId ? byId.get(activeId) : undefined

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-8 pb-4 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Engineering board</h1>
              <span className="text-sm text-slate-500">{shipped.length} shipped in the last 7 days</span>
              <span className="text-sm text-slate-500">
                Median cycle time {median === null ? 'n/a' : formatDays(median)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {activeCards.length} cards · <span className="text-orange-600">{escalations} open escalations</span> ·{' '}
              <span className="text-rose-600">{blockedCount} blocked</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                aria-expanded={fileMenuOpen}
                onClick={() => setFileMenuOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Export / Import
                <ChevronDown className="h-4 w-4" />
              </button>
              {fileMenuOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <button
                    type="button"
                    onClick={exportBoardFile}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4 text-slate-400" />
                    Export board (.json)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFileMenuOpen(false)
                      importFileRef.current?.click()
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-4 w-4 text-slate-400" />
                    Import board…
                  </button>
                </div>
              )}
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void handleBoardFile(file)
                }}
              />
            </div>
            <button className={btnPrimary} onClick={() => newCard('todo')}>
              <Plus className="h-4 w-4" />
              New card
            </button>
          </div>
        </div>
        <Toolbar
          filters={filters}
          setFilters={setFilters}
          members={members}
          customers={customers}
          cards={activeCards}
          searchRef={searchRef}
        />
        {filtered && (
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            Showing {totalVisible} of {activeCards.length} cards ·{' '}
            <button className="font-medium text-indigo-600 hover:underline" onClick={clearFilters}>
              Clear filters
            </button>
          </p>
        )}
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null)
          setDragOrder(null)
          setBlockedHover(null)
        }}
      >
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-5 overflow-x-auto px-8 py-6">
          {COLUMNS.map((column) => {
            const fullCount = columnOrder[column.id].length
            return (
              <Column
                key={column.id}
                id={column.id}
                title={column.title}
                count={fullCount}
                wipLimit={column.id === 'doing' ? wipLimit : 0}
                wipFull={column.id === 'doing' && doingIsFull}
                blockedDragOver={blockedHover?.column === column.id ? blockedHover.message : null}
                blockReason={column.id === 'doing' ? doingBlockReason : null}
                onAdd={() => newCard(column.id)}
              >
                <SortableContext items={order[column.id]} strategy={verticalListSortingStrategy}>
                  {order[column.id].map((id) => {
                    const card = byId.get(id)
                    if (!card) return null
                    return (
                      <SortableCard
                        key={id}
                        card={card}
                        query={filters.query}
                        blockers={openBlockers(cards, card.blockedBy)}
                        staleDays={
                          isStale(card, now, settings.staleAfterDays)
                            ? timeInColumnDays(card, now)
                            : null
                        }
                        assignee={memberById.get(card.assigneeId ?? '')}
                        onOpen={() => openCard(id)}
                        onLabelFilter={toggleLabelFilter}
                        onCardKeyDown={(event) => onCardKeyDown(id, event)}
                      />
                    )
                  })}
                </SortableContext>
                {order[column.id].length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
                    {filtered ? 'No cards match your filters' : 'Drop cards here'}
                  </div>
                )}
              </Column>
            )
          })}
        </div>
        <p className="px-8 pb-4 text-xs text-slate-400">
          Tip: select a card, then ⌥/Alt + arrows to move it · ? for all shortcuts
        </p>
        <DragOverlay>
          {activeCard && (
            <CardView
              card={activeCard}
              query={filters.query}
              blockers={openBlockers(cards, activeCard.blockedBy)}
              staleDays={
                isStale(activeCard, now, settings.staleAfterDays)
                  ? timeInColumnDays(activeCard, now)
                  : null
              }
              assignee={memberById.get(activeCard.assigneeId ?? '')}
              overlay
            />
          )}
        </DragOverlay>
      </DndContext>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {importDialog && (
        <BoardImportDialog
          dialog={importDialog}
          onCancel={() => setImportDialog(null)}
          onConfirm={confirmBoardImport}
        />
      )}
    </div>
  )
}

function Column({
  id,
  title,
  count,
  wipLimit,
  wipFull,
  blockedDragOver,
  blockReason,
  onAdd,
  children,
}: {
  id: ColumnId
  title: string
  count: number
  wipLimit: number
  wipFull: boolean
  blockedDragOver: string | null
  blockReason: string | null
  onAdd: () => void
  children: ReactNode
}) {
  const { setNodeRef } = useDroppable({ id })
  const addDisabled = id === 'doing' && wipFull
  return (
    <section
      aria-label={title}
      className={clsx(
        'flex min-h-0 min-w-72 flex-col rounded-2xl bg-slate-100/70 ring-1 ring-inset transition-colors',
        blockedDragOver ? 'ring-2 ring-rose-400' : 'ring-slate-200/60',
      )}
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <span className={clsx('h-2 w-2 rounded-full', COLUMN_ACCENT[id])} />
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <span
          className={clsx(
            'rounded-full bg-white px-2 py-px text-xs font-medium ring-1',
            wipFull ? 'text-rose-700 ring-rose-200' : 'text-slate-500 ring-slate-200',
          )}
        >
          {count}
          {wipLimit > 0 && ` / ${wipLimit}`}
        </span>
        {wipFull && <span className="text-[11px] font-semibold text-rose-700">Full</span>}
        <button
          onClick={onAdd}
          aria-label={`Add card to ${title}`}
          disabled={addDisabled}
          title={addDisabled ? blockReason ?? undefined : undefined}
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3 pt-1">
        {blockedDragOver && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            <TriangleAlert className="mr-1 inline h-3.5 w-3.5" />
            {blockedDragOver}
          </div>
        )}
        {children}
      </div>
    </section>
  )
}

function Toolbar({
  filters,
  setFilters,
  members,
  customers,
  cards,
  searchRef,
}: {
  filters: BoardFilters
  setFilters: (filters: BoardFilters) => void
  members: Member[]
  customers: string[]
  cards: Card[]
  searchRef: React.RefObject<HTMLInputElement | null>
}) {
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [labelSearch, setLabelSearch] = useState('')
  const update = (patch: Partial<BoardFilters>) => setFilters({ ...filters, ...patch })
  const selectCls =
    'rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'
  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const card of cards) {
      for (const label of normalizeLabels(card.labels)) {
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .filter(([label]) => label.includes(labelSearch.trim().toLocaleLowerCase()))
      .sort(([left], [right]) => left.localeCompare(right))
  }, [cards, labelSearch])

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          value={filters.query}
          onChange={(event) => update({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              update({ query: '' })
              event.currentTarget.blur()
            }
          }}
          placeholder="Search title or description… /"
          aria-label="Search cards"
          className="w-60 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        {filters.query && (
          <button
            onClick={() => update({ query: '' })}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center -space-x-1" role="group" aria-label="Filter by assignee">
        {members.map((member) => {
          const selected = filters.assigneeIds.includes(member.id)
          return (
            <button
              key={member.id}
              onClick={() =>
                update({
                  assigneeIds: selected
                    ? filters.assigneeIds.filter((id) => id !== member.id)
                    : [...filters.assigneeIds, member.id],
                })
              }
              aria-label={`Filter by ${member.name}`}
              aria-pressed={selected}
              className={clsx(
                'rounded-full transition',
                selected
                  ? 'z-10 scale-110 ring-2 ring-indigo-500'
                  : filters.assigneeIds.length
                    ? 'opacity-40 hover:opacity-100'
                    : 'hover:z-10 hover:-translate-y-0.5',
              )}
            >
              <Avatar member={member} />
            </button>
          )
        })}
      </div>
      <select
        aria-label="Filter by type"
        className={selectCls}
        value={filters.type}
        onChange={(event) =>
          update({ type: event.target.value as BoardFilters['type'] })
        }
      >
        <option value="">All types</option>
        {(Object.keys(TYPE_META) as Card['type'][]).map((type) => (
          <option key={type} value={type}>
            {TYPE_META[type].label}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by customer"
        className={selectCls}
        value={filters.customer}
        onChange={(event) => update({ customer: event.target.value })}
      >
        <option value="">All customers</option>
        {customers.map((customer) => (
          <option key={customer} value={customer}>
            {customer}
          </option>
        ))}
      </select>
      <button
        onClick={() => update({ blockedOnly: !filters.blockedOnly })}
        aria-pressed={filters.blockedOnly}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm shadow-sm',
          filters.blockedOnly
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
        )}
      >
        <Ban className="h-3.5 w-3.5" />
        Blocked
      </button>
      <div className="relative">
        <button
          type="button"
          aria-expanded={labelsOpen}
          onClick={() => setLabelsOpen((open) => !open)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm shadow-sm',
            filters.labels.length
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          <Tag className="h-3.5 w-3.5" />
          Labels{filters.labels.length > 0 && ` · ${filters.labels.length}`}
        </button>
        {labelsOpen && (
          <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Filter by label</h3>
              <button
                type="button"
                className="text-xs font-medium text-indigo-600 hover:underline"
                onClick={() => update({ labels: [] })}
              >
                Clear
              </button>
            </div>
            <input
              value={labelSearch}
              onChange={(event) => setLabelSearch(event.target.value)}
              placeholder="Search labels…"
              aria-label="Search labels"
              className="mb-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {labelCounts.map(([label, count]) => (
                <label
                  key={label}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={filters.labels.some((selected) => selected.toLocaleLowerCase() === label)}
                    onChange={() =>
                      update({
                        labels: filters.labels.some(
                          (selected) => selected.toLocaleLowerCase() === label,
                        )
                          ? filters.labels.filter(
                              (selected) => selected.toLocaleLowerCase() !== label,
                            )
                          : [...filters.labels, label],
                      })
                    }
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="flex-1">{label}</span>
                  <span className="text-xs tabular-nums text-slate-400">{count}</span>
                </label>
              ))}
              {labelCounts.length === 0 && (
                <p className="px-1.5 py-2 text-xs text-slate-400">No labels found</p>
              )}
            </div>
          </div>
        )}
      </div>
      {filters.labels.map((label) => (
        <button
          key={label}
          type="button"
          title={`Remove label filter ${label}`}
          onClick={() =>
            update({ labels: filters.labels.filter((selected) => selected !== label) })
          }
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
        >
          {label}
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  )
}

export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform
  const isMac = /mac/i.test(platform)
  const modifier = isMac ? '⌘' : 'Ctrl'
  const moveModifier = isMac ? '⌥' : 'Alt'
  const shortcuts = [
    [`Move card`, `${moveModifier} + ↑ / ↓ / ← / →`],
    ['Move focus between cards', '↑ / ↓ / ← / →'],
    ['Open selected card', 'Enter'],
    ['Undo', `${modifier} + Z`],
    ['Redo', `${modifier} + Shift + Z`],
    ['Redo (alternate)', 'Ctrl + Y'],
    ['Focus search', '/'],
    ['Show these shortcuts', '?'],
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-lg font-semibold text-slate-900">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="space-y-3">
          {shortcuts.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-slate-600">{label}</dt>
              <dd className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                {keys}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

function BoardImportDialog({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: BoardImportDialogState
  onCancel: () => void
  onConfirm: () => void
}) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef(onCancel)
  useEffect(() => {
    cancelRef.current = onCancel
  }, [onCancel])

  useEffect(() => {
    primaryRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const confirmation = dialog.type === 'confirm' ? dialog : null
  const warningCount = confirmation?.board.unassignedCount ?? 0
  const droppedBlockers = confirmation?.board.droppedBlockerCount ?? 0
  const warning =
      warningCount === 1
      ? "1 card will be unassigned because its assignee isn't on this team."
      : `${warningCount} cards will be unassigned because their assignee isn't on this team.`

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4"
      onClick={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-import-title"
        aria-describedby="board-import-description"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {dialog.type === 'error' ? (
          <>
            <h2 id="board-import-title" className="text-lg font-semibold text-slate-900">
              Couldn't import {dialog.filename}
            </h2>
            <p id="board-import-description" className="mt-3 text-sm text-slate-600">
              {dialog.reason}
            </p>
            <p className="mt-2 text-sm text-slate-500">Your board was not changed.</p>
            <div className="mt-6 flex justify-end">
              <button ref={primaryRef} className={btnPrimary} onClick={onCancel}>
                OK
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="board-import-title" className="text-lg font-semibold text-slate-900">
              Replace board?
            </h2>
            <p id="board-import-description" className="mt-3 text-sm leading-relaxed text-slate-600">
              Replace {dialog.currentCount} cards with {dialog.board.cards.length} cards from{' '}
              {dialog.filename}? Feature requests, team and settings stay as they are.
            </p>
            {warningCount > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {warning}
              </p>
            )}
            {droppedBlockers > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {droppedBlockers === 1
                  ? '1 blocker link will be dropped because it points to a card that is not in this file or would create a cycle.'
                  : `${droppedBlockers} blocker links will be dropped because they point to cards that are not in this file or would create a cycle.`}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onCancel}>
                Cancel
              </button>
              <button
                ref={primaryRef}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                onClick={onConfirm}
              >
                Replace board
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
