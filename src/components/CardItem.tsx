import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { Ban, Building, Calendar, Check, Link2, MessageSquare } from 'lucide-react'
import type { Card, Member } from '../domain/types'
import { descriptionSnippet, highlight } from '../lib/highlight'
import { dueState, formatDue, PRIORITY_META, TYPE_META } from '../lib/meta'
import { Avatar } from './Avatar'

interface Props {
  card: Card
  assignee?: Member
  onOpen?: () => void
  onLabelFilter?: (label: string) => void
  onCardKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  overlay?: boolean
  query?: string
  blockers?: Pick<Card, 'id' | 'title'>[]
}

export function CardView({ card, assignee, onOpen, onLabelFilter, overlay, query = '', blockers = [] }: Props) {
  const type = TYPE_META[card.type]
  const TypeIcon = type.icon
  const due = card.column === 'done' ? null : dueState(card.dueDate)
  return (
    <div
      onClick={onOpen}
      className={clsx(
        'group relative cursor-grab rounded-xl border bg-white p-3.5 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing',
        card.type === 'escalation' ? 'border-orange-200' : 'border-slate-200',
        overlay && 'rotate-2 shadow-xl ring-2 ring-indigo-500/40',
        card.column === 'done' && 'opacity-80',
      )}
    >
      {card.type === 'escalation' && <span className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-orange-400" />}
      <div className="mb-2 flex items-center gap-2">
        <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', type.className)}>
          <TypeIcon className="h-3 w-3" />
          {type.label}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500" title={`${PRIORITY_META[card.priority].label} priority`}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', PRIORITY_META[card.priority].dot)} />
          {PRIORITY_META[card.priority].label}
        </span>
        {(card.blocked || blockers.length > 0) && (
          <span
            title={[
              blockers.length ? `Blocked by ${blockers.map((blocker) => `'${blocker.title}'`).join(', ')}` : '',
              card.blocked ? card.blockedReason : '',
            ].filter(Boolean).join('\n') || 'Blocked'}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
            <Ban className="h-3 w-3" />
            Blocked
          </span>
        )}
      </div>
      <p className={clsx('text-sm font-medium leading-snug text-slate-900', card.column === 'done' && 'text-slate-500 line-through decoration-slate-300')}>
        {highlight(card.title, query)}
      </p>
      {query.trim() &&
        !card.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
        card.description.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (
          <p className="mt-1 truncate text-xs leading-snug text-slate-500">
            {highlight(descriptionSnippet(card.description, query), query)}
          </p>
        )}
      {card.checklist.length > 0 && (
        <div className="mt-2.5">
          <div
            className={clsx(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
              card.checklist.every((item) => item.done)
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-600',
            )}
            aria-label={`${card.checklist.filter((item) => item.done).length} of ${card.checklist.length} checklist items complete`}
          >
            <Check className="h-3 w-3" />
            {card.checklist.filter((item) => item.done).length}/{card.checklist.length}
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={clsx(
                'h-full rounded-full transition-all',
                card.checklist.every((item) => item.done) ? 'bg-emerald-500' : 'bg-indigo-400',
              )}
              style={{
                width: `${(card.checklist.filter((item) => item.done).length / card.checklist.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
      {(card.customer || card.labels.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.customer && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              <Building className="h-3 w-3" />
              {card.customer}
            </span>
          )}
          {card.labels.map((l) => (
            onLabelFilter ? (
              <button
                key={l}
                type="button"
                title="Filter by label"
                className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onLabelFilter(l)
                }}
              >
                {l}
              </button>
            ) : (
              <span key={l} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {l}
              </span>
            )
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
        {card.dueDate && (
          <span
            className={clsx(
              'inline-flex items-center gap-1',
              due === 'overdue' && 'font-semibold text-rose-600',
              due === 'soon' && 'font-medium text-amber-600',
            )}
          >
            <Calendar className="h-3 w-3" />
            {formatDue(card.dueDate)}
          </span>
        )}
        {card.comments.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {card.comments.length}
          </span>
        )}
        {card.requestId && (
          <span className="inline-flex items-center gap-1 text-indigo-600" title="Linked feature request">
            <Link2 className="h-3 w-3" />
            Request
          </span>
        )}
        <Avatar member={assignee} size="xs" className="ml-auto" />
      </div>
    </div>
  )
}

export function SortableCard(props: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.card.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-card-id={props.card.id}
      className={clsx('outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2', isDragging && 'opacity-40')}
      aria-label={props.card.title}
      {...attributes}
      {...listeners}
      onKeyDown={(event) => {
        props.onCardKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === 'Enter') {
          event.preventDefault()
          props.onOpen?.()
        }
        listeners?.onKeyDown?.(event)
      }}
    >
      <CardView {...props} />
    </div>
  )
}
