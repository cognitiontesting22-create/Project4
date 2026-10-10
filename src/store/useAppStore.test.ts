import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedData } from './seed'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
})

const { useAppStore } = await import('./useAppStore')

beforeEach(() => {
  localStorage.clear()
  useAppStore.setState(
    { ...useAppStore.getInitialState(), ...createSeedData() },
    true,
  )
})

describe('useAppStore', () => {
  it('reorders cards within and across columns', () => {
    useAppStore.getState().moveCard('card-101', 'todo', 2)
    expect(useAppStore.getState().columnOrder.todo).toEqual([
      'card-102',
      'card-103',
      'card-101',
      'card-104',
      'card-108',
    ])

    useAppStore.getState().moveCard('card-101', 'done', 1)
    expect(useAppStore.getState().columnOrder.todo).not.toContain('card-101')
    expect(useAppStore.getState().columnOrder.done).toEqual(['card-109', 'card-101', 'card-110'])
  })

  it('rejects moves into a full Doing column without changing data or history', () => {
    const store = useAppStore.getState()
    const before = store.exportData()

    expect(store.moveCard('card-101', 'doing', 0)).toEqual({
      ok: false,
      reason: 'Doing is at its WIP limit (3/3). Finish or move a card out of Doing first.',
    })
    expect(useAppStore.getState().exportData()).toBe(before)
    expect(useAppStore.getState().past).toHaveLength(0)
  })

  it('allows reordering a card already in Doing at the limit', () => {
    expect(useAppStore.getState().moveCard('card-105', 'doing', 2)).toEqual({ ok: true })
    expect(useAppStore.getState().columnOrder.doing).toEqual([
      'card-106',
      'card-107',
      'card-105',
    ])
  })

  it('blocks addCard and updateCard into Doing when full', () => {
    const store = useAppStore.getState()
    const before = store.exportData()
    const expected = {
      ok: false,
      reason: 'Doing is at its WIP limit (3/3). Finish or move a card out of Doing first.',
    }

    expect(store.addCard({ title: 'Blocked card', column: 'doing' })).toEqual(expected)
    expect(store.updateCard('card-101', { column: 'doing' })).toEqual(expected)
    expect(useAppStore.getState().exportData()).toBe(before)
    expect(useAppStore.getState().past).toHaveLength(0)
  })

  it('treats a zero Doing WIP limit as unlimited', () => {
    useAppStore.getState().updateSettings({ doingWipLimit: 0 })

    expect(useAppStore.getState().addCard({ title: 'No limit', column: 'doing' })).toEqual({
      ok: true,
    })
    expect(useAppStore.getState().columnOrder.doing).toHaveLength(4)
  })

  it('normalizes labels when adding and updating cards', () => {
    const result = useAppStore.getState().addCard({
      title: 'Labelled',
      column: 'todo',
      labels: [' API ', 'infra', 'api', ''],
    })
    expect(result).toEqual({ ok: true })
    const added = useAppStore.getState().cards.find((card) => card.title === 'Labelled')
    expect(added?.labels).toEqual(['api', 'infra'])

    useAppStore.getState().updateCard('card-101', { labels: [' Infra ', 'API', 'infra'] })
    expect(useAppStore.getState().cards.find((card) => card.id === 'card-101')?.labels)
      .toEqual(['infra', 'api'])
  })

  it('ships a linked request when its card is done and replans it when moved out', () => {
    const { moveCard } = useAppStore.getState()
    moveCard('card-104', 'done', 0)
    expect(useAppStore.getState().requests.find((item) => item.id === 'request-201')?.status)
      .toBe('shipped')

    moveCard('card-104', 'todo', 0)
    expect(useAppStore.getState().requests.find((item) => item.id === 'request-201')?.status)
      .toBe('planned')
  })

  it('rejects votes over the member budget or per-request limit', () => {
    const store = useAppStore.getState()
    expect(store.setVote('request-203', 2)).toEqual({
      ok: false,
      reason: 'Your vote budget is 10 points.',
    })
    expect(store.setVote('request-203', 6)).toEqual({
      ok: false,
      reason: 'You can spend at most 5 votes on one request.',
    })
  })

  it('promotes a request once and returns the existing card id thereafter', () => {
    const { addRequest, promoteRequest } = useAppStore.getState()
    const requestId = addRequest({ title: 'Export agent traces', problem: 'Debug runs.' })
    const cardId = promoteRequest(requestId)
    const secondCardId = useAppStore.getState().promoteRequest(requestId)

    expect(secondCardId).toBe(cardId)
    expect(useAppStore.getState().cards.filter((card) => card.requestId === requestId))
      .toHaveLength(1)
    expect(useAppStore.getState().requests.find((item) => item.id === requestId)).toMatchObject({
      status: 'planned',
      cardId,
    })
  })

  it('reopens a planned request when its linked card is deleted', () => {
    useAppStore.getState().deleteCard('card-104')
    expect(useAppStore.getState().requests.find((item) => item.id === 'request-201')).toMatchObject({
      status: 'open',
      cardId: null,
    })
  })

  it('rejects malformed imports without mutating current data', () => {
    const before = useAppStore.getState().exportData()
    expect(useAppStore.getState().importData('{invalid')).toEqual({
      ok: false,
      reason: 'Invalid JSON.',
    })
    expect(useAppStore.getState().exportData()).toBe(before)
  })

  it('caps activity at 200 entries', () => {
    for (let index = 0; index < 205; index += 1) {
      useAppStore.getState().addCard({
        title: `Generated card ${index}`,
        column: 'todo',
      })
    }

    const { activity } = useAppStore.getState()
    expect(activity).toHaveLength(200)
    expect(activity[0].targetTitle).toBe('Generated card 204')
  })

  it('undoes and redoes a linked card move with its request status', () => {
    const { moveCard } = useAppStore.getState()
    const originalOrder = [...useAppStore.getState().columnOrder.todo]

    moveCard('card-104', 'done', 0)
    expect(useAppStore.getState().requests.find((item) => item.id === 'request-201')?.status)
      .toBe('shipped')

    expect(useAppStore.getState().undo()).toBe("Move 'Ship role-aware workspace settings' to Done")
    expect(useAppStore.getState().columnOrder.todo).toEqual(originalOrder)
    expect(useAppStore.getState().requests.find((item) => item.id === 'request-201')?.status)
      .toBe('planned')

    expect(useAppStore.getState().redo()).toBe("Move 'Ship role-aware workspace settings' to Done")
    expect(useAppStore.getState().requests.find((item) => item.id === 'request-201')?.status)
      .toBe('shipped')
  })

  it('restores a deleted card on undo', () => {
    const original = useAppStore.getState().cards.find((card) => card.id === 'card-104')
    useAppStore.getState().deleteCard('card-104')

    expect(useAppStore.getState().cards.some((card) => card.id === 'card-104')).toBe(false)
    expect(useAppStore.getState().undo()).toBe("Delete 'Ship role-aware workspace settings'")
    expect(useAppStore.getState().cards.find((card) => card.id === 'card-104')).toEqual(original)
  })

  it('clears redo history after a new action', () => {
    useAppStore.getState().addCard({ title: 'Temporary', column: 'todo' })
    useAppStore.getState().undo()
    expect(useAppStore.getState().future).toHaveLength(1)

    useAppStore.getState().addRequest({ title: 'New action' })
    expect(useAppStore.getState().future).toHaveLength(0)
    expect(useAppStore.getState().redo()).toBeNull()
  })

  it('does not record rejected WIP moves in history', () => {
    useAppStore.getState().moveCard('card-101', 'doing', 0)

    expect(useAppStore.getState().past).toHaveLength(0)
    expect(useAppStore.getState().undo()).toBeNull()
  })

  it('does not include current-user or inbox-seen changes in undo history', () => {
    useAppStore.getState().setCurrentUser('mara')
    useAppStore.getState().markInboxSeen()

    expect(useAppStore.getState().past).toHaveLength(0)
    expect(useAppStore.getState().undo()).toBeNull()
    expect(useAppStore.getState().currentUserId).toBe('mara')
  })

  it('caps undo history at 100 entries', () => {
    for (let index = 0; index < 101; index += 1) {
      useAppStore.getState().addCard({ title: `History ${index}`, column: 'todo' })
    }

    expect(useAppStore.getState().past).toHaveLength(100)
  })

  it('coalesces settings updates within one second', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
    try {
      useAppStore.getState().updateSettings({ doingWipLimit: 2 })
      vi.advanceTimersByTime(500)
      useAppStore.getState().updateSettings({ voteBudget: 9 })

      expect(useAppStore.getState().past).toHaveLength(1)
      expect(useAppStore.getState().past[0].data.settings.doingWipLimit).toBe(3)
      expect(useAppStore.getState().settings).toMatchObject({ doingWipLimit: 2, voteBudget: 9 })
    } finally {
      vi.useRealTimers()
    }
  })
})
