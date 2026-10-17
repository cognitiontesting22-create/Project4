import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBoardFile } from '../domain/boardFile'
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

  it('moves a checklist-complete card from To do and Doing to Done', () => {
    const todo = useAppStore.getState().addCard({
      title: 'One-step task',
      column: 'todo',
      checklist: [{ id: 'todo-check', text: 'Finish the task', done: false }],
    })
    expect(todo).toEqual({ ok: true })
    const todoCard = useAppStore.getState().cards.find((card) => card.title === 'One-step task')!
    expect(useAppStore.getState().updateChecklistItem(todoCard.id, 'todo-check', { done: true }))
      .toMatchObject({ ok: true, autoMoved: 'done' })
    expect(useAppStore.getState().cards.find((card) => card.id === todoCard.id)?.column).toBe('done')

    for (const item of useAppStore.getState().cards.find((card) => card.id === 'card-105')!.checklist) {
      if (!item.done) {
        useAppStore.getState().updateChecklistItem('card-105', item.id, { done: true })
      }
    }
    expect(useAppStore.getState().cards.find((card) => card.id === 'card-105')?.column).toBe('done')
    expect(useAppStore.getState().columnOrder.done[0]).toBe('card-105')
  })

  it('moves blocked cards to Done when their checklist is completed', () => {
    useAppStore.getState().addCard({
      title: 'Blocked but complete',
      column: 'todo',
      blocked: true,
      checklist: [{ id: 'blocked-check', text: 'Resolve blocker', done: false }],
    })
    const card = useAppStore.getState().cards.find((item) => item.title === 'Blocked but complete')!

    expect(useAppStore.getState().updateChecklistItem(card.id, 'blocked-check', { done: true }))
      .toMatchObject({ ok: true, autoMoved: 'done' })
  })

  it('records a checklist tick and its auto-move as one undoable change', () => {
    const item = useAppStore.getState().cards.find((card) => card.id === 'card-105')!.checklist[2]
    const historyLength = useAppStore.getState().past.length
    useAppStore.getState().updateChecklistItem('card-105', item.id, { done: true })
    useAppStore.getState().updateChecklistItem('card-105', 'check-105-4', { done: true })
    useAppStore.getState().updateChecklistItem('card-105', 'check-105-5', { done: true })

    expect(useAppStore.getState().past).toHaveLength(historyLength + 3)
    expect(useAppStore.getState().columnOrder.done[0]).toBe('card-105')
    expect(useAppStore.getState().undo()).toBe("Complete checklist on 'Reduce cold-start time for agent runs'")
    expect(useAppStore.getState().cards.find((card) => card.id === 'card-105')?.column).toBe('doing')
    expect(useAppStore.getState().cards.find((card) => card.id === 'card-105')?.checklist[4].done)
      .toBe(false)
  })

  it('reopens a completed Done checklist into Doing when there is capacity', () => {
    useAppStore.getState().moveCard('card-105', 'todo', 0)
    expect(useAppStore.getState().updateChecklistItem('card-109', 'check-109-1', { done: false }))
      .toMatchObject({ ok: true, autoMoved: 'doing' })
    expect(useAppStore.getState().columnOrder.doing[0]).toBe('card-109')
  })

  it('reopens a completed Done checklist into To do when Doing is full', () => {
    expect(useAppStore.getState().updateChecklistItem('card-109', 'check-109-1', { done: false }))
      .toMatchObject({
        ok: true,
        autoMoved: 'todo',
        reason: 'Doing is at its WIP limit (3/3). Finish or move a card out of Doing first.',
      })
    expect(useAppStore.getState().columnOrder.todo[0]).toBe('card-109')
  })

  it('does not auto-move when the last incomplete checklist item is deleted', () => {
    useAppStore.getState().addCard({
      title: 'Incomplete checklist',
      column: 'todo',
      checklist: [{ id: 'incomplete', text: 'Still not done', done: false }],
    })
    const card = useAppStore.getState().cards.find((item) => item.title === 'Incomplete checklist')!

    useAppStore.getState().deleteChecklistItem(card.id, 'incomplete')
    expect(useAppStore.getState().cards.find((item) => item.id === card.id)?.column).toBe('todo')
    expect(useAppStore.getState().cards.find((item) => item.id === card.id)?.checklist).toEqual([])
  })

  it('ships a linked request when checklist completion auto-moves its card', () => {
    useAppStore.getState().updateCard('card-104', {
      checklist: [{ id: 'linked-check', text: 'Ship the feature', done: false }],
    })

    useAppStore.getState().updateChecklistItem('card-104', 'linked-check', { done: true })
    expect(useAppStore.getState().requests.find((item) => item.id === 'request-201')?.status)
      .toBe('shipped')
  })

  it('rejects empty checklist text and reorders checklist items', () => {
    const store = useAppStore.getState()
    expect(store.addChecklistItem('card-105', '   ')).toEqual({
      ok: false,
      reason: 'Checklist item text cannot be empty.',
    })
    expect(store.past).toHaveLength(0)
    expect(store.moveChecklistItem('card-105', 'check-105-1', 4)).toEqual({ ok: true })
    expect(useAppStore.getState().cards.find((card) => card.id === 'card-105')?.checklist[4].id)
      .toBe('check-105-1')
  })

  it('migrates v1 workspace imports and persisted cards to checklist version 2', async () => {
    const current = createSeedData()
    const legacy = {
      ...current,
      version: 1,
      cards: current.cards.map(({ checklist: _checklist, blockedBy: _blockedBy, ...card }) => card),
    }
    expect(useAppStore.getState().importData(JSON.stringify(legacy))).toEqual({ ok: true })
    expect(useAppStore.getState().version).toBe(3)
    expect(useAppStore.getState().cards.every((card) => Array.isArray(card.checklist))).toBe(true)
    expect(useAppStore.getState().cards.every((card) => card.blockedBy.length === 0)).toBe(true)

    localStorage.setItem('relay:data', JSON.stringify({ state: legacy, version: 1 }))
    await useAppStore.persist.rehydrate()
    expect(useAppStore.getState().version).toBe(3)
    expect(useAppStore.getState().cards.every((card) => Array.isArray(card.checklist))).toBe(true)
  })

  it('migrates v2 data to version 3 with empty blockers and drops unknown blocker ids', async () => {
    const current = createSeedData()
    const v2 = {
      ...current,
      version: 2,
      cards: current.cards.map(({ blockedBy: _blockedBy, ...card }) =>
        card.id === 'card-101' ? { ...card, blockedBy: ['card-105', 'missing', 'card-101'] } : card,
      ),
    }
    localStorage.setItem('relay:data', JSON.stringify({ state: v2, version: 2 }))
    await useAppStore.persist.rehydrate()
    const cards = useAppStore.getState().cards
    expect(useAppStore.getState().version).toBe(3)
    expect(cards.find((card) => card.id === 'card-101')?.blockedBy).toEqual(['card-105'])
    expect(cards.filter((card) => card.id !== 'card-101').every((card) => card.blockedBy.length === 0))
      .toBe(true)
  })

  it('imports only board data, repairs request links, and restores everything in one undo', () => {
    const before = useAppStore.getState()
    const cards = before.cards
      .filter((card) => card.id !== 'card-104')
      .map((card) => ({
        ...card,
        requestId: card.id === 'card-101' || card.id === 'card-102' ? 'request-202' : card.requestId,
      }))
    const columnOrder = {
      todo: before.columnOrder.todo.filter((id) => id !== 'card-104'),
      doing: [...before.columnOrder.doing],
      done: [...before.columnOrder.done],
    }
    const members = before.members
    const settings = before.settings
    const lastSeen = before.lastSeen
    const requests = before.requests
    const previousActivity = before.activity

    before.importBoard({ cards, columnOrder })
    const imported = useAppStore.getState()

    expect(imported.cards).toEqual(cards.map((card) =>
      card.id === 'card-102' ? { ...card, requestId: null } : card,
    ))
    expect(imported.columnOrder).toEqual(columnOrder)
    expect(imported.members).toBe(members)
    expect(imported.settings).toBe(settings)
    expect(imported.lastSeen).toBe(lastSeen)
    expect(imported.requests.find((request) => request.id === 'request-201')).toMatchObject({
      status: 'open',
      cardId: null,
    })
    expect(imported.requests.find((request) => request.id === 'request-202')?.cardId).toBe('card-101')
    expect(imported.cards.find((card) => card.id === 'card-102')?.requestId).toBeNull()
    expect(imported.activity).toHaveLength(previousActivity.length + 1)
    expect(imported.activity[0].detail).toBe('imported board')

    expect(imported.undo()).toBe('Import board')
    const undone = useAppStore.getState()
    expect(undone.cards).toBe(before.cards)
    expect(undone.columnOrder).toBe(before.columnOrder)
    expect(undone.requests).toBe(requests)
    expect(undone.activity).toBe(previousActivity)
  })

  it('does not mutate store references when board parsing is refused', () => {
    const before = useAppStore.getState()
    expect(parseBoardFile('{invalid', {
      memberIds: before.members.map((member) => member.id),
      requestIds: before.requests.map((request) => request.id),
      currentUserId: before.currentUserId,
    })).toEqual({ ok: false, reason: "This file isn't valid JSON." })
    expect(useAppStore.getState()).toBe(before)
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

describe('card dependencies', () => {
  const cardById = (id: string) => useAppStore.getState().cards.find((card) => card.id === id)!
  const blockedReason = "Blocked by 'Map Acme carrier aliases' (Doing). Move it to Done first."

  it('refuses dragging or keyboard-moving a blocked card into Done and names the blocker', () => {
    const before = useAppStore.getState().exportData()

    expect(useAppStore.getState().moveCard('card-102', 'done', 0)).toEqual({
      ok: false,
      reason: blockedReason,
    })
    expect(useAppStore.getState().exportData()).toBe(before)
    expect(useAppStore.getState().past).toHaveLength(0)

    expect(useAppStore.getState().moveCard('card-106', 'done', 0)).toEqual({ ok: true })
    expect(useAppStore.getState().moveCard('card-102', 'done', 0)).toEqual({ ok: true })
    expect(cardById('card-102').column).toBe('done')
  })

  it('lets a blocked card move between To do and Doing', () => {
    useAppStore.getState().updateSettings({ doingWipLimit: 0 })
    expect(useAppStore.getState().moveCard('card-102', 'doing', 0)).toEqual({ ok: true })
    expect(useAppStore.getState().moveCard('card-102', 'todo', 0)).toEqual({ ok: true })
  })

  it('refuses the Status menu and new cards into Done while a blocker is open', () => {
    const store = useAppStore.getState()
    const before = store.exportData()

    expect(store.updateCard('card-102', { column: 'done' })).toEqual({ ok: false, reason: blockedReason })
    expect(store.updateCard('card-101', { column: 'done', blockedBy: ['card-106'] }))
      .toEqual({ ok: false, reason: blockedReason })
    expect(store.addCard({ title: 'Born done', column: 'done', blockedBy: ['card-106'] }))
      .toEqual({ ok: false, reason: blockedReason })
    expect(useAppStore.getState().exportData()).toBe(before)
    expect(useAppStore.getState().past).toHaveLength(0)

    expect(store.updateCard('card-102', { column: 'done', blockedBy: [] })).toEqual({ ok: true })
    expect(cardById('card-102')).toMatchObject({ column: 'done', blockedBy: [] })
  })

  it('names every open blocker but ignores blockers already in Done', () => {
    useAppStore.getState().updateCard('card-102', { blockedBy: ['card-106', 'card-110', 'card-101'] })

    expect(useAppStore.getState().moveCard('card-102', 'done', 0)).toEqual({
      ok: false,
      reason:
        "Blocked by 'Map Acme carrier aliases' (Doing) and 'Harden webhook retry handling' (To do). Move them to Done first.",
    })
    expect(useAppStore.getState().moveCard('card-104', 'done', 0)).toEqual({ ok: true })
  })

  it('keeps a blocked card in place when its checklist is completed', () => {
    useAppStore.getState().updateCard('card-105', { blockedBy: ['card-106'] })
    const items = cardById('card-105').checklist.filter((item) => !item.done)
    for (const item of items.slice(0, -1)) {
      useAppStore.getState().updateChecklistItem('card-105', item.id, { done: true })
    }

    expect(useAppStore.getState().updateChecklistItem('card-105', items[items.length - 1].id, { done: true }))
      .toEqual({ ok: true, reason: blockedReason })
    expect(cardById('card-105').column).toBe('doing')
    expect(cardById('card-105').checklist.every((item) => item.done)).toBe(true)
  })

  it('refuses self, direct, and indirect cycles', () => {
    const store = useAppStore.getState()

    expect(store.updateCard('card-101', { blockedBy: ['card-101'] })).toEqual({
      ok: false,
      reason: "A card can't block itself.",
    })
    expect(store.updateCard('card-106', { blockedBy: ['card-102'] })).toEqual({
      ok: false,
      reason:
        "Can't add 'Add guided mapping for Acme locations' as a blocker: it is already blocked by 'Map Acme carrier aliases', so this would create a cycle.",
    })

    expect(store.updateCard('card-106', { blockedBy: ['card-101'] })).toEqual({ ok: true })
    expect(useAppStore.getState().updateCard('card-101', { blockedBy: ['card-102'] })).toEqual({
      ok: false,
      reason:
        "Can't add 'Add guided mapping for Acme locations' as a blocker: it is already blocked by 'Harden webhook retry handling' through 'Map Acme carrier aliases', so this would create a cycle.",
    })
    expect(cardById('card-101').blockedBy).toEqual([])
  })

  it('leaves cards already in Done when a blocker moves back out of Done', () => {
    useAppStore.getState().moveCard('card-106', 'done', 0)
    useAppStore.getState().moveCard('card-102', 'done', 0)

    expect(useAppStore.getState().moveCard('card-106', 'todo', 0)).toEqual({ ok: true })
    expect(cardById('card-102').column).toBe('done')
    expect(cardById('card-102').blockedBy).toEqual(['card-106'])
  })

  it('removes a deleted card from every blocked-by list and undo restores both', () => {
    useAppStore.getState().updateCard('card-101', { blockedBy: ['card-106'] })
    useAppStore.getState().deleteCard('card-106')

    expect(cardById('card-101').blockedBy).toEqual([])
    expect(cardById('card-102').blockedBy).toEqual([])
    expect(useAppStore.getState().moveCard('card-102', 'done', 0)).toEqual({ ok: true })

    useAppStore.getState().undo()
    useAppStore.getState().undo()
    expect(cardById('card-106')).toBeDefined()
    expect(cardById('card-102').blockedBy).toEqual(['card-106'])
    expect(cardById('card-101').blockedBy).toEqual(['card-106'])
  })

  it('records adding and removing a blocker as undoable changes', () => {
    expect(useAppStore.getState().updateCard('card-101', { blockedBy: ['card-105'] })).toEqual({ ok: true })
    expect(useAppStore.getState().activity[0].detail).toBe("added blocker 'Reduce cold-start time for agent runs'")
    expect(useAppStore.getState().updateCard('card-101', { blockedBy: [] })).toEqual({ ok: true })
    expect(useAppStore.getState().activity[0].detail).toBe("removed blocker 'Reduce cold-start time for agent runs'")

    expect(useAppStore.getState().undo()).toBe("Update blockers on 'Harden webhook retry handling'")
    expect(cardById('card-101').blockedBy).toEqual(['card-105'])
    expect(useAppStore.getState().undo()).toBe("Update blockers on 'Harden webhook retry handling'")
    expect(cardById('card-101').blockedBy).toEqual([])
    expect(useAppStore.getState().redo()).toBe("Update blockers on 'Harden webhook retry handling'")
    expect(cardById('card-101').blockedBy).toEqual(['card-105'])
  })

  it('drops imported blocker links to cards that are not on the imported board', () => {
    const state = useAppStore.getState()
    const cards = state.cards
      .filter((card) => card.id !== 'card-106')
      .map((card) => (card.id === 'card-101' ? { ...card, blockedBy: ['card-105'] } : card))
    state.importBoard({
      cards,
      columnOrder: {
        ...state.columnOrder,
        doing: state.columnOrder.doing.filter((id) => id !== 'card-106'),
      },
    })

    expect(cardById('card-102').blockedBy).toEqual([])
    expect(cardById('card-101').blockedBy).toEqual(['card-105'])
  })
})
