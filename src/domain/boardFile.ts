import type { AppData, Card, CardType, ColumnId, Priority } from './types'
import { backfillHistory, isValidHistory } from './history'
import { normalizeLabels } from '../lib/filters'
import { blockerLinkReason } from './dependencies'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const COLUMNS = ['todo', 'doing', 'done'] as const
const CARD_TYPES = ['task', 'bug', 'escalation', 'feature'] as const
const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const

export type ParsedBoard =
  | {
      ok: true
      cards: Card[]
      columnOrder: Record<ColumnId, string[]>
      unassignedCount: number
      droppedBlockerCount: number
    }
  | { ok: false; reason: string }

export function serializeBoard(data: Pick<AppData, 'cards' | 'columnOrder'>): string {
  return JSON.stringify(
    {
      kind: 'relay-board',
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: data.cards,
      columnOrder: data.columnOrder,
    },
    null,
    2,
  )
}

export function parseBoardFile(
  text: string,
  ctx: { memberIds: string[]; requestIds: string[]; currentUserId: string },
): ParsedBoard {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    return { ok: false, reason: 'This file is larger than 5 MB.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: "This file isn't valid JSON." }
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'This is not a Relay board file.' }
  if (
    !Object.prototype.hasOwnProperty.call(parsed, 'kind') &&
    looksLikeWorkspaceBackup(parsed)
  ) {
    return {
      ok: false,
      reason: 'This is a full workspace backup — import it from Settings.',
    }
  }
  if (parsed.kind !== 'relay-board') {
    return { ok: false, reason: 'This is not a Relay board file.' }
  }
  if (parsed.version !== 1) {
    return { ok: false, reason: 'Unsupported Relay board file version.' }
  }
  if (!Array.isArray(parsed.cards)) {
    return { ok: false, reason: 'Cards must be an array.' }
  }
  if (!isColumnOrder(parsed.columnOrder)) {
    return {
      ok: false,
      reason: 'Column order must contain exactly todo, doing, and done as string arrays.',
    }
  }

  const members = new Set(ctx.memberIds)
  const requests = new Set(ctx.requestIds)
  const ids = new Set<string>()
  const cards: Card[] = []
  let unassignedCount = 0

  for (let index = 0; index < parsed.cards.length; index += 1) {
    const value = parsed.cards[index]
    const title = isRecord(value) ? value.title : undefined
    const cardResult = parseCard(value, index + 1, title, members, requests, ctx.currentUserId)
    if (!cardResult.ok) return cardResult
    if (ids.has(cardResult.card.id)) {
      return {
        ok: false,
        reason: cardMessage(
          index + 1,
          title,
          `duplicates id '${cardResult.card.id}'`,
        ),
      }
    }
    ids.add(cardResult.card.id)
    cards.push(cardResult.card)
    unassignedCount += cardResult.unassigned ? 1 : 0
  }

  const cardById = new Map(cards.map((card, index) => [card.id, { card, index }]))
  const listed = new Map<string, { column: ColumnId; count: number }>()
  for (const column of COLUMNS) {
    for (const id of parsed.columnOrder[column]) {
      const cardEntry = cardById.get(id)
      if (!cardEntry) {
        return { ok: false, reason: `Column order lists unknown card id '${id}'.` }
      }
      if (cardEntry.card.archivedAt !== null) {
        return {
          ok: false,
          reason: cardMessage(
            cardEntry.index + 1,
            cardEntry.card.title,
            'is archived but listed in column order',
          ),
        }
      }
      const existing = listed.get(id)
      if (existing) {
        existing.count += 1
        continue
      }
      listed.set(id, { column, count: 1 })
    }
  }

  for (const [id, entry] of listed) {
    if (entry.count > 1) {
      return { ok: false, reason: `Column order lists card '${id}' more than once.` }
    }
  }
  for (const { card, index } of cardById.values()) {
    const entry = listed.get(card.id)
    if (card.archivedAt !== null) {
      if (entry) {
        return {
          ok: false,
          reason: cardMessage(index + 1, card.title, 'is archived but listed in column order'),
        }
      }
      continue
    }
    if (!entry) {
      return {
        ok: false,
        reason: cardMessage(index + 1, card.title, `is missing from column order`),
      }
    }
    if (entry.column !== card.column) {
      return {
        ok: false,
        reason: cardMessage(
          index + 1,
          card.title,
          `is listed in '${entry.column}' but has column '${card.column}'`,
        ),
      }
    }
  }

  const { cards: linkedCards, droppedBlockerCount } = repairBlockers(cards)
  return {
    ok: true,
    cards: linkedCards,
    columnOrder: parsed.columnOrder,
    unassignedCount,
    droppedBlockerCount,
  }
}

function repairBlockers(cards: Card[]): { cards: Card[]; droppedBlockerCount: number } {
  const ids = new Set(cards.map((card) => card.id))
  let dropped = 0
  const linked = cards.map((card) => ({ ...card, blockedBy: [] as string[] }))
  const byId = new Map(linked.map((card) => [card.id, card]))
  for (const card of cards) {
    const target = byId.get(card.id)!
    for (const blockerId of new Set(card.blockedBy)) {
      if (!ids.has(blockerId) || blockerLinkReason(linked, card.id, blockerId)) {
        dropped += 1
        continue
      }
      target.blockedBy.push(blockerId)
    }
  }
  return { cards: linked, droppedBlockerCount: dropped }
}

