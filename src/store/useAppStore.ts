import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { ACTIVE_STATUSES, parseMentions, votesUsed } from '../domain/scoring'
import { uid } from '../domain/ids'
import { cardsToArchive } from '../domain/archive'
import { backfillHistory, isValidHistory } from '../domain/history'
import { normalizeLabels } from '../lib/filters'
import { wipBlockReason } from '../domain/wip'
import {
  blockerLinkReason,
  dependencyBlockReason,
  normalizeBlockedBy,
} from '../domain/dependencies'
import type {
  Activity,
  ActivityKind,
  AppData,
  Card,
  ChecklistItem,
  ColumnId,
  Comment,
  FeatureRequest,
  RequestStatus,
  Settings,
} from '../domain/types'
import { createSeedData } from './seed'

export type ActionResult = { ok: true } | { ok: false; reason: string }
export type ChecklistActionResult =
  | { ok: true; autoMoved?: ColumnId; reason?: string }
  | { ok: false; reason: string }

export type UndoableData = Pick<
  AppData,
  'cards' | 'columnOrder' | 'requests' | 'activity' | 'settings' | 'members'
>

export interface HistoryEntry {
  label: string
  data: UndoableData
}

interface AppActions {
  setCurrentUser: (id: string) => void
  addCard: (input: Partial<Card> & { title: string; column: ColumnId }) => ActionResult
  addChecklistItem: (cardId: string, text: string) => ActionResult
  updateChecklistItem: (
    cardId: string,
    itemId: string,
    patch: { text?: string; done?: boolean },
  ) => ChecklistActionResult
  deleteChecklistItem: (cardId: string, itemId: string) => ActionResult
  moveChecklistItem: (cardId: string, itemId: string, toIndex: number) => ActionResult
  updateCard: (id: string, patch: Partial<Card>) => ActionResult
  deleteCard: (id: string) => void
  moveCard: (id: string, to: ColumnId, toIndex: number) => ActionResult
  archiveCard: (id: string) => ActionResult
  restoreCard: (id: string) => ActionResult
  archiveOldDoneCards: () => number
  addComment: (target: 'card' | 'request', id: string, body: string) => void
  addRequest: (input: Partial<FeatureRequest> & { title: string }) => string
  updateRequest: (id: string, patch: Partial<FeatureRequest>) => void
  deleteRequest: (id: string) => void
  setVote: (requestId: string, points: number) => ActionResult
  setRequestStatus: (id: string, status: RequestStatus) => void
  promoteRequest: (id: string) => string
  updateSettings: (patch: Partial<Settings>) => void
  markInboxSeen: () => void
  resetDemo: () => void
  importBoard: (board: {
    cards: Card[]
    columnOrder: AppData['columnOrder']
  }) => void
  importData: (json: string) => ActionResult
  exportData: () => string
  undo: () => string | null
  redo: () => string | null
}

export type AppStore = AppData &
  AppActions & {
    past: HistoryEntry[]
    future: HistoryEntry[]
    settingsHistoryAt: number | null
  }

export const currentUser = (state: Pick<AppData, 'members' | 'currentUserId'>) =>
  state.members.find((member) => member.id === state.currentUserId)

