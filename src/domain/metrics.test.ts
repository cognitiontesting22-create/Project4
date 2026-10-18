import { describe, expect, it } from 'vitest'
import type { Card, CardHistoryEntry, ColumnId } from './types'
import { isStale, medianCycleTimeDays, shippedInWindow } from './metrics'

const now = new Date('2026-10-20T12:00:00.000Z')

function makeCard(
  id: string,
  column: ColumnId,
  history: CardHistoryEntry[],
  archivedAt: string | null = null,
): Card {
  return {
    id,
    title: id,
    description: '',
    column,
    type: 'task',
    priority: 'medium',
    assigneeId: null,
    reporterId: '',
    customer: '',
    labels: [],
    dueDate: null,
    blocked: false,
    blockedReason: '',
    blockedBy: [],
    history,
    archivedAt,
    comments: [],
    checklist: [],
    requestId: null,
    createdAt: '',
    updatedAt: '',
  }
}

describe('delivery metrics', () => {
  it('selects cards shipped in the window and computes median cycle time', () => {
    const cardA = makeCard('A', 'done', [
      { column: 'todo', enteredAt: '2026-10-16T12:00:00.000Z' },
      { column: 'doing', enteredAt: '2026-10-17T12:00:00.000Z' },
      { column: 'done', enteredAt: '2026-10-19T12:00:00.000Z' },
    ])
    const cardB = makeCard('B', 'done', [
      { column: 'todo', enteredAt: '2026-10-12T12:00:00.000Z' },
      { column: 'doing', enteredAt: '2026-10-13T00:00:00.000Z' },
      { column: 'done', enteredAt: '2026-10-16T12:00:00.000Z' },
    ])
    const cardC = makeCard(
      'C',
      'done',
      [
        { column: 'todo', enteredAt: '2026-10-05T12:00:00.000Z' },
        { column: 'doing', enteredAt: '2026-10-06T12:00:00.000Z' },
        { column: 'done', enteredAt: '2026-10-13T12:00:00.000Z' },
      ],
      '2026-10-14T12:00:00.000Z',
    )
    const cardD = makeCard('D', 'done', [
      { column: 'todo', enteredAt: '2026-10-15T12:00:00.000Z' },
      { column: 'done', enteredAt: '2026-10-18T12:00:00.000Z' },
    ])
    const cardE = makeCard('E', 'done', [
      { column: 'todo', enteredAt: '2026-10-09T11:59:00.000Z' },
      { column: 'doing', enteredAt: '2026-10-10T11:59:00.000Z' },
      { column: 'done', enteredAt: '2026-10-13T11:59:00.000Z' },
    ])
    const currentlyDoing = makeCard('F', 'doing', [
      { column: 'todo', enteredAt: '2026-10-17T12:00:00.000Z' },
      { column: 'doing', enteredAt: '2026-10-18T12:00:00.000Z' },
      { column: 'done', enteredAt: '2026-10-19T12:00:00.000Z' },
      { column: 'doing', enteredAt: '2026-10-20T12:00:00.000Z' },
    ])
    const cards = [cardA, cardB, cardC, cardD, cardE, currentlyDoing]
    const shipped = shippedInWindow(cards, now)

    expect(shipped).toEqual([cardA, cardB, cardC, cardD])
    expect(medianCycleTimeDays(shipped)).toBe(3.5)
    expect(medianCycleTimeDays([cardA, cardB])).toBe(2.8)
    expect(medianCycleTimeDays([cardD])).toBeNull()
  })

  it('marks only unarchived Doing cards stale after the strict threshold', () => {
    const cardAt = (column: ColumnId, enteredAt: string, archivedAt: string | null = null) =>
      makeCard('stale', column, [{ column, enteredAt }], archivedAt)

    expect(isStale(cardAt('doing', '2026-10-15T11:59:00.000Z'), now, 5)).toBe(true)
    expect(isStale(cardAt('doing', '2026-10-15T12:00:00.000Z'), now, 5)).toBe(false)

    const reenteredDoing = makeCard('reentered', 'doing', [
      { column: 'doing', enteredAt: '2026-10-06T12:00:00.000Z' },
      { column: 'todo', enteredAt: '2026-10-19T12:00:00.000Z' },
      { column: 'doing', enteredAt: '2026-10-19T12:00:00.000Z' },
    ])
    expect(isStale(reenteredDoing, now, 5)).toBe(false)

    expect(isStale(cardAt('todo', '2026-09-01T12:00:00.000Z'), now, 5)).toBe(false)
    expect(isStale(cardAt('done', '2026-09-01T12:00:00.000Z'), now, 5)).toBe(false)
    expect(
      isStale(cardAt('doing', '2026-10-01T12:00:00.000Z', '2026-10-02T12:00:00.000Z'), now, 5),
    ).toBe(false)

    const fourDaysInDoing = cardAt('doing', '2026-10-16T12:00:00.000Z')
    expect(isStale(fourDaysInDoing, now, 5)).toBe(false)
    expect(isStale(fourDaysInDoing, now, 3)).toBe(true)
  })
})