function parseCard(
  value: unknown,
  index: number,
  titleValue: unknown,
  members: Set<string>,
  requests: Set<string>,
  currentUserId: string,
): { ok: true; card: Card; unassigned: boolean } | { ok: false; reason: string } {
  const title = typeof titleValue === 'string' ? titleValue : undefined
  const fail = (message: string) => ({ ok: false as const, reason: cardMessage(index, title, message) })
  if (!isRecord(value)) return fail('is not an object')
  if (typeof value.id !== 'string' || !value.id.trim()) return fail('has no id')
  if (typeof value.title !== 'string' || !value.title.trim()) return fail('has no title')
  if (typeof value.description !== 'string') return fail('has an invalid description')
  if (!isOneOf(value.column, COLUMNS)) {
    return fail(`has an invalid column '${String(value.column)}'`)
  }
  if (
    value.archivedAt !== undefined &&
    value.archivedAt !== null &&
    typeof value.archivedAt !== 'string'
  ) {
    return fail('has an invalid archivedAt')
  }
  const archivedAt = typeof value.archivedAt === 'string' ? value.archivedAt : null
  if (archivedAt !== null && value.column !== 'done') {
    return fail('is archived but not in Done')
  }
  if (!isOneOf(value.type, CARD_TYPES)) {
    return fail(`has an invalid type '${String(value.type)}'`)
  }
  if (!isOneOf(value.priority, PRIORITIES)) {
    return fail(`has an invalid priority '${String(value.priority)}'`)
  }
  if (value.assigneeId !== null && typeof value.assigneeId !== 'string') {
    return fail('has an invalid assignee')
  }
  if (typeof value.reporterId !== 'string') return fail('has an invalid reporter')
  if (typeof value.customer !== 'string') return fail('has an invalid customer')
  if (!Array.isArray(value.labels) || !value.labels.every((label) => typeof label === 'string')) {
    return fail('has invalid labels')
  }
  if (
    value.dueDate !== null &&
    (typeof value.dueDate !== 'string' || !isDate(value.dueDate))
  ) {
    return fail('has an invalid due date')
  }
  if (typeof value.blocked !== 'boolean') return fail('has an invalid blocked value')
  if (typeof value.blockedReason !== 'string') return fail('has an invalid blocked reason')
  if (
    value.blockedBy !== undefined &&
    (!Array.isArray(value.blockedBy) || !value.blockedBy.every((id) => typeof id === 'string'))
  ) {
    return fail('has an invalid blocked-by list')
  }
  if (!Array.isArray(value.comments)) return fail('has invalid comments')
  for (let commentIndex = 0; commentIndex < value.comments.length; commentIndex += 1) {
    const comment = value.comments[commentIndex]
    if (
      !isRecord(comment) ||
      typeof comment.id !== 'string' ||
      typeof comment.authorId !== 'string' ||
      typeof comment.body !== 'string' ||
      typeof comment.createdAt !== 'string'
    ) {
      return fail(`has an invalid comment at position ${commentIndex + 1}`)
    }
  }
  if (!Array.isArray(value.checklist)) return fail('has invalid checklist items')
  const checklistIds = new Set<string>()
  for (let itemIndex = 0; itemIndex < value.checklist.length; itemIndex += 1) {
    const item = value.checklist[itemIndex]
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      typeof item.text !== 'string' ||
      !item.text.trim() ||
      typeof item.done !== 'boolean'
    ) {
      return fail(`has an invalid checklist item at position ${itemIndex + 1}`)
    }
    if (checklistIds.has(item.id)) {
      return fail(`has duplicate checklist item id '${item.id}'`)
    }
    checklistIds.add(item.id)
  }
  if (value.requestId !== null && typeof value.requestId !== 'string') {
    return fail('has an invalid feature request id')
  }
  if (typeof value.createdAt !== 'string') return fail('has an invalid createdAt')
  if (typeof value.updatedAt !== 'string') return fail('has an invalid updatedAt')
  const history =
    value.history === undefined
      ? backfillHistory({
          column: value.column as ColumnId,
          updatedAt: value.updatedAt,
        })
      : value.history
  if (!isValidHistory(history, value.column as ColumnId)) return fail('has an invalid history')

  const unassigned = typeof value.assigneeId === 'string' && !members.has(value.assigneeId)
  return {
    ok: true,
    unassigned,
    card: {
      id: value.id,
      title: value.title,
      description: value.description,
      column: value.column as ColumnId,
      type: value.type as CardType,
      priority: value.priority as Priority,
      assigneeId: unassigned ? null : value.assigneeId as string | null,
      reporterId: members.has(value.reporterId) ? value.reporterId : currentUserId,
      customer: value.customer,
      labels: normalizeLabels(value.labels),
      dueDate: value.dueDate,
      blocked: value.blocked,
      blockedReason: value.blockedReason,
      blockedBy: (value.blockedBy as string[] | undefined) ?? [],
      comments: value.comments as Card['comments'],
      checklist: value.checklist as Card['checklist'],
      history,
      archivedAt,
      requestId:
        typeof value.requestId === 'string' && requests.has(value.requestId)
          ? value.requestId
          : null,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  }
}

function isColumnOrder(value: unknown): value is Record<ColumnId, string[]> {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort()
  if (keys.length !== COLUMNS.length || !COLUMNS.every((column) => keys.includes(column))) {
    return false
  }
  return COLUMNS.every(
    (column) =>
      Array.isArray(value[column]) &&
      value[column].every((id: unknown) => typeof id === 'string'),
  )
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function cardMessage(index: number, title: unknown, message: string): string {
  const suffix = typeof title === 'string' && title.trim() ? ` ('${title}')` : ''
  return `Card ${index}${suffix} ${message}`
}

function looksLikeWorkspaceBackup(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.members) &&
    Array.isArray(value.cards) &&
    Array.isArray(value.requests) &&
    typeof value.version === 'number'
  )
}

function isOneOf<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