export const canUndo = (state: Pick<AppStore, 'past'>) => state.past.length > 0
export const canRedo = (state: Pick<AppStore, 'future'>) => state.future.length > 0

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...createSeedData(),
      past: [],
      future: [],
      settingsHistoryAt: null,

      setCurrentUser: (id) => {
        set((state) =>
          state.members.some((member) => member.id === id)
            ? { currentUserId: id, settingsHistoryAt: null }
            : {},
        )
      },

      addCard: (input) => {
        const state = get()
        const reason = input.column === 'doing' ? wipBlockReason(state, null) : null
        if (reason) return { ok: false, reason }

        const now = new Date().toISOString()
        const createdAt = input.createdAt ?? now
        const id = input.id ?? uid('card')
        const blockers = requestedBlockers(state.cards, input.blockedBy ?? [], id)
        const linkReason = blockers.flatMap((blockerId) => blockerLinkReason(state.cards, id, blockerId) ?? [])[0]
        if (linkReason) return { ok: false, reason: linkReason }
        const blockedBy = blockers.filter((blockerId) => blockerId !== id)
        const doneReason = input.column === 'done' ? dependencyBlockReason(state.cards, blockedBy) : null
        if (doneReason) return { ok: false, reason: doneReason }
        const card: Card = {
          ...input,
          id,
          title: input.title,
          column: input.column,
          description: input.description ?? '',
          type: input.type ?? 'task',
          priority: input.priority ?? 'medium',
          assigneeId: input.assigneeId ?? null,
          reporterId: input.reporterId ?? state.currentUserId,
          customer: input.customer ?? '',
          labels: normalizeLabels(input.labels ?? []),
          dueDate: input.dueDate ?? null,
          blocked: input.blocked ?? false,
          blockedReason: input.blockedReason ?? '',
          blockedBy,
          comments: input.comments ?? [],
          checklist: input.checklist ?? [],
          requestId: input.requestId ?? null,
          createdAt,
          updatedAt: now,
          history: [{ column: input.column, enteredAt: createdAt }],
          archivedAt: null,
        }

        set((current) => ({
          ...recordHistory(current, `Add '${card.title}'`),
          cards: [...current.cards, card],
          columnOrder: {
            ...current.columnOrder,
            [card.column]: [...current.columnOrder[card.column], card.id],
          },
          activity: addActivity(current.activity, makeActivity(current, {
            kind: 'card_created',
            targetType: 'card',
            targetId: card.id,
            targetTitle: card.title,
            detail: `created ${card.type === 'task' ? 'a task' : `a ${card.type}`}`,
          })),
        }))
        return { ok: true }
      },

      updateCard: (id, patch) => {
        const state = get()
        const card = state.cards.find((item) => item.id === id)
        if (!card) return { ok: true }
        if (
          card.archivedAt !== null &&
          patch.column !== undefined &&
          patch.column !== card.column
        ) {
          return { ok: false, reason: 'Restore this card before moving it.' }
        }
        let blockedBy: string[] | undefined
        if (patch.blockedBy) {
          const blockers = requestedBlockers(state.cards, patch.blockedBy, id)
          for (const blockerId of blockers) {
            if (card.blockedBy.includes(blockerId)) continue
            const linkReason = blockerLinkReason(state.cards, id, blockerId)
            if (linkReason) return { ok: false, reason: linkReason }
          }
          blockedBy = blockers.filter((blockerId) => blockerId !== id)
        }
        const normalizedPatch = {
          ...patch,
          ...(patch.labels ? { labels: normalizeLabels(patch.labels) } : {}),
          ...(blockedBy ? { blockedBy } : {}),
        }
        delete normalizedPatch.id
        delete normalizedPatch.history
        delete normalizedPatch.archivedAt
        const destination = normalizedPatch.column ?? card.column
        const reason =
          destination === 'doing' && card.column !== 'doing'
            ? wipBlockReason(state, id)
            : destination === 'done' && card.column !== 'done'
              ? dependencyBlockReason(state.cards, normalizedPatch.blockedBy ?? card.blockedBy)
              : null
        if (reason) return { ok: false, reason }

        const detailPatch = { ...normalizedPatch }
        delete detailPatch.column
        delete detailPatch.createdAt
        delete detailPatch.updatedAt
        const detailsChanged = hasDifferentValues(card, detailPatch)
        const moved = destination !== card.column
        if (!moved && !detailsChanged) return { ok: true }

        const now = new Date().toISOString()
        if (moved) {
          const movement = cardMoveChanges(
            state,
            card,
            destination,
            state.columnOrder[destination].length,
            now,
          )
          const updatedCard = {
            ...movement.cards.find((item) => item.id === id)!,
            ...normalizedPatch,
            id: card.id,
            column: destination,
            updatedAt: now,
          }
          let activity = movement.activity
          if (detailsChanged) {
            activity = addActivity(activity, makeActivity(state, {
              kind: 'card_updated',
              targetType: 'card',
              targetId: id,
              targetTitle: updatedCard.title,
              detail: 'updated card details',
              createdAt: now,
            }))
          }
          set((current) => ({
            ...recordHistory(current, `Move '${updatedCard.title}' to ${columnTitle(destination)}`),
            ...movement,
            cards: movement.cards.map((item) => (item.id === id ? updatedCard : item)),
            activity,
          }))
          return { ok: true }
        }

        set((current) => {
          const updatedCard = { ...card, ...normalizedPatch, id: card.id, updatedAt: now }
          const blockerDetail = hasDifferentValues(
            { ...card, blockedBy: updatedCard.blockedBy },
            detailPatch,
          )
            ? null
            : blockerChangeDetail(current.cards, card.blockedBy, updatedCard.blockedBy)
          return {
            ...recordHistory(
              current,
              blockerDetail
                ? `Update blockers on '${updatedCard.title}'`
                : `Edit '${updatedCard.title}'`,
            ),
            cards: current.cards.map((item) => (item.id === id ? updatedCard : item)),
            activity: addActivity(current.activity, makeActivity(current, {
              kind: 'card_updated',
              targetType: 'card',
              targetId: id,
              targetTitle: updatedCard.title,
              detail: blockerDetail ?? 'updated card details',
            })),
          }
        })
        return { ok: true }
      },

      addChecklistItem: (cardId, text) => {
        const trimmed = text.trim()
        if (!trimmed) return { ok: false, reason: 'Checklist item text cannot be empty.' }
        const state = get()
        const card = state.cards.find((item) => item.id === cardId)
        if (!card) return { ok: false, reason: 'Card not found.' }
        const now = new Date().toISOString()
        const item: ChecklistItem = { id: uid('check'), text: trimmed, done: false }
        set((current) => ({
          ...recordHistory(current, `Update checklist on '${card.title}'`),
          cards: current.cards.map((currentCard) =>
            currentCard.id === cardId
              ? { ...currentCard, checklist: [...currentCard.checklist, item], updatedAt: now }
              : currentCard,
          ),
          activity: addActivity(current.activity, makeActivity(current, {
            kind: 'card_updated',
            targetType: 'card',
            targetId: cardId,
            targetTitle: card.title,
            detail: 'added a checklist item',
            createdAt: now,
          })),
        }))
        return { ok: true }
      },

      updateChecklistItem: (cardId, itemId, patch) => {
        const state = get()
        const card = state.cards.find((item) => item.id === cardId)
        const item = card?.checklist.find((entry) => entry.id === itemId)
        if (!card || !item) return { ok: false, reason: 'Checklist item not found.' }
        const text = patch.text === undefined ? item.text : patch.text.trim()
        if (!text) return { ok: false, reason: 'Checklist item text cannot be empty.' }
        const done = patch.done ?? item.done
        if (text === item.text && done === item.done) return { ok: true }

        const checklist = card.checklist.map((entry) =>
          entry.id === itemId ? { ...entry, text, done } : entry,
        )
        const completes = card.archivedAt === null &&
          patch.done === true && !item.done &&
          card.column !== 'done' && checklist.length > 0 && checklist.every((entry) => entry.done)
        const reopens = card.archivedAt === null &&
          patch.done === false && item.done &&
          card.column === 'done' && card.checklist.length > 0 &&
          card.checklist.every((entry) => entry.done)
        const blockedReason = reopens
          ? wipBlockReason(state, card.id)
          : completes
            ? dependencyBlockReason(state.cards, card.blockedBy)
            : null
        const autoMoved: ColumnId | undefined = completes
          ? blockedReason ? undefined : 'done'
          : reopens
            ? blockedReason ? 'todo' : 'doing'
            : undefined
        const now = new Date().toISOString()
        const updatedCard = { ...card, checklist, updatedAt: now }
        const label = autoMoved === 'done'
          ? `Complete checklist on '${card.title}'`
          : reopens
            ? `Reopen '${card.title}'`
            : `Update checklist on '${card.title}'`

        set((current) => {
          const movement = autoMoved
            ? cardMoveChanges(current, updatedCard, autoMoved, 0, now)
            : null
          const activity = movement
            ? addActivity(movement.activity, makeActivity(current, {
                kind: 'card_updated',
                targetType: 'card',
                targetId: cardId,
                targetTitle: card.title,
                detail: 'updated checklist',
                createdAt: now,
              }))
            : addActivity(current.activity, makeActivity(current, {
                kind: 'card_updated',
                targetType: 'card',
                targetId: cardId,
                targetTitle: card.title,
                detail: 'updated checklist',
                createdAt: now,
              }))
          return {
            ...recordHistory(current, label),
            ...(movement ?? {}),
            cards: movement
              ? movement.cards
              : current.cards.map((currentCard) =>
                  currentCard.id === cardId ? updatedCard : currentCard,
                ),
            activity,
          }
        })
        return {
          ok: true,
          ...(autoMoved ? { autoMoved } : {}),
          ...(blockedReason ? { reason: blockedReason } : {}),
        }
      },

      deleteChecklistItem: (cardId, itemId) => {
        const state = get()
        const card = state.cards.find((item) => item.id === cardId)
        if (!card || !card.checklist.some((item) => item.id === itemId)) return { ok: true }
        const now = new Date().toISOString()
        set((current) => ({
          ...recordHistory(current, `Update checklist on '${card.title}'`),
          cards: current.cards.map((currentCard) =>
            currentCard.id === cardId
              ? {
                  ...currentCard,
                  checklist: currentCard.checklist.filter((item) => item.id !== itemId),
                  updatedAt: now,
                }
              : currentCard,
          ),
          activity: addActivity(current.activity, makeActivity(current, {
            kind: 'card_updated',
            targetType: 'card',
            targetId: cardId,
            targetTitle: card.title,
            detail: 'removed a checklist item',
            createdAt: now,
          })),
        }))
        return { ok: true }
      },

      moveChecklistItem: (cardId, itemId, toIndex) => {
        const state = get()
        const card = state.cards.find((item) => item.id === cardId)
        if (!card) return { ok: true }
        const fromIndex = card.checklist.findIndex((item) => item.id === itemId)
        if (fromIndex < 0) return { ok: true }
        const checklist = [...card.checklist]
        const [item] = checklist.splice(fromIndex, 1)
        const destination = Number.isFinite(toIndex)
          ? Math.min(checklist.length, Math.max(0, Math.trunc(toIndex)))
          : checklist.length
        checklist.splice(destination, 0, item)
        if (checklist.every((entry, index) => entry.id === card.checklist[index]?.id)) {
          return { ok: true }
        }
        const now = new Date().toISOString()
        set((current) => ({
          ...recordHistory(current, `Update checklist on '${card.title}'`),
          cards: current.cards.map((currentCard) =>
            currentCard.id === cardId
              ? { ...currentCard, checklist, updatedAt: now }
              : currentCard,
          ),
          activity: addActivity(current.activity, makeActivity(current, {
            kind: 'card_updated',
            targetType: 'card',
            targetId: cardId,
            targetTitle: card.title,
            detail: 'reordered checklist items',
            createdAt: now,
          })),
        }))
        return { ok: true }
      },

      deleteCard: (id) => {
        const now = new Date().toISOString()
        set((state) => {
          const card = state.cards.find((item) => item.id === id)
          if (!card) return {}
          const linkedRequest = state.requests.find(
            (request) => request.id === card.requestId || request.cardId === id,
          )
          const reopensRequest = linkedRequest?.status === 'planned'
          const activities = [
            makeActivity(state, {
              kind: 'card_deleted',
              targetType: 'card',
              targetId: card.id,
              targetTitle: card.title,
              detail: 'deleted card',
              createdAt: now,
            }),
          ]
          if (linkedRequest && reopensRequest) {
            activities.push(
              makeActivity(state, {
                kind: 'request_status',
                targetType: 'request',
                targetId: linkedRequest.id,
                targetTitle: linkedRequest.title,
                detail: 'returned to open after linked card was deleted',
                createdAt: now,
              }),
            )
          }

          return {
            ...recordHistory(state, `Delete '${card.title}'`),
            cards: state.cards
              .filter((item) => item.id !== id)
              .map((item) =>
                item.blockedBy.includes(id)
                  ? { ...item, blockedBy: item.blockedBy.filter((blockerId) => blockerId !== id) }
                  : item,
              ),
            columnOrder: removeCardFromOrder(state.columnOrder, id),
            requests: linkedRequest
              ? state.requests.map((request) =>
                  request.id === linkedRequest.id
                    ? {
                        ...request,
                        status: reopensRequest ? 'open' : request.status,
                        cardId: request.cardId === id ? null : request.cardId,
                        updatedAt: now,
                      }
                    : request,
                )
              : state.requests,
            activity: addActivities(state.activity, activities),
          }
        })
      },

      moveCard: (id, to, toIndex) => {
        const state = get()
        const card = state.cards.find((item) => item.id === id)
        if (!card) return { ok: true }
        if (card.archivedAt !== null) {
          return { ok: false, reason: 'Restore this card before moving it.' }
        }
        const reason =
          to === 'doing' && card.column !== 'doing'
            ? wipBlockReason(state, id)
            : to === 'done' && card.column !== 'done'
              ? dependencyBlockReason(state.cards, card.blockedBy)
              : null
        if (reason) return { ok: false, reason }

        const now = new Date().toISOString()
        const movement = cardMoveChanges(state, card, to, toIndex, now)
        if (card.column === to && sameOrder(movement.columnOrder, state.columnOrder)) {
          return { ok: true }
        }

        set((current) => ({
          ...recordHistory(current, `Move '${card.title}' to ${columnTitle(to)}`),
          ...movement,
        }))
        return { ok: true }
      },

      archiveCard: (id) => {
        const state = get()
        const card = state.cards.find((item) => item.id === id)
        if (!card) return { ok: true }
        if (card.archivedAt !== null) {
          return { ok: false, reason: 'This card is already archived.' }
        }
        if (card.column !== 'done') {
          return { ok: false, reason: 'Only Done cards can be archived.' }
        }

        const now = new Date().toISOString()
        set((current) => ({
          ...recordHistory(current, `Archive '${card.title}'`),
          cards: current.cards.map((item) =>
            item.id === id ? { ...item, archivedAt: now, updatedAt: now } : item,
          ),
          columnOrder: {
            ...current.columnOrder,
            done: current.columnOrder.done.filter((cardId) => cardId !== id),
          },
        }))
        return { ok: true }
      },

      restoreCard: (id) => {
        const state = get()
        const card = state.cards.find((item) => item.id === id)
        if (!card) return { ok: true }
        if (card.archivedAt === null) {
          return { ok: false, reason: 'This card is not archived.' }
        }

        const now = new Date().toISOString()
        set((current) => ({
          ...recordHistory(current, `Restore '${card.title}'`),
          cards: current.cards.map((item) =>
            item.id === id ? { ...item, archivedAt: null, updatedAt: now } : item,
          ),
          columnOrder: {
            ...current.columnOrder,
            done: [id, ...current.columnOrder.done.filter((cardId) => cardId !== id)],
          },
        }))
        return { ok: true }
      },

      archiveOldDoneCards: () => {
        const state = get()
        const now = new Date()
        const cards = cardsToArchive(state.cards, state.settings.archiveAfterDays, now)
        if (!cards.length) return 0

        const ids = new Set(cards.map((card) => card.id))
        const archivedAt = now.toISOString()
        set((current) => ({
          ...recordHistory(current, `Archive ${cards.length} Done cards`),
          cards: current.cards.map((card) =>
            ids.has(card.id) ? { ...card, archivedAt, updatedAt: archivedAt } : card,
          ),
          columnOrder: {
            ...current.columnOrder,
            done: current.columnOrder.done.filter((id) => !ids.has(id)),
          },
        }))
        return cards.length
      },

      addComment: (target, id, body) => {
        const trimmedBody = body.trim()
        if (!trimmedBody) return
        const now = new Date().toISOString()
        set((state) => {
          const item =
            target === 'card'
              ? state.cards.find((card) => card.id === id)
              : state.requests.find((request) => request.id === id)
          if (!item) return {}
          const comment: Comment = {
            id: uid('comment'),
            authorId: state.currentUserId,
            body: trimmedBody,
            createdAt: now,
          }
          const mentions = parseMentions(trimmedBody, state.members)
          const activity = makeActivity(state, {
            kind: 'comment_added',
            targetType: target,
            targetId: id,
            targetTitle: item.title,
            detail: `commented on ${target}`,
            mentions,
            createdAt: now,
          })

          return {
            ...recordHistory(state, `Comment on '${item.title}'`),
            cards:
              target === 'card'
                ? state.cards.map((card) =>
                    card.id === id
                      ? { ...card, comments: [...card.comments, comment], updatedAt: now }
                      : card,
                  )
                : state.cards,
            requests:
              target === 'request'
                ? state.requests.map((request) =>
                    request.id === id
                      ? {
                          ...request,
                          comments: [...request.comments, comment],
                          updatedAt: now,
                        }
                      : request,
                  )
                : state.requests,
            activity: addActivity(state.activity, activity),
          }
        })
      },

      addRequest: (input) => {
        const state = get()
        const now = new Date().toISOString()
        const id = input.id ?? uid('request')
        const request: FeatureRequest = {
          ...input,
          id,
          title: input.title,
          problem: input.problem ?? '',
          requesterId: input.requesterId ?? state.currentUserId,
          customers: input.customers ?? [],
          reach: input.reach ?? 1,
          impact: input.impact ?? 1,
          confidence: input.confidence ?? 80,
          effort: input.effort ?? 1,
          arrAtStake: input.arrAtStake ?? 0,
          votes: input.votes ?? {},
          status: input.status ?? 'open',
          cardId: input.cardId ?? null,
          comments: input.comments ?? [],
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        }

        set((current) => ({
          ...recordHistory(current, `Add request '${request.title}'`),
          requests: [...current.requests, request],
          activity: addActivity(current.activity, makeActivity(current, {
            kind: 'request_created',
            targetType: 'request',
            targetId: request.id,
            targetTitle: request.title,
            detail: 'created a feature request',
          })),
        }))
        return request.id
      },

      updateRequest: (id, patch) => {
        const state = get()
        const request = state.requests.find((item) => item.id === id)
        if (!request) return
        const detailPatch = { ...patch }
        delete detailPatch.id
        delete detailPatch.createdAt
        delete detailPatch.updatedAt
        if (!hasDifferentValues(request, detailPatch)) return

        const now = new Date().toISOString()
        set((state) => {
          const currentRequest = state.requests.find((item) => item.id === id)
          if (!currentRequest) return {}
          const updatedRequest = {
            ...currentRequest,
            ...patch,
            id: currentRequest.id,
            updatedAt: now,
          }
          return {
            ...recordHistory(state, `Edit request '${updatedRequest.title}'`),
            requests: state.requests.map((item) => (item.id === id ? updatedRequest : item)),
            activity: addActivity(state.activity, makeActivity(state, {
              kind: 'request_status',
              targetType: 'request',
              targetId: id,
              targetTitle: updatedRequest.title,
              detail: 'updated request details',
              createdAt: now,
            })),
          }
        })
      },

      deleteRequest: (id) => {
        set((state) => {
          const request = state.requests.find((item) => item.id === id)
          if (!request) return {}
          const now = new Date().toISOString()
          return {
            ...recordHistory(state, `Delete request '${request.title}'`),
            requests: state.requests.filter((item) => item.id !== id),
            cards: state.cards.map((card) =>
              card.requestId === id
                ? { ...card, requestId: null, updatedAt: now }
                : card,
            ),
            activity: addActivity(state.activity, makeActivity(state, {
              kind: 'request_status',
              targetType: 'request',
              targetId: id,
              targetTitle: request.title,
              detail: 'deleted feature request',
              createdAt: now,
            })),
          }
        })
      },

      setVote: (requestId, points) => {
        const state = get()
        const request = state.requests.find((item) => item.id === requestId)
        if (!request) return { ok: false, reason: 'Request not found.' }
        if (!Number.isInteger(points) || points < 0) {
          return { ok: false, reason: 'Votes must be a non-negative integer.' }
        }
        if (points > state.settings.maxVotesPerRequest) {
          return {
            ok: false,
            reason: `You can spend at most ${state.settings.maxVotesPerRequest} votes on one request.`,
          }
        }
        if (!ACTIVE_STATUSES.includes(request.status)) {
          return { ok: false, reason: 'Votes can only be changed on open or planned requests.' }
        }
        const otherVotes =
          votesUsed(state.requests, state.currentUserId) -
          (request.votes[state.currentUserId] ?? 0)
        const hasVote = Object.prototype.hasOwnProperty.call(
          request.votes,
          state.currentUserId,
        )
        if ((!hasVote && points === 0) || (hasVote && request.votes[state.currentUserId] === points)) {
          return { ok: true }
        }
        if (otherVotes + points > state.settings.voteBudget) {
          return {
            ok: false,
            reason: `Your vote budget is ${state.settings.voteBudget} points.`,
          }
        }

        const now = new Date().toISOString()
        set((current) => ({
          ...recordHistory(current, `Vote on '${request.title}'`),
          requests: current.requests.map((item) => {
            if (item.id !== requestId) return item
            const votes = { ...item.votes }
            if (points === 0) delete votes[current.currentUserId]
            else votes[current.currentUserId] = points
            return { ...item, votes, updatedAt: now }
          }),
          activity: addActivity(current.activity, makeActivity(current, {
            kind: 'request_voted',
            targetType: 'request',
            targetId: requestId,
            targetTitle: request.title,
            detail: points === 0 ? 'removed votes' : `set vote to ${points} points`,
            createdAt: now,
          })),
        }))
        return { ok: true }
      },

      setRequestStatus: (id, status) => {
        set((state) => {
          const request = state.requests.find((item) => item.id === id)
          if (!request || request.status === status) return {}
          const now = new Date().toISOString()
          return {
            ...recordHistory(state, `Change status of '${request.title}'`),
            requests: state.requests.map((item) =>
              item.id === id ? { ...item, status, updatedAt: now } : item,
            ),
            activity: addActivity(state.activity, makeActivity(state, {
              kind: 'request_status',
              targetType: 'request',
              targetId: id,
              targetTitle: request.title,
              detail: `marked as ${status}`,
              createdAt: now,
            })),
          }
        })
      },

      promoteRequest: (id) => {
        const state = get()
        const request = state.requests.find((item) => item.id === id)
        if (!request) return ''
        if (request.cardId) return request.cardId

        const now = new Date().toISOString()
        const cardId = uid('card')
        const card: Card = {
          id: cardId,
          title: request.title,
          description: request.problem,
          column: 'todo',
          type: 'feature',
          priority: 'medium',
          assigneeId: null,
          reporterId: state.currentUserId,
          customer: request.customers.join(', '),
          labels: [],
          dueDate: null,
          blocked: false,
          blockedReason: '',
          blockedBy: [],
          comments: [],
          checklist: [],
          requestId: request.id,
          createdAt: now,
          updatedAt: now,
          history: [{ column: 'todo', enteredAt: now }],
          archivedAt: null,
        }

        set((current) => ({
          ...recordHistory(current, `Promote '${request.title}'`),
          cards: [...current.cards, card],
          columnOrder: {
            ...current.columnOrder,
            todo: [...current.columnOrder.todo, cardId],
          },
          requests: current.requests.map((item) =>
            item.id === id
              ? { ...item, status: 'planned', cardId, updatedAt: now }
              : item,
          ),
          activity: addActivity(current.activity, makeActivity(current, {
            kind: 'request_promoted',
            targetType: 'request',
            targetId: id,
            targetTitle: request.title,
            detail: 'promoted to To do',
            createdAt: now,
          })),
        }))
        return cardId
      },

      updateSettings: (patch) => {
        const now = Date.now()
        set((state) => {
          const settings = {
            ...state.settings,
            ...patch,
            weights: { ...state.settings.weights, ...patch.weights },
          }
          if (JSON.stringify(settings) === JSON.stringify(state.settings)) return {}

          const coalesce =
            state.settingsHistoryAt !== null &&
            now - state.settingsHistoryAt <= 1000 &&
            state.past[state.past.length - 1]?.label === 'Change settings'
          return {
            settings,
            past: coalesce
              ? state.past
              : [...state.past, { label: 'Change settings', data: snapshot(state) }].slice(-100),
            future: [],
            settingsHistoryAt: now,
          }
        })
      },

      markInboxSeen: () => {
        const now = new Date().toISOString()
        set((state) => ({
          lastSeen: { ...state.lastSeen, [state.currentUserId]: now },
          settingsHistoryAt: null,
        }))
      },

      resetDemo: () => {
        set((state) => ({
          ...createSeedData(),
          ...recordHistory(state, 'Reset demo data'),
        }))
      },

      importBoard: (board) => {
        set((state) => {
          const now = new Date().toISOString()
          const importedIds = new Set(board.cards.map((card) => card.id))
          const claimedRequests = new Set<string>()
          const firstCardByRequest = new Map<string, string>()
          const cards = board.cards.map((original) => {
            const blockedBy = normalizeBlockedBy(original.blockedBy, original.id, importedIds)
            const card =
              blockedBy.length === original.blockedBy.length
                ? original
                : { ...original, blockedBy }
            if (!card.requestId || !state.requests.some((request) => request.id === card.requestId)) {
              return card.requestId ? { ...card, requestId: null } : card
            }
            if (claimedRequests.has(card.requestId)) return { ...card, requestId: null }
            claimedRequests.add(card.requestId)
            firstCardByRequest.set(card.requestId, card.id)
            return card
          })
          const requests = state.requests.map((request) => {
            let cardId = request.cardId
            let status = request.status
            if (cardId && !importedIds.has(cardId)) {
              cardId = null
              if (status === 'planned') status = 'open'
            }
            const firstCardId = firstCardByRequest.get(request.id)
            if (firstCardId) cardId = firstCardId
            if (cardId === request.cardId && status === request.status) return request
            return { ...request, cardId, status, updatedAt: now }
          })
          return {
            ...recordHistory(state, 'Import board'),
            cards,
            columnOrder: board.columnOrder,
            requests,
            activity: addActivity(state.activity, makeActivity(state, {
              kind: 'card_updated',
              targetType: 'card',
              targetId: 'board',
              targetTitle: 'Board',
              detail: 'imported board',
              createdAt: now,
            })),
          }
        })
      },

      importData: (json) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(json)
        } catch {
          return { ok: false, reason: 'Invalid JSON.' }
        }
        const data = migrateWorkspaceData(parsed)
        if (!data) return { ok: false, reason: 'Import must be Relay data version 1, 2, 3, 4 or 5.' }
        set((state) => ({
          ...data,
          ...recordHistory(state, 'Import data'),
        }))
        return { ok: true }
      },

      exportData: () => JSON.stringify(toAppData(get()), null, 2),

      undo: () => {
        const state = get()
        const entry = state.past[state.past.length - 1]
        if (!entry) return null
        set({
          ...entry.data,
          past: state.past.slice(0, -1),
          future: [...state.future, { label: entry.label, data: snapshot(state) }].slice(-100),
          settingsHistoryAt: null,
        })
        return entry.label
      },

      redo: () => {
        const state = get()
        const entry = state.future[state.future.length - 1]
        if (!entry) return null
        set({
          ...entry.data,
          past: [...state.past, { label: entry.label, data: snapshot(state) }].slice(-100),
          future: state.future.slice(0, -1),
          settingsHistoryAt: null,
        })
        return entry.label
      },
    }),
    {
      name: 'relay:data',
      version: 5,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => toAppData(state),
      migrate: (persistedState, version) =>
        version < 5
          ? migrateWorkspaceData(persistedState) ?? createSeedData()
          : (persistedState as AppData),
      merge: (persistedState, currentState) => {
        if (!persistedState || typeof persistedState !== 'object') return currentState
        const persisted = persistedState as Partial<AppData>
        const oldSettings = persisted.settings as (Settings & { wipLimitDoing?: number }) | undefined
        const { wipLimitDoing, ...savedSettings } = oldSettings ?? {}
        return {
          ...currentState,
          ...persisted,
          settings: oldSettings
            ? {
                ...currentState.settings,
                ...savedSettings,
                doingWipLimit:
                  oldSettings.doingWipLimit ??
                  wipLimitDoing ??
                  currentState.settings.doingWipLimit,
              }
            : currentState.settings,
          past: currentState.past,
          future: currentState.future,
          settingsHistoryAt: null,
        }
      },
    },
  ),
)

