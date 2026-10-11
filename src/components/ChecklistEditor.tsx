import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { Check, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import type { ChecklistItem } from '../domain/types'
import { uid } from '../domain/ids'
import { inputCls } from '../lib/meta'

interface Props {
  items: ChecklistItem[]
  onAdd: (text: string, item: ChecklistItem) => boolean
  onUpdate: (itemId: string, patch: { text?: string; done?: boolean }) => void
  onDelete: (itemId: string) => void
  onReorder: (itemId: string, toIndex: number) => void
}

export function ChecklistEditor({ items, onAdd, onUpdate, onDelete, onReorder }: Props) {
  const [newText, setNewText] = useState('')
  const newInputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const doneCount = items.filter((item) => item.done).length

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const toIndex = items.findIndex((item) => item.id === String(over.id))
    if (toIndex >= 0) onReorder(String(active.id), toIndex)
  }

  const addItem = () => {
    const trimmed = newText.trim()
    if (!trimmed) return
    if (onAdd(trimmed, { id: uid('check'), text: trimmed, done: false })) {
      setNewText('')
      requestAnimationFrame(() => newInputRef.current?.focus())
    }
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Checklist</h3>
        <span className="text-xs text-slate-500">{doneCount} of {items.length}</span>
      </div>
      {items.length > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              doneCount === items.length ? 'bg-emerald-500' : 'bg-indigo-400',
            )}
            style={{ width: `${(doneCount / items.length) * 100}%` }}
          />
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-1">
            {items.map((item, index) => (
              <ChecklistRow
                key={item.id}
                item={item}
                index={index}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onReorder={onReorder}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {items.length === 0 && <p className="mb-2 text-xs text-slate-400">No checklist items yet.</p>}
      <div className="mt-2 flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={newInputRef}
          className={`${inputCls} py-1.5`}
          value={newText}
          onChange={(event) => setNewText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addItem()
            }
          }}
          aria-label="Add a checklist item"
          placeholder="Add an item"
        />
      </div>
    </section>
  )
}

function ChecklistRow({
  item,
  index,
  onUpdate,
  onDelete,
  onReorder,
}: {
  item: ChecklistItem
  index: number
  onUpdate: Props['onUpdate']
  onDelete: Props['onDelete']
  onReorder: Props['onReorder']
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const cancelEdit = useRef(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const save = () => {
    if (cancelEdit.current) {
      cancelEdit.current = false
      return
    }
    const trimmed = text.trim()
    if (trimmed) onUpdate(item.id, { text: trimmed })
    else setText(item.text)
    cancelEdit.current = true
    setEditing(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const destination = index + (event.key === 'ArrowUp' ? -1 : 1)
      if (destination >= 0 && destination < document.querySelectorAll('[data-checklist-id]').length) {
        onReorder(item.id, destination)
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(`[data-checklist-id="${globalThis.CSS.escape(item.id)}"]`)?.focus()
        })
      }
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('rounded-lg border border-transparent bg-white', isDragging && 'opacity-40')}
    >
      <div
        data-checklist-id={item.id}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="group flex min-h-10 items-center gap-2 rounded-lg px-1 outline-none focus-visible:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-500/30"
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${item.text}`}
          className="cursor-grab touch-none text-slate-300 hover:text-slate-500"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <input
          type="checkbox"
          checked={item.done}
          onChange={(event) => onUpdate(item.id, { done: event.target.checked })}
          aria-label={`Mark ${item.text} ${item.done ? 'incomplete' : 'complete'}`}
          className="h-4 w-4 shrink-0 rounded border-slate-300 accent-indigo-600"
        />
        {editing ? (
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                save()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                cancelEdit.current = true
                setText(item.text)
                setEditing(false)
              }
            }}
            aria-label="Edit checklist item"
            className="min-w-0 flex-1 rounded border border-indigo-300 px-1.5 py-1 text-sm outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              cancelEdit.current = false
              setText(item.text)
              setEditing(true)
            }}
            className={clsx(
              'min-w-0 flex-1 truncate text-left text-sm',
              item.done ? 'text-slate-400 line-through' : 'text-slate-700',
            )}
          >
            {item.text}
          </button>
        )}
        {item.done && <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />}
        <button
          type="button"
          aria-label={`Delete ${item.text}`}
          onClick={() => onDelete(item.id)}
          className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  )
}
