import { describe, expect, it } from 'vitest'
import { createSeedData } from '../store/seed'
import { parseBoardFile, serializeBoard } from './boardFile'

const seed = createSeedData()
const context = {
  memberIds: seed.members.map((member) => member.id),
  requestIds: seed.requests.map((request) => request.id),
  currentUserId: seed.currentUserId,
}

function boardData() {
  return JSON.parse(serializeBoard(seed)) as {
    kind: string
    version: number
    exportedAt: string
    cards: Record<string, unknown>[]
    columnOrder: Record<string, string[]>
  }
}

function parse(data: unknown) {
  return parseBoardFile(JSON.stringify(data), context)
}

describe('board file format', () => {
  it('round trips the seeded board as pretty-printed version 1 JSON', () => {
    const text = serializeBoard(seed)
    const result = parseBoardFile(text, context)

    expect(text).toContain('\n  "kind": "relay-board"')
    expect(JSON.parse(text).exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result).toMatchObject({
      ok: true,
      cards: seed.cards,
      columnOrder: seed.columnOrder,
      unassignedCount: 0,
      droppedBlockerCount: 0,
    })
    expect(JSON.parse(text).cards.find((card: { id: string }) => card.id === 'card-102').blockedBy)
      .toEqual(['card-106'])
  })

  it('treats missing blockedBy as no blockers and rejects malformed lists', () => {
    const data = boardData()
    delete data.cards[0].blockedBy
    const result = parse(data)
    expect(result.ok && result.cards[0].blockedBy).toEqual([])

    data.cards[0].blockedBy = 'card-102'
    expect(parse(data)).toEqual({
      ok: false,
      reason: "Card 1 ('Harden webhook retry handling') has an invalid blocked-by list",
    })
  })

  it('backfills missing history and rejects malformed history', () => {
    const legacy = boardData()
    delete legacy.cards[0].history
    const backfilled = parse(legacy)
    expect(backfilled.ok && backfilled.cards[0].history).toEqual([
      { column: 'todo', enteredAt: seed.cards[0].updatedAt },
    ])

    const invalidHistories = [
      [],
      [{ column: 'later', enteredAt: '2026-10-01T09:00:00.000Z' }],
      [{ column: 'doing', enteredAt: '2026-10-01T09:00:00.000Z' }],
    ]
    for (const history of invalidHistories) {
      const invalid = boardData()
      invalid.cards[0].history = history
      expect(parse(invalid)).toEqual({
        ok: false,
        reason: "Card 1 ('Harden webhook retry handling') has an invalid history",
      })
    }
  })

  it('drops blocker links to missing cards, self links, and links that would form a cycle', () => {
    const data = boardData()
    data.cards[0].blockedBy = ['card-gone', 'card-101', 'card-105']
    data.cards[4].blockedBy = ['card-101']
    const result = parse(data)

    expect(result).toMatchObject({ ok: true, droppedBlockerCount: 3 })
    if (result.ok) {
      expect(result.cards[0].blockedBy).toEqual(['card-105'])
      expect(result.cards[4].blockedBy).toEqual([])
      expect(result.cards.find((card) => card.id === 'card-102')?.blockedBy).toEqual(['card-106'])
    }
  })

  it('rejects files larger than 5 MB', () => {
    expect(parseBoardFile('x'.repeat(5 * 1024 * 1024 + 1), context)).toEqual({
      ok: false,
      reason: 'This file is larger than 5 MB.',
    })
  })

  it('reports invalid JSON exactly', () => {
    expect(parseBoardFile('{broken', context)).toEqual({
      ok: false,
      reason: "This file isn't valid JSON.",
    })
  })

  it('rejects files with the wrong kind', () => {
    expect(parse({ ...boardData(), kind: 'relay-workspace' })).toEqual({
      ok: false,
      reason: 'This is not a Relay board file.',
    })
  })

  it('directs workspace backups to Settings', () => {
    const workspace = { ...seed } as Record<string, unknown>
    delete workspace.kind
    expect(parse(workspace)).toEqual({
      ok: false,
      reason: 'This is a full workspace backup — import it from Settings.',
    })
  })

  it('rejects unsupported board versions', () => {
    expect(parse({ ...boardData(), version: 2 })).toEqual({
      ok: false,
      reason: 'Unsupported Relay board file version.',
    })
  })

  it('rejects a non-array cards field', () => {
    expect(parse({ ...boardData(), cards: null })).toEqual({
      ok: false,
      reason: 'Cards must be an array.',
    })
  })

  it('rejects column orders without exactly the three string-array columns', () => {
    expect(parse({ ...boardData(), columnOrder: { todo: [], doing: [], done: [], later: [] } }))
      .toEqual({
        ok: false,
        reason: 'Column order must contain exactly todo, doing, and done as string arrays.',
      })
  })

  it.each([
    ['id', undefined, "Card 1 ('Harden webhook retry handling') has no id"],
    ['title', '', 'Card 1 has no title'],
    ['description', 12, "Card 1 ('Harden webhook retry handling') has an invalid description"],
    ['column', 'archive', "Card 1 ('Harden webhook retry handling') has an invalid column 'archive'"],
    ['type', 'milestone', "Card 1 ('Harden webhook retry handling') has an invalid type 'milestone'"],
    ['priority', 'huge', "Card 1 ('Harden webhook retry handling') has an invalid priority 'huge'"],
    ['assigneeId', 3, "Card 1 ('Harden webhook retry handling') has an invalid assignee"],
    ['reporterId', null, "Card 1 ('Harden webhook retry handling') has an invalid reporter"],
    ['customer', 3, "Card 1 ('Harden webhook retry handling') has an invalid customer"],
    ['labels', 'api', "Card 1 ('Harden webhook retry handling') has invalid labels"],
    ['dueDate', '2025-13-01', "Card 1 ('Harden webhook retry handling') has an invalid due date"],
    ['blocked', 'false', "Card 1 ('Harden webhook retry handling') has an invalid blocked value"],
    ['blockedReason', null, "Card 1 ('Harden webhook retry handling') has an invalid blocked reason"],
    ['comments', [{}], "Card 1 ('Harden webhook retry handling') has an invalid comment at position 1"],
    ['checklist', [{}], "Card 1 ('Harden webhook retry handling') has an invalid checklist item at position 1"],
    ['requestId', false, "Card 1 ('Harden webhook retry handling') has an invalid feature request id"],
    ['createdAt', null, "Card 1 ('Harden webhook retry handling') has an invalid createdAt"],
    ['updatedAt', null, "Card 1 ('Harden webhook retry handling') has an invalid updatedAt"],
  ])('rejects invalid card field %s with a card-specific reason', (field, value, reason) => {
    const data = boardData()
    if (value === undefined) delete data.cards[0][field]
    else data.cards[0][field] = value

    expect(parse(data)).toEqual({ ok: false, reason })
  })

  it('rejects duplicate card ids and duplicate checklist ids', () => {
    const duplicateCard = boardData()
    duplicateCard.cards.push({ ...duplicateCard.cards[0] })
    expect(parse(duplicateCard)).toEqual({
      ok: false,
      reason: "Card 11 ('Harden webhook retry handling') duplicates id 'card-101'",
    })

    const duplicateChecklist = boardData()
    duplicateChecklist.cards[0].checklist = [
      { id: 'same', text: 'First', done: false },
      { id: 'same', text: 'Second', done: true },
    ]
    expect(parse(duplicateChecklist)).toEqual({
      ok: false,
      reason: "Card 1 ('Harden webhook retry handling') has duplicate checklist item id 'same'",
    })
  })

  it('rejects unknown, repeated, missing, and mismatched column-order cards', () => {
    const unknown = boardData()
    unknown.columnOrder.todo.push('unknown')
    expect(parse(unknown)).toEqual({
      ok: false,
      reason: "Column order lists unknown card id 'unknown'.",
    })

    const repeated = boardData()
    repeated.columnOrder.todo.push('card-101')
    expect(parse(repeated)).toEqual({
      ok: false,
      reason: "Column order lists card 'card-101' more than once.",
    })

    const missing = boardData()
    missing.columnOrder.todo = missing.columnOrder.todo.filter((id) => id !== 'card-101')
    expect(parse(missing)).toEqual({
      ok: false,
      reason: "Card 1 ('Harden webhook retry handling') is missing from column order",
    })

    const mismatched = boardData()
    mismatched.columnOrder.todo = mismatched.columnOrder.todo.filter((id) => id !== 'card-101')
    mismatched.columnOrder.done.push('card-101')
    expect(parse(mismatched)).toEqual({
      ok: false,
      reason: "Card 1 ('Harden webhook retry handling') is listed in 'done' but has column 'todo'",
    })
  })

  it('normalizes labels and reassigns unknown members and requests without losing comments', () => {
    const data = boardData()
    const card = data.cards[0]
    card.assigneeId = 'former-assignee'
    card.reporterId = 'former-reporter'
    card.requestId = 'deleted-request'
    card.labels = [' API ', '', 'api', 'Infra ']
    card.comments = [
      { id: 'former-comment', authorId: 'former-member', body: 'Kept', createdAt: 'now' },
    ]
    const result = parse(data)

    expect(result).toMatchObject({ ok: true, unassignedCount: 1 })
    if (result.ok) {
      expect(result.cards[0]).toMatchObject({
        assigneeId: null,
        reporterId: context.currentUserId,
        requestId: null,
        labels: ['api', 'infra'],
        comments: [{ authorId: 'former-member', body: 'Kept' }],
      })
    }
  })
})