function toAppData(state: AppData): AppData {
  return {
    version: state.version,
    members: state.members,
    currentUserId: state.currentUserId,
    cards: state.cards,
    columnOrder: state.columnOrder,
    requests: state.requests,
    activity: state.activity,
    lastSeen: state.lastSeen,
    settings: state.settings,
  }
}

function snapshot(state: Pick<AppData, keyof UndoableData>): UndoableData {
  return {
    cards: state.cards,
    columnOrder: state.columnOrder,
    requests: state.requests,
    activity: state.activity,
    settings: state.settings,
    members: state.members,
  }
}

function recordHistory(
  state: AppStore,
  label: string,
): Pick<AppStore, 'past' | 'future' | 'settingsHistoryAt'> {
  return {
    past: [...state.past, { label, data: snapshot(state) }].slice(-100),
    future: [],
    settingsHistoryAt: null,
  }
}

function cardMoveChanges(
  state: AppData,
  card: Card,
  to: ColumnId,
  toIndex: number,
  now: string,
): Pick<AppData, 'cards' | 'columnOrder' | 'requests' | 'activity'> {
  const columnOrder = removeCardFromOrder(state.columnOrder, card.id)
  const destination = [...columnOrder[to]]
  const index = Number.isFinite(toIndex)
    ? Math.min(destination.length, Math.max(0, Math.trunc(toIndex)))
    : destination.length
  destination.splice(index, 0, card.id)
  columnOrder[to] = destination

  const moved = card.column !== to
  const updatedCard = {
    ...card,
    column: to,
    updatedAt: now,
    ...(moved ? { history: [...card.history, { column: to, enteredAt: now }] } : {}),
  }
  const activities: Activity[] = []
  if (moved) {
    activities.push(
      makeActivity(state, {
        kind: 'card_moved',
        targetType: 'card',
        targetId: card.id,
        targetTitle: card.title,
        detail: `moved to ${columnTitle(to)}`,
        createdAt: now,
      }),
    )
  }

  const linkedRequest = state.requests.find(
    (request) => request.id === card.requestId || request.cardId === card.id,
  )
  const nextStatus: RequestStatus | null =
    linkedRequest && moved && to === 'done'
      ? 'shipped'
      : linkedRequest && moved && card.column === 'done' && to !== 'done'
        ? 'planned'
        : null
  const requestStatusChanged =
    linkedRequest && nextStatus && linkedRequest.status !== nextStatus

  if (linkedRequest && nextStatus && requestStatusChanged) {
    activities.push(
      makeActivity(state, {
        kind: 'request_status',
        targetType: 'request',
        targetId: linkedRequest.id,
        targetTitle: linkedRequest.title,
        detail: `marked as ${nextStatus}`,
        createdAt: now,
      }),
    )
  }

  return {
    cards: state.cards.map((item) => (item.id === card.id ? updatedCard : item)),
    columnOrder,
    requests:
      linkedRequest && nextStatus
        ? state.requests.map((request) =>
            request.id === linkedRequest.id
              ? { ...request, status: nextStatus, updatedAt: now }
              : request,
          )
        : state.requests,
    activity: addActivities(state.activity, activities),
  }
}

