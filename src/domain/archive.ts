import { DAY_MS, reachedDoneAt } from './history'
import type { Card } from './types'

export function cardsToArchive(cards: Card[], archiveAfterDays: number, now: Date): Card[] {
  return cards.filter((card) => {
    const doneAt = reachedDoneAt(card)
    return (
      card.archivedAt === null &&
      card.column === 'done' &&
      doneAt !== null &&
      now.getTime() - Date.parse(doneAt) > archiveAfterDays * DAY_MS
    )
  })
}

export function archiveToastMessage(n: number, days: number): string {
  if (n === 0) return `No Done cards older than ${days} days.`
  if (n === 1) return 'Archived 1 card'
  return `Archived ${n} cards`
}
