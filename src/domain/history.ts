import type { Card, CardHistoryEntry, ColumnId } from './types'

export const DAY_MS = 86_400_000

const round1 = (n: number) => Math.round(n * 10) / 10

export function cycleTimeMs(card: Pick<Card, 'column' | 'history'>): number | null {
  if (card.column !== 'done') return null
  const firstDoingEntry = card.history.find((entry) => entry.column === 'doing')
  const lastDoneEntry = [...card.history].reverse().find((entry) => entry.column === 'done')
  if (!firstDoingEntry || !lastDoneEntry) return null
  return Date.parse(lastDoneEntry.enteredAt) - Date.parse(firstDoingEntry.enteredAt)
}

export function cycleTimeDays(card: Pick<Card, 'column' | 'history'>): number | null {
  const milliseconds = cycleTimeMs(card)
  return milliseconds === null ? null : round1(milliseconds / DAY_MS)
}

export function timeInColumnDays(card: Pick<Card, 'history'>, now: Date): number {
  const lastEntry = card.history.at(-1)
  return lastEntry ? round1((now.getTime() - Date.parse(lastEntry.enteredAt)) / DAY_MS) : 0
}

export function reachedDoneAt(card: Pick<Card, 'column' | 'history'>): string | null {
  if (card.column !== 'done') return null
  return [...card.history].reverse().find((entry) => entry.column === 'done')?.enteredAt ?? null
}

export function formatDays(n: number): string {
  return `${round1(n).toFixed(1)} days`
}

export function backfillHistory(
  card: Pick<Card, 'column' | 'updatedAt'>,
): CardHistoryEntry[] {
  return [{ column: card.column, enteredAt: card.updatedAt }]
}

export function isValidHistory(value: unknown, column: ColumnId): value is CardHistoryEntry[] {
  if (!Array.isArray(value) || value.length === 0) return false
  return (
    value.every((entry: unknown) =>
      isRecord(entry) &&
      isColumnId(entry.column) &&
      typeof entry.enteredAt === 'string',
    ) &&
    (value[value.length - 1] as CardHistoryEntry).column === column
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isColumnId(value: unknown): value is ColumnId {
  return value === 'todo' || value === 'doing' || value === 'done'
}