function sameOrder(
  left: AppData['columnOrder'],
  right: AppData['columnOrder'],
): boolean {
  return (['todo', 'doing', 'done'] as const).every(
    (column) =>
      left[column].length === right[column].length &&
      left[column].every((id, index) => id === right[column][index]),
  )
}

function hasDifferentValues<T extends object>(
  current: T,
  patch: Partial<T>,
): boolean {
  const values = current as Record<string, unknown>
  return Object.entries(patch).some(([key, value]) => {
    const previous = values[key]
    if (Object.is(previous, value)) return false
    return JSON.stringify(previous) !== JSON.stringify(value)
  })
}

function makeActivity(
  state: Pick<AppData, 'currentUserId'>,
  fields: {
    kind: ActivityKind
    targetType: Activity['targetType']
    targetId: string
    targetTitle: string
    detail: string
    mentions?: string[]
    createdAt?: string
  },
): Activity {
  return {
    id: uid('activity'),
    actorId: state.currentUserId,
    targetType: fields.targetType,
    targetId: fields.targetId,
    targetTitle: fields.targetTitle,
    kind: fields.kind,
    detail: fields.detail,
    mentions: fields.mentions ?? [],
    createdAt: fields.createdAt ?? new Date().toISOString(),
  }
}

function addActivity(existing: Activity[], activity: Activity): Activity[] {
  return [activity, ...existing].slice(0, 200)
}

