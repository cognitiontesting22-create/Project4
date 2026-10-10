import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import clsx from 'clsx'
import { Ban, Plus, Search, TriangleAlert, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { COLUMNS, type Card, type CardType, type ColumnId, type Member } from '../domain/types'
import { Avatar } from '../components/Avatar'
import { CardView, SortableCard } from '../components/CardItem'
import { btnPrimary, COLUMN_ACCENT, TYPE_META } from '../lib/meta'
import { useUiStore } from '../lib/ui-store'
import { useAppStore } from '../store/useAppStore'

type Order = Record<ColumnId, string[]>
const isColumn = (id: string): id is ColumnId => COLUMNS.some((c) => c.id === id)

interface Filters {
  query: string
  assignees: string[]
  type: CardType | ''
  customer: string
  blockedOnly: boolean
}
const EMPTY: Filters = { query: '', assignees: [], type: '', customer: '', blockedOnly: false }

function matches(card: Card, f: Filters): boolean {
  if (f.assignees.length && !f.assignees.includes(card.assigneeId ?? '')) return false
  if (f.type && card.type !== f.type) return false
  if (f.customer && card.customer !== f.customer) return false
  if (f.blockedOnly && !card.blocked) return false
  if (f.query) {
    const q = f.query.toLowerCase()
    const hay = `${card.title} ${card.description} ${card.customer} ${card.labels.join(' ')}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export function BoardView() {
  const cards = useAppStore((s) => s.cards)
  const columnOrder = useAppStore((s) => s.columnOrder)
  const members = useAppStore((s) => s.members)
  const wipLimit = useAppStore((s) => s.settings.wipLimitDoing)
  const moveCard = useAppStore((s) => s.moveCard)
  const openCard = useUiStore((s) => s.openCard)
  const newCard = useUiStore((s) => s.newCard)

  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [dragOrder, setDragOrder] = useState<Order | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const customers = useMemo(() => [...new Set(cards.map((c) => c.customer).filter(Boolean))].sort(), [cards])
  const filtered = filters !== EMPTY

  const visibleOrder: Order = useMemo(() => {
    const out = {} as Order
    for (const col of COLUMNS) out[col.id] = columnOrder[col.id].filter((id) => byId.has(id) && matches(byId.get(id)!, filters))
    return out
  }, [columnOrder, byId, filters])

  const order = dragOrder ?? visibleOrder
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const containerOf = (id: string, o: Order): ColumnId | undefined => (isColumn(id) ? id : COLUMNS.find((c) => o[c.id].includes(id))?.id)

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    setDragOrder(visibleOrder)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    setDragOrder((prev) => {
      if (!prev) return prev
      const from = containerOf(String(active.id), prev)
      const to = containerOf(String(over.id), prev)
      if (!from || !to || from === to) return prev
      const target = prev[to]
      const overIndex = isColumn(String(over.id)) ? target.length : target.indexOf(String(over.id))
      return {
        ...prev,
        [from]: prev[from].filter((x) => x !== active.id),
        [to]: [...target.slice(0, overIndex), String(active.id), ...target.slice(overIndex)],
      }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id)
    let final = dragOrder
    setActiveId(null)
    setDragOrder(null)
    if (!final || !over) return
    const col = containerOf(id, final)
    if (!col) return
    const overId = String(over.id)
    if (!isColumn(overId) && final[col].includes(overId)) {
      const list = final[col]
      final = { ...final, [col]: arrayMove(list, list.indexOf(id), list.indexOf(overId)) }
    }
    const visible = final[col]
    const pos = visible.indexOf(id)
    const full = columnOrder[col].filter((x) => x !== id)
    let index = full.length
    if (pos < visible.length - 1) index = full.indexOf(visible[pos + 1])
    else if (pos > 0) index = full.indexOf(visible[pos - 1]) + 1
    const card = byId.get(id)
    const currentIndex = columnOrder[col].indexOf(id)
    if (card && card.column === col && currentIndex === index) return
    moveCard(id, col, index)
  }

  const activeCard = activeId ? byId.get(activeId) : undefined
  const totalVisible = COLUMNS.reduce((n, c) => n + visibleOrder[c.id].length, 0)
  const blockedCount = cards.filter((c) => c.blocked && c.column !== 'done').length
  const escalations = cards.filter((c) => c.type === 'escalation' && c.column !== 'done').length

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-8 pb-4 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Engineering board</h1>
            <p className="mt-1 text-sm text-slate-500">
              {cards.length} cards · <span className="text-orange-600">{escalations} open escalations</span> · <span className="text-rose-600">{blockedCount} blocked</span>
            </p>
          </div>
          <button className={btnPrimary} onClick={() => newCard('todo')}>
            <Plus className="h-4 w-4" />
            New card
          </button>
        </div>
        <Toolbar filters={filters} setFilters={setFilters} members={members} customers={customers} />
        {filtered && (
          <p className="mt-3 text-xs text-slate-500">
            Showing {totalVisible} of {cards.length} cards ·{' '}
            <button className="font-medium text-indigo-600 hover:underline" onClick={() => setFilters(EMPTY)}>
              Clear filters
            </button>
          </p>
        )}
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setDragOrder(null))}>
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-5 overflow-x-auto px-8 py-6">
          {COLUMNS.map((col) => {
            const fullCount = columnOrder[col.id].length
            const overWip = col.id === 'doing' && wipLimit > 0 && fullCount > wipLimit
            return (
              <Column key={col.id} id={col.id} title={col.title} count={fullCount} wipLimit={col.id === 'doing' ? wipLimit : 0} overWip={overWip} onAdd={() => newCard(col.id)}>
                <SortableContext items={order[col.id]} strategy={verticalListSortingStrategy}>
                  {order[col.id].map((id) => {
                    const card = byId.get(id)
                    if (!card) return null
                    return <SortableCard key={id} card={card} assignee={memberById.get(card.assigneeId ?? '')} onOpen={() => openCard(id)} />
                  })}
                </SortableContext>
                {order[col.id].length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">{filtered ? 'No matching cards' : 'Drop cards here'}</div>
                )}
              </Column>
            )
          })}
        </div>
        <DragOverlay>{activeCard && <CardView card={activeCard} assignee={memberById.get(activeCard.assigneeId ?? '')} overlay />}</DragOverlay>
      </DndContext>
    </div>
  )
}

function Column({
  id,
  title,
  count,
  wipLimit,
  overWip,
  onAdd,
  children,
}: {
  id: ColumnId
  title: string
  count: number
  wipLimit: number
  overWip: boolean
  onAdd: () => void
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section aria-label={title} className={clsx('flex min-h-0 min-w-72 flex-col rounded-2xl bg-slate-100/70 ring-1 ring-inset transition-colors', isOver ? 'ring-indigo-300' : 'ring-slate-200/60')}>
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <span className={clsx('h-2 w-2 rounded-full', COLUMN_ACCENT[id])} />
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <span className="rounded-full bg-white px-2 py-px text-xs font-medium text-slate-500 ring-1 ring-slate-200">
          {count}
          {wipLimit > 0 && ` / ${wipLimit}`}
        </span>
        {overWip && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-px text-[11px] font-medium text-rose-700" title="Work-in-progress limit exceeded — finish before starting more">
            <TriangleAlert className="h-3 w-3" />
            Over WIP limit
          </span>
        )}
        <button onClick={onAdd} aria-label={`Add card to ${title}`} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3 pt-1">
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
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  members: Member[]
  customers: string[]
}) {
  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    const empty = !next.query && !next.assignees.length && !next.type && !next.customer && !next.blockedOnly
    setFilters(empty ? EMPTY : next)
  }
  const selectCls = 'rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder="Search cards…"
          aria-label="Search cards"
          className="w-60 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        {filters.query && (
          <button onClick={() => update({ query: '' })} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center -space-x-1" role="group" aria-label="Filter by assignee">
        {members.map((m) => {
          const on = filters.assignees.includes(m.id)
          return (
            <button
              key={m.id}
              onClick={() => update({ assignees: on ? filters.assignees.filter((x) => x !== m.id) : [...filters.assignees, m.id] })}
              aria-pressed={on}
              className={clsx('rounded-full transition', on ? 'z-10 scale-110 ring-2 ring-indigo-500' : filters.assignees.length ? 'opacity-40 hover:opacity-100' : 'hover:z-10 hover:-translate-y-0.5')}
            >
              <Avatar member={m} />
            </button>
          )
        })}
      </div>
      <select aria-label="Filter by type" className={selectCls} value={filters.type} onChange={(e) => update({ type: e.target.value as CardType | '' })}>
        <option value="">All types</option>
        {(Object.keys(TYPE_META) as CardType[]).map((t) => (
          <option key={t} value={t}>
            {TYPE_META[t].label}
          </option>
        ))}
      </select>
      <select aria-label="Filter by customer" className={selectCls} value={filters.customer} onChange={(e) => update({ customer: e.target.value })}>
        <option value="">All customers</option>
        {customers.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        onClick={() => update({ blockedOnly: !filters.blockedOnly })}
        aria-pressed={filters.blockedOnly}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm shadow-sm',
          filters.blockedOnly ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
        )}
      >
        <Ban className="h-3.5 w-3.5" />
        Blocked
      </button>
    </div>
  )
}
