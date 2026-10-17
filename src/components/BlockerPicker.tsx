import clsx from 'clsx'
import { Check, Search, X } from 'lucide-react'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { blockerLinkReason } from '../domain/dependencies'
import { COLUMNS, type Card } from '../domain/types'

interface Props {
  cardId: string | null
  cards: Card[]
  value: string[]
  onChange: (blockedBy: string[]) => void
  onRefuse: (reason: string) => void
}

const columnTitle = (card: Card) => COLUMNS.find((column) => column.id === card.column)?.title ?? card.column

export function BlockerPicker({ cardId, cards, value, onChange, onRefuse }: Props) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const selected = value.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card))
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return cards
      .filter((card) => card.id !== cardId && !value.includes(card.id))
      .filter((card) => !needle || card.title.toLocaleLowerCase().includes(needle))
      .slice(0, 8)
  }, [cards, cardId, value, query])

  const pick = (card: Card) => {
    const reason = cardId ? blockerLinkReason(cards, cardId, card.id) : null
    if (reason) {
      setError(reason)
      onRefuse(reason)
      return
    }
    setError(null)
    onChange([...value, card.id])
    setQuery('')
    setActive(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => (matches.length ? (index + delta + matches.length) % matches.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const card = matches[active]
      if (open && card) pick(card)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (event.key === 'Backspace' && !query && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Blocked by">
          {selected.map((card) => {
            const done = card.column === 'done'
            return (
              <li
                key={card.id}
                className={clsx(
                  'inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                  done ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800',
                )}
              >
                {done && <Check className="h-3 w-3 shrink-0" />}
                <span className="truncate">{card.title}</span>
                <span className={clsx('shrink-0', done ? 'text-emerald-600' : 'text-rose-500')}>
                  · {columnTitle(card)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove blocker ${card.title}`}
                  className="rounded opacity-60 hover:opacity-100"
                  onClick={() => {
                    setError(null)
                    onChange(value.filter((id) => id !== card.id))
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-label="Add blocker"
          aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          placeholder="Search cards by title…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {open && matches.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {matches.map((card, index) => (
              <li
                key={card.id}
                id={`${listId}-${card.id}`}
                role="option"
                aria-selected={index === active}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                  index === active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700',
                )}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(card)
                }}
              >
                <span className="flex-1 truncate">{card.title}</span>
                <span className="shrink-0 text-xs text-slate-400">{columnTitle(card)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  )
}