function addActivities(existing: Activity[], activities: Activity[]): Activity[] {
  return [...activities.reverse(), ...existing].slice(0, 200)
}

function removeCardFromOrder(
  order: AppData['columnOrder'],
  id: string,
): AppData['columnOrder'] {
  return {
    todo: order.todo.filter((cardId) => cardId !== id),
    doing: order.doing.filter((cardId) => cardId !== id),
    done: order.done.filter((cardId) => cardId !== id),
  }
}

function requestedBlockers(cards: Card[], blockedBy: string[], cardId: string): string[] {
  const known = new Set([...cards.map((card) => card.id), cardId])
  return [...new Set(blockedBy)].filter((id) => known.has(id))
}

function blockerChangeDetail(cards: Card[], before: string[], after: string[]): string | null {
  const added = after.filter((id) => !before.includes(id))
  const removed = before.filter((id) => !after.includes(id))
  const title = (id: string) => cards.find((card) => card.id === id)?.title ?? id
  if (added.length === 1 && removed.length === 0) return `added blocker '${title(added[0])}'`
  if (removed.length === 1 && added.length === 0) return `removed blocker '${title(removed[0])}'`
  if (added.length || removed.length) return 'updated blockers'
  return null
}

function columnTitle(column: ColumnId): string {
  return column === 'todo' ? 'To do' : column === 'doing' ? 'Doing' : 'Done'
}

