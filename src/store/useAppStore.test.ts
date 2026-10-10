import { beforeEach, describe, expect, it } from 'vitest'
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
    ])

    useAppStore.getState().moveCard('card-101', 'doing', 1)
    expect(useAppStore.getState().columnOrder.todo).not.toContain('card-101')
    expect(useAppStore.getState().columnOrder.doing).toEqual([
      'card-105',
      'card-101',
      'card-106',
      'card-107',
      'card-108',
    ])
  })

  it('ships a linked request when its card is done and replans it when moved out', () => {
    const { moveCard } = useAppStore.getState()
    moveCard('card-104', 'done', 0)
    expect(useAppStore.getState().requests.find((item) => item.id === 'request-201')?.status)
      .toBe('shipped')

    moveCard('card-104', 'doing', 0)
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
})
