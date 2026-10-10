import { describe, expect, it } from 'vitest'
import type { Card } from '../domain/types'
import { filterCards, normalizeLabels, type BoardFilters } from './filters'

const card = (id: string, labels: string[]): Card => ({
  id,
  title: id,
  description: '',
  column: 'todo',
  type: 'task',
  priority: 'medium',
  assigneeId: null,
  reporterId: '',
  customer: '',
  labels,
  dueDate: null,
  blocked: false,
  blockedReason: '',
  comments: [],
  requestId: null,
  createdAt: '',
  updatedAt: '',
})

const emptyFilters: BoardFilters = {
  query: '',
  assigneeIds: [],
  type: '',
  customer: '',
  blockedOnly: false,
  labels: [],
}

describe('board filters', () => {
  it('matches any selected label without case sensitivity', () => {
    const cards = [card('one', ['API']), card('two', ['onboarding']), card('three', ['infra'])]

    expect(filterCards(cards, { ...emptyFilters, labels: ['aPi', 'INFRA'] }).map((item) => item.id))
      .toEqual(['one', 'three'])
  })

  it('trims, lowercases, removes empty labels, and deduplicates while preserving order', () => {
    expect(normalizeLabels([' API ', '', 'infra', 'api', '  Product  '])).toEqual([
      'api',
      'infra',
      'product',
    ])
  })
})
