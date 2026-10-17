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
  blockedBy: [],
  comments: [],
  checklist: [],
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
  it('matches titles and descriptions case-insensitively after trimming the query only', () => {
    const cards = [
      { ...card('one', []), title: 'Fix SSO' },
      { ...card('two', []), description: 'Add retry handling' },
      { ...card('three', ['retry']), customer: 'Retry Logistics' },
      { ...card('four', []), blockedReason: 'Retry the deployment' },
    ]

    expect(filterCards(cards, { ...emptyFilters, query: '  sSo ' }).map((item) => item.id)).toEqual(['one'])
    expect(filterCards(cards, { ...emptyFilters, query: 'RETRY' }).map((item) => item.id)).toEqual(['two'])
  })

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
