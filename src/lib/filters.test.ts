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
  history: [{ column: 'todo', enteredAt: '' }],
  archivedAt: null,
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

  it('excludes archived cards before empty, query, and blocked-only filters', () => {
    const cards = [
      { ...card('active', []), title: 'Retry live task', blocked: true },
      { ...card('archived', []), title: 'Retry archived task', blocked: true, archivedAt: '2026-10-01T00:00:00.000Z' },
    ]

    expect(filterCards(cards, emptyFilters).map((item) => item.id)).toEqual(['active'])
    expect(filterCards(cards, { ...emptyFilters, query: 'retry' }).map((item) => item.id))
      .toEqual(['active'])
    expect(filterCards(cards, { ...emptyFilters, blockedOnly: true }).map((item) => item.id))
      .toEqual(['active'])
  })

  it('trims, lowercases, removes empty labels, and deduplicates while preserving order', () => {
    expect(normalizeLabels([' API ', '', 'infra', 'api', '  Product  '])).toEqual([
      'api',
      'infra',
      'product',
    ])
  })
})
