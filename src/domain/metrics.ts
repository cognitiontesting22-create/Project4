import { cycleTimeMs, DAY_MS, reachedDoneAt } from './history'
import type { Card } from './types'

export function shippedInWindow(cards: Card[], now: Date, days = 7): Card[] {
  return cards.filter((card) => {
    const doneAt = reachedDoneAt(card)
    return (
      card.column === 'done' &&
      doneAt !== null &&
      now.getTime() - Date.parse(doneAt) <= days * DAY_MS
    )
  })
}

export function medianCycleTimeDays(cards: Card[]): number | null {
  const durations = cards
    .map(cycleTimeMs)
    .filter((milliseconds): milliseconds is number => milliseconds !== null)
    .sort((a, b) => a - b)
  if (durations.length === 0) return null

  const middle = Math.floor(durations.length / 2)
  const medianMs =
    durations.length % 2 === 0
      ? (durations[middle - 1] + durations[middle]) / 2
      : durations[middle]
  return Math.round((medianMs / DAY_MS) * 10) / 10
}

export function isStale(card: Card, now: Date, staleAfterDays: number): boolean {
  const lastEntry = card.history.at(-1)
  return (
    card.archivedAt === null &&
    card.column === 'doing' &&
    lastEntry !== undefined &&
    now.getTime() - Date.parse(lastEntry.enteredAt) > staleAfterDays * DAY_MS
  )
}
