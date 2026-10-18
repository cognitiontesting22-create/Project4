import { describe, expect, it } from 'vitest'
import { createSeedData } from '../store/seed'
import type { Card } from './types'
import { archiveToastMessage, cardsToArchive } from './archive'

describe('card archiving helpers', () => {
  const base = createSeedData().cards[0]
  const makeCard = (patch: Partial<Card>): Card => ({ ...base, ...patch })

  it('selects only unarchived Done cards older than the latest Done entry threshold', () => {
    const cards = [
      makeCard({
        id: 'old',
        column: 'done',
        archivedAt: null,
        history: [
          { column: 'todo', enteredAt: '2026-09-01T00:00:00.000Z' },
          { column: 'done', enteredAt: '2026-10-05T11:59:00.000Z' },
        ],
      }),
      makeCard({
        id: 'boundary',
        column: 'done',
        archivedAt: null,
        history: [
          { column: 'todo', enteredAt: '2026-09-01T00:00:00.000Z' },
          { column: 'done', enteredAt: '2026-10-06T12:00:00.000Z' },
        ],
      }),
      makeCard({
        id: 'returned',
        column: 'done',
        archivedAt: null,
        history: [
          { column: 'todo', enteredAt: '2026-09-01T00:00:00.000Z' },
          { column: 'done', enteredAt: '2026-10-01T12:00:00.000Z' },
          { column: 'doing', enteredAt: '2026-10-10T12:00:00.000Z' },
          { column: 'done', enteredAt: '2026-10-15T12:00:00.000Z' },
        ],
      }),
      makeCard({
        id: 'doing',
        column: 'doing',
        archivedAt: null,
        history: [
          { column: 'todo', enteredAt: '2026-09-01T00:00:00.000Z' },
          { column: 'doing', enteredAt: '2026-10-01T00:00:00.000Z' },
        ],
      }),
      makeCard({
        id: 'already-archived',
        column: 'done',
        archivedAt: '2026-10-01T00:00:00.000Z',
        history: [
          { column: 'todo', enteredAt: '2026-09-01T00:00:00.000Z' },
          { column: 'done', enteredAt: '2026-09-02T00:00:00.000Z' },
        ],
      }),
    ]

    expect(
      cardsToArchive(cards, 14, new Date('2026-10-20T12:00:00.000Z')).map((card) => card.id),
    ).toEqual(['old'])
  })

  it('formats archive action toasts for zero, one, and multiple cards', () => {
    expect(archiveToastMessage(0, 14)).toBe('No Done cards older than 14 days.')
    expect(archiveToastMessage(1, 14)).toBe('Archived 1 card')
    expect(archiveToastMessage(3, 14)).toBe('Archived 3 cards')
  })
})
