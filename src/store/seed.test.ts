import { describe, expect, it } from 'vitest'
import { votesUsed } from '../domain/scoring'
import { createSeedData } from './seed'

describe('createSeedData', () => {
  it('starts at the default Doing WIP limit', () => {
    const data = createSeedData()

    expect(data.settings.doingWipLimit).toBe(3)
    expect(data.settings.archiveAfterDays).toBe(14)
    expect(data.cards.every((card) => card.archivedAt === null)).toBe(true)
    expect(data.columnOrder.doing).toHaveLength(3)
  })

  it('keeps member votes within the shared budget and per-request cap', () => {
    const data = createSeedData()

    for (const member of data.members) {
      expect(votesUsed(data.requests, member.id)).toBeLessThanOrEqual(
        data.settings.voteBudget,
      )
    }

    for (const request of data.requests) {
      for (const points of Object.values(request.votes)) {
        expect(points).toBeGreaterThanOrEqual(0)
        expect(points).toBeLessThanOrEqual(data.settings.maxVotesPerRequest)
      }
    }
  })

  it('places each card exactly once in the column order matching its column', () => {
    const data = createSeedData()
    const orderedCards = Object.entries(data.columnOrder).flatMap(([column, ids]) =>
      ids.map((id) => ({ id, column })),
    )

    expect(orderedCards).toHaveLength(data.cards.length)
    for (const card of data.cards) {
      const placements = orderedCards.filter((item) => item.id === card.id)
      expect(placements).toHaveLength(1)
      expect(placements[0].column).toBe(card.column)
    }
  })

  it('keeps request and card links bidirectional', () => {
    const data = createSeedData()

    for (const request of data.requests) {
      if (request.cardId === null) continue
      const card = data.cards.find((item) => item.id === request.cardId)
      expect(card).toBeDefined()
      expect(card?.requestId).toBe(request.id)
    }

    for (const card of data.cards) {
      if (card.requestId === null) continue
      const request = data.requests.find((item) => item.id === card.requestId)
      expect(request?.cardId).toBe(card.id)
    }
  })

  it('uses member ids for activity actors and comment authors', () => {
    const data = createSeedData()
    const memberIds = new Set(data.members.map((member) => member.id))
    const comments = [
      ...data.cards.flatMap((card) => card.comments),
      ...data.requests.flatMap((request) => request.comments),
    ]

    for (const activity of data.activity) {
      expect(memberIds.has(activity.actorId)).toBe(true)
    }
    for (const comment of comments) {
      expect(memberIds.has(comment.authorId)).toBe(true)
    }
  })

  it('keeps fully complete checklists only on Done cards', () => {
    const data = createSeedData()

    expect(data.cards.find((card) => card.id === 'card-105')?.checklist.filter((item) => item.done))
      .toHaveLength(2)
    expect(data.cards.find((card) => card.id === 'card-109')?.checklist).toHaveLength(3)
    for (const card of data.cards.filter((item) => item.column !== 'done')) {
      expect(card.checklist.length > 0 && card.checklist.every((item) => item.done)).toBe(false)
    }
  })
})
