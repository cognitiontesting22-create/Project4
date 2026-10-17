import { isDependencyBlocked } from '../domain/dependencies'
import type { Card, CardType } from '../domain/types'

export interface BoardFilters {
  query: string
  assigneeIds: string[]
  type: CardType | ''
  customer: string
  blockedOnly: boolean
  labels: string[]
}

export function filterCards(cards: Card[], filters: BoardFilters): Card[] {
  const query = filters.query.trim().toLocaleLowerCase()
  const labels = normalizeLabels(filters.labels)

  return cards.filter((card) => {
    if (
      query &&
      !`${card.title} ${card.description}`.toLocaleLowerCase().includes(query)
    ) {
      return false
    }
    if (filters.assigneeIds.length && (!card.assigneeId || !filters.assigneeIds.includes(card.assigneeId))) {
      return false
    }
    if (filters.type && card.type !== filters.type) return false
    if (filters.customer && card.customer !== filters.customer) return false
    if (filters.blockedOnly && !card.blocked && !isDependencyBlocked(cards, card)) return false
    if (labels.length && !card.labels.some((label) => labels.includes(label.trim().toLowerCase()))) {
      return false
    }
    return true
  })
}

export function normalizeLabels(list: string[]): string[] {
  const labels = new Set<string>()
  for (const value of list) {
    const label = value.trim().toLowerCase()
    if (label) labels.add(label)
  }
  return [...labels]
}
