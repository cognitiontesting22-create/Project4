import type { AppData } from './types'

export function wipBlockReason(
  data: Pick<AppData, 'cards' | 'settings'>,
  cardId: string | null,
): string | null {
  const limit = data.settings.doingWipLimit
  if (limit <= 0) return null

  const doingCards = data.cards.filter((card) => card.column === 'doing' && !card.archivedAt)
  if (cardId && doingCards.some((card) => card.id === cardId)) return null

  const otherDoingCount = doingCards.filter((card) => card.id !== cardId).length
  if (otherDoingCount < limit) return null

  return `Doing is at its WIP limit (${otherDoingCount}/${limit}). Finish or move a card out of Doing first.`
}
