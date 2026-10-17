import type { Card, ColumnId } from './types'

type CardLookup = Pick<Card, 'id' | 'title' | 'column' | 'blockedBy'>

const COLUMN_TITLES: Record<ColumnId, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
}

export function openBlockers<T extends CardLookup>(cards: T[], blockedBy: string[]): T[] {
  const byId = new Map(cards.map((card) => [card.id, card]))
  return blockedBy
    .map((id) => byId.get(id))
    .filter((card): card is T => Boolean(card && card.column !== 'done'))
}

export function isDependencyBlocked(cards: CardLookup[], card: Pick<Card, 'blockedBy'>): boolean {
  return openBlockers(cards, card.blockedBy).length > 0
}

export function dependencyBlockReason(cards: CardLookup[], blockedBy: string[]): string | null {
  const blockers = openBlockers(cards, blockedBy)
  if (!blockers.length) return null
  const names = blockers.map((card) => `'${card.title}' (${COLUMN_TITLES[card.column]})`)
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Blocked by ${list}. Move ${blockers.length === 1 ? 'it' : 'them'} to Done first.`
}

export function normalizeBlockedBy(
  blockedBy: string[],
  cardId: string,
  knownIds: Set<string>,
): string[] {
  return [...new Set(blockedBy)].filter((id) => id !== cardId && knownIds.has(id))
}

/** Path from `blockerId` to `cardId` following blockedBy links, or null when none exists. */
function dependencyPath(cards: CardLookup[], blockerId: string, cardId: string): string[] | null {
  const byId = new Map(cards.map((card) => [card.id, card]))
  const previous = new Map<string, string | null>([[blockerId, null]])
  const queue = [blockerId]
  while (queue.length) {
    const id = queue.shift()!
    if (id === cardId) {
      const path: string[] = []
      for (let step: string | null = id; step !== null; step = previous.get(step) ?? null) {
        path.unshift(step)
      }
      return path
    }
    for (const next of byId.get(id)?.blockedBy ?? []) {
      if (previous.has(next)) continue
      previous.set(next, id)
      queue.push(next)
    }
  }
  return null
}

export function blockerLinkReason(
  cards: CardLookup[],
  cardId: string,
  blockerId: string,
): string | null {
  if (blockerId === cardId) return "A card can't block itself."
  const byId = new Map(cards.map((card) => [card.id, card]))
  const blocker = byId.get(blockerId)
  if (!blocker) return 'That card no longer exists.'
  const path = dependencyPath(cards, blockerId, cardId)
  if (!path) return null
  const title = (id: string) => `'${byId.get(id)?.title ?? id}'`
  const via = path.slice(1, -1).map(title)
  const target = byId.get(cardId)?.title ?? 'this card'
  return `Can't add ${title(blockerId)} as a blocker: it is already blocked by '${target}'${
    via.length ? ` through ${via.join(' → ')}` : ''
  }, so this would create a cycle.`
}