type LegacyAppData = Omit<AppData, 'version' | 'cards' | 'settings'> & {
  version: 1 | 2 | 3 | 4 | 5
  cards: Array<
    Omit<Card, 'checklist' | 'blockedBy' | 'history' | 'archivedAt'> & {
      checklist?: ChecklistItem[]
      blockedBy?: unknown
      history?: unknown
      archivedAt?: unknown
    }
  >
  settings: Omit<Settings, 'archiveAfterDays'> & { archiveAfterDays?: unknown }
}

function migrateWorkspaceData(value: unknown): AppData | null {
  if (!isAppData(value)) return null
  const data = value as AppData | LegacyAppData
  const ids = new Set(data.cards.map((card) => card.id))
  return {
    ...data,
    version: 5,
    settings: {
      ...data.settings,
      archiveAfterDays:
        typeof data.settings.archiveAfterDays === 'number' &&
        Number.isInteger(data.settings.archiveAfterDays) &&
        data.settings.archiveAfterDays >= 1 &&
        data.settings.archiveAfterDays <= 365
          ? data.settings.archiveAfterDays
          : 14,
    },
    cards: data.cards.map((card) => ({
      ...card,
      history: isValidHistory(card.history, card.column)
        ? card.history
        : backfillHistory(card),
      archivedAt: typeof card.archivedAt === 'string' ? card.archivedAt : null,
      checklist: Array.isArray(card.checklist) ? card.checklist : [],
      blockedBy: normalizeBlockedBy(
        Array.isArray(card.blockedBy)
          ? card.blockedBy.filter((id): id is string => typeof id === 'string')
          : [],
        card.id,
        ids,
      ),
    })),
  }
}

function isAppData(value: unknown): value is AppData | LegacyAppData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return (
    (data.version === 1 || data.version === 2 || data.version === 3 || data.version === 4 || data.version === 5) &&
    Array.isArray(data.members) &&
    Array.isArray(data.cards) &&
    Array.isArray(data.requests) &&
    Array.isArray(data.activity) &&
    typeof data.currentUserId === 'string' &&
    isRecord(data.columnOrder) &&
    isRecord(data.lastSeen) &&
    isRecord(data.settings)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
