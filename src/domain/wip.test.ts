import { describe, expect, it } from 'vitest'
import { createSeedData } from '../store/seed'
import { wipBlockReason } from './wip'

describe('WIP limits', () => {
  it('does not count archived Doing cards', () => {
    const data = createSeedData()
    data.settings.doingWipLimit = 3
    const doingId = data.cards.find((card) => card.column === 'doing')!.id
    data.cards = data.cards.map((card) =>
      card.id === doingId ? { ...card, archivedAt: '2026-10-01T00:00:00.000Z' } : card,
    )

    expect(wipBlockReason(data, null)).toBeNull()
  })
})
