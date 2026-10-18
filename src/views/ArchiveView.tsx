import { ArchiveRestore } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cycleTimeDays, formatDays } from '../domain/history'
import { archivedCards } from '../lib/filters'
import { btnSecondary, inputCls } from '../lib/meta'
import { useToastStore } from '../lib/toast'
import { undoWithToast } from '../lib/undo'
import { useAppStore } from '../store/useAppStore'

export function ArchiveView() {
  const cards = useAppStore((state) => state.cards)
  const restoreCard = useAppStore((state) => state.restoreCard)
  const showToast = useToastStore((state) => state.showToast)
  const [query, setQuery] = useState('')
  const list = useMemo(() => archivedCards(cards, query), [cards, query])
  const hasArchivedCards = cards.some((card) => card.archivedAt !== null)

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-8 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Archive</h1>
        <p className="mt-1 text-sm text-slate-500">Completed cards removed from the board.</p>
      </header>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <input
            aria-label="Search archive"
            placeholder="Search archived cards by title…"
            className={inputCls}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {!hasArchivedCards ? (
            <p className="py-12 text-center text-sm text-slate-400">No archived cards.</p>
          ) : list.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              No archived cards match your search.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {list.map((card) => {
                const days = cycleTimeDays(card)
                const archivedAt = card.archivedAt!
                return (
                  <li key={card.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{card.title}</div>
                      <p className="mt-1 text-xs text-slate-500">
                        Archived{' '}
                        {new Date(archivedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                        {days !== null && <> · Cycle time {formatDays(days)}</>}
                      </p>
                    </div>
                    <button
                      className={btnSecondary}
                      aria-label={`Restore ${card.title}`}
                      onClick={() => {
                        const result = restoreCard(card.id)
                        if (result.ok) {
                          showToast({
                            message: `Restored '${card.title}' to Done`,
                            variant: 'info',
                            action: { label: 'Undo', onClick: undoWithToast },
                          })
                        } else {
                          showToast({ message: result.reason, variant: 'error' })
                        }
                      }}
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      Restore
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
