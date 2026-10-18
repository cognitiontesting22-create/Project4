import { describe, expect, it } from 'vitest'
import type { Activity } from '../domain/types'
import { createSeedData } from '../store/seed'
import { isRelevantTo } from './inbox'

describe('inbox activity relevance', () => {
  it('shows archive and restore activity to assignees and reporters when another user acts', () => {
    const card = {
      ...createSeedData().cards[0],
      assigneeId: 'assignee',
      reporterId: 'reporter',
    }
    const activity: Activity = {
      id: 'activity-archive',
      kind: 'card_archived',
      actorId: 'actor',
      targetType: 'card',
      targetId: card.id,
      targetTitle: card.title,
      detail: 'archived the card',
      mentions: [],
      createdAt: '2026-10-20T12:00:00.000Z',
    }

    expect(isRelevantTo(activity, 'assignee', [card])).toBe(true)
    expect(isRelevantTo(activity, 'reporter', [card])).toBe(true)
    expect(isRelevantTo({ ...activity, kind: 'card_restored' }, 'assignee', [card])).toBe(true)
    expect(isRelevantTo({ ...activity, kind: 'card_restored' }, 'reporter', [card])).toBe(true)
    expect(isRelevantTo(activity, 'actor', [card])).toBe(false)
  })
})
