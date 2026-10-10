import type { Activity, Card } from '../domain/types'

export function isRelevantTo(a: Activity, memberId: string, cards: Card[]): boolean {
  if (a.actorId === memberId) return false
  if (a.mentions.includes(memberId)) return true
  if (a.targetType === 'card') {
    const card = cards.find((c) => c.id === a.targetId)
    return !!card && (card.assigneeId === memberId || card.reporterId === memberId)
  }
  return false
}
