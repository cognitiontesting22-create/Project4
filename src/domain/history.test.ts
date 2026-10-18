import { describe, expect, it } from 'vitest'
import type { Card } from './types'
import {
  DAY_MS,
  backfillHistory,
  cycleTimeDays,
  cycleTimeMs,
  formatDays,
  isValidHistory,
  reachedDoneAt,
  timeInColumnDays,
} from './history'

describe('card history', () => {
  const history = [
    { column: 'todo', enteredAt: '2026-10-01T09:00:00.000Z' },
    { column: 'doing', enteredAt: '2026-10-02T09:00:00.000Z' },
    { column: 'done', enteredAt: '2026-10-05T21:00:00.000Z' },
  ] satisfies Card['history']

  it('calculates cycle time, time in column, and the latest Done time', () => {
    const card = { column: 'done', history } satisfies Pick<Card, 'column' | 'history'>

    expect(cycleTimeDays(card)).toBe(3.5)
    expect(cycleTimeMs(card)).toBe(3.5 * DAY_MS)
    expect(reachedDoneAt(card)).toBe('2026-10-05T21:00:00.000Z')
    expect(timeInColumnDays(card, new Date('2026-10-06T09:00:00.000Z'))).toBe(0.5)
  })

  it('calculates cycle time from the first Doing entry through the latest Done entry', () => {
    const doingCard = {
      column: 'doing',
      history: [...history, { column: 'doing', enteredAt: '2026-10-07T09:00:00.000Z' }],
    } satisfies Pick<Card, 'column' | 'history'>
    expect(cycleTimeDays(doingCard)).toBeNull()
    expect(reachedDoneAt(doingCard)).toBeNull()

    const doneAgain = {
      column: 'done',
      history: [...doingCard.history, { column: 'done', enteredAt: '2026-10-08T09:00:00.000Z' }],
    } satisfies Pick<Card, 'column' | 'history'>
    expect(cycleTimeDays(doneAgain)).toBe(6)
    expect(reachedDoneAt(doneAgain)).toBe('2026-10-08T09:00:00.000Z')
  })

  it('returns no cycle time for a card moved directly from To do to Done', () => {
    expect(
      cycleTimeDays({
        column: 'done',
        history: [
          { column: 'todo', enteredAt: '2026-10-01T09:00:00.000Z' },
          { column: 'done', enteredAt: '2026-10-02T09:00:00.000Z' },
        ],
      }),
    ).toBeNull()
  })

  it('formats days to one decimal place', () => {
    expect(formatDays(3.5)).toBe('3.5 days')
    expect(formatDays(1)).toBe('1.0 days')
    expect(formatDays(0)).toBe('0.0 days')
  })

  it('backfills legacy history and validates the current-column invariant', () => {
    const createdAt = '2026-10-01T09:00:00.000Z'
    const updatedAt = '2026-10-02T09:00:00.000Z'
    expect(backfillHistory({ column: 'todo', createdAt, updatedAt }))
      .toEqual([{ column: 'todo', enteredAt: createdAt }])
    expect(backfillHistory({ column: 'doing', createdAt, updatedAt })).toEqual([
      { column: 'todo', enteredAt: createdAt },
      { column: 'doing', enteredAt: updatedAt },
    ])
    expect(backfillHistory({ column: 'done', createdAt, updatedAt })).toEqual([
      { column: 'todo', enteredAt: createdAt },
      { column: 'done', enteredAt: updatedAt },
    ])
    expect(isValidHistory(history, 'done')).toBe(true)
    expect(isValidHistory([], 'todo')).toBe(false)
    expect(isValidHistory([{ column: 'later', enteredAt: createdAt }], 'todo')).toBe(false)
    expect(isValidHistory([{ column: 'doing', enteredAt: createdAt }], 'todo')).toBe(false)
    expect(isValidHistory([{ column: 'todo', enteredAt: 'not a date' }], 'todo')).toBe(false)
  })
})
