import { Archive, ArrowUpRight, Trash, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cycleTimeDays, formatDays, timeInColumnDays } from '../domain/history'
import { COLUMNS, type Card, type CardType, type ChecklistItem, type ColumnId, type Priority } from '../domain/types'
import { wipBlockReason } from '../domain/wip'
import { dependencyBlockReason, openBlockers } from '../domain/dependencies'
import { btnDanger, btnPrimary, btnSecondary, inputCls, PRIORITY_META, relativeTime, TYPE_META } from '../lib/meta'
import { normalizeLabels } from '../lib/filters'
import { useToastStore } from '../lib/toast'
import { undoWithToast } from '../lib/undo'
import { useUiStore } from '../lib/ui-store'
import { useAppStore } from '../store/useAppStore'
import { BlockerPicker } from './BlockerPicker'
import { ChecklistEditor } from './ChecklistEditor'
import { CommentThread } from './CommentThread'
import { Drawer, Field } from './Drawer'

interface Draft {
  title: string
  description: string
  column: ColumnId
  type: CardType
  priority: Priority
  assigneeId: string
  customer: string
  labels: string[]
  dueDate: string
  blocked: boolean
  blockedReason: string
  blockedBy: string[]
}

const toDraft = (c: Partial<Card> & { column: ColumnId }): Draft => ({
  title: c.title ?? '',
  description: c.description ?? '',
  column: c.column,
  type: c.type ?? 'task',
  priority: c.priority ?? 'medium',
  assigneeId: c.assigneeId ?? '',
  customer: c.customer ?? '',
  labels: c.labels ?? [],
  dueDate: c.dueDate ?? '',
  blocked: c.blocked ?? false,
  blockedReason: c.blockedReason ?? '',
  blockedBy: c.blockedBy ?? [],
})

export function CardDrawer() {
  const state = useUiStore((s) => s.cardDrawer)
  const close = useUiStore((s) => s.closeCard)
  const openRequest = useUiStore((s) => s.openRequest)
  const openCard = useUiStore((s) => s.openCard)
  const cards = useAppStore((s) => s.cards)
  const members = useAppStore((s) => s.members)
  const requests = useAppStore((s) => s.requests)
  const settings = useAppStore((s) => s.settings)
  const {
    addCard,
    updateCard,
    deleteCard,
    archiveCard,
    addComment,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    moveChecklistItem,
  } = useAppStore.getState()
  const showToast = useToastStore((s) => s.showToast)

  const card = state.mode === 'edit' ? cards.find((c) => c.id === state.id) : undefined
  const customers = useMemo(() => [...new Set(cards.map((c) => c.customer).filter(Boolean))].sort(), [cards])
  const allLabels = useMemo(
    () => normalizeLabels(cards.flatMap((item) => item.labels)),
    [cards],
  )
  const [draft, setDraft] = useState<Draft | null>(null)
  const [stagedChecklist, setStagedChecklist] = useState<ChecklistItem[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const key =
    state.mode === 'edit'
      ? `${state.id}:${card ? JSON.stringify(toDraft(card)) : 'missing'}`
      : state.mode === 'new'
        ? `new:${state.column}`
        : null
  useEffect(() => {
    if (state.mode === 'edit' && !card) {
      close()
      return
    }
    setConfirmDelete(false)
    setLabelInput('')
    if (state.mode === 'new') {
      setDraft(toDraft({ column: state.column }))
      setStagedChecklist([])
    }
    else if (state.mode === 'edit') {
      const c = useAppStore.getState().cards.find((x) => x.id === state.id)
      setDraft(c ? toDraft(c) : null)
      setStagedChecklist([])
    } else setDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (state.mode === 'closed' || !draft || (state.mode === 'edit' && !card)) return null

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const addLabels = (values: string[]) => {
    const additions = normalizeLabels(values)
    if (!additions.length) return
    setDraft((current) =>
      current
        ? { ...current, labels: normalizeLabels([...current.labels, ...additions]) }
        : current,
    )
    setLabelInput('')
  }
  const linkedRequest = card?.requestId ? requests.find((r) => r.id === card.requestId) : undefined
  const reporter = card ? members.find((m) => m.id === card.reporterId) : undefined
  const doingCount = cards.filter((item) => item.column === 'doing' && !item.archivedAt).length
  const wipLimit = settings.doingWipLimit
  const doingFull = wipLimit > 0 && doingCount >= wipLimit
  const blockReason = wipBlockReason({ cards, settings }, card?.id ?? null)
  const doingOptionDisabled = doingFull && card?.column !== 'doing'
  const doneBlockers = card?.column === 'done' ? [] : openBlockers(cards, draft.blockedBy)
  const doneBlockReason = card?.column === 'done' ? null : dependencyBlockReason(cards, draft.blockedBy)
  const blocks = card ? cards.filter((item) => item.blockedBy.includes(card.id)) : []
  const cycleDays = card ? cycleTimeDays(card) : null

  const save = () => {
    if (!draft.title.trim()) return
    const patch: Partial<Card> = {
      title: draft.title.trim(),
      description: draft.description,
      column: draft.column,
      type: draft.type,
      priority: draft.priority,
      assigneeId: draft.assigneeId || null,
      customer: draft.customer.trim(),
      labels: draft.labels,
      dueDate: draft.dueDate || null,
      blocked: draft.blocked,
      blockedReason: draft.blocked ? draft.blockedReason : '',
      blockedBy: draft.blockedBy,
    }
    const result = card
      ? updateCard(card.id, patch)
      : addCard({
          ...patch,
          title: draft.title.trim(),
          column: draft.column,
          checklist: stagedChecklist,
        })
    if (!result.ok) {
      showToast({ message: result.reason, variant: 'error' })
      return
    }
    close()
  }

  const addChecklist = (text: string, item: ChecklistItem): boolean => {
    if (state.mode === 'new') {
      setStagedChecklist((current) => [...current, item])
      return true
    }
    if (!card) return false
    const result = addChecklistItem(card.id, text)
    if (!result.ok) showToast({ message: result.reason, variant: 'error' })
    return result.ok
  }

  const updateChecklist = (
    itemId: string,
    patch: { text?: string; done?: boolean },
  ) => {
    if (state.mode === 'new') {
      setStagedChecklist((current) =>
        current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
      )
      return
    }
    if (!card) return
    const result = updateChecklistItem(card.id, itemId, patch)
    if (!result.ok) {
      showToast({ message: result.reason, variant: 'error' })
      return
    }
    if (!result.autoMoved && result.reason) {
      showToast({ message: `Checklist complete, but not moved to Done. ${result.reason}`, variant: 'error' })
      return
    }
    if (result.autoMoved) {
      const current = useAppStore.getState()
      const currentCard = current.cards.find((item) => item.id === card.id)
      const action = {
        label: 'Undo',
        onClick: () => {
          const label = useAppStore.getState().undo()
          if (label) showToast({ message: `Undid: ${label}`, variant: 'info' })
        },
      }
      const message =
        result.autoMoved === 'done'
          ? `Moved to Done: all ${currentCard?.checklist.length ?? 0} items complete`
          : result.autoMoved === 'doing'
            ? 'Moved back to Doing: checklist reopened'
            : `Moved to To do: Doing is full (${current.columnOrder.doing.length}/${current.settings.doingWipLimit})`
      showToast({ message, variant: 'info', action })
    }
  }

  const deleteChecklist = (itemId: string) => {
    if (state.mode === 'new') {
      setStagedChecklist((current) => current.filter((item) => item.id !== itemId))
    } else if (card) {
      deleteChecklistItem(card.id, itemId)
    }
  }

  const reorderChecklist = (itemId: string, toIndex: number) => {
    if (state.mode === 'new') {
      setStagedChecklist((current) => {
        const fromIndex = current.findIndex((item) => item.id === itemId)
        if (fromIndex < 0) return current
        const next = [...current]
        const [item] = next.splice(fromIndex, 1)
        next.splice(Math.min(next.length, Math.max(0, toIndex)), 0, item)
        return next
      })
    } else if (card) {
      moveChecklistItem(card.id, itemId, toIndex)
    }
  }

  return (
    <Drawer
      open
      onClose={close}
      title={card ? <span className="text-slate-500">Card · <span className="font-mono text-xs">{card.id}</span></span> : 'New card'}
      footer={
        <>
          {card &&
            (confirmDelete ? (
              <>
                <span className="text-sm text-rose-700">Delete permanently?</span>
                <button
                  className={btnDanger}
                  onClick={() => {
                    deleteCard(card.id)
                    close()
                  }}
                >
                  Yes, delete
                </button>
                <button className={btnSecondary} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                {card.column === 'done' && card.archivedAt === null && (
                  <button
                    className={btnSecondary}
                    onClick={() => {
                      const result = archiveCard(card.id)
                      if (result.ok) {
                        close()
                        showToast({
                          message: `Archived '${card.title}'`,
                          variant: 'info',
                          action: { label: 'Undo', onClick: undoWithToast },
                        })
                      } else {
                        showToast({ message: result.reason, variant: 'error' })
                      }
                    }}
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </button>
                )}
                <button className={btnDanger} onClick={() => setConfirmDelete(true)}>
                  <Trash className="h-4 w-4" />
                  Delete
                </button>
              </>
            ))}
          <div className="ml-auto flex gap-2">
            <button className={btnSecondary} onClick={close}>
              Cancel
            </button>
            <button className={btnPrimary} onClick={save} disabled={!draft.title.trim()}>
              {card ? 'Save changes' : 'Create card'}
            </button>
          </div>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          autoFocus={!card}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="What needs to happen?"
          aria-label="Title"
          className="w-full border-0 p-0 text-xl font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select
              className={inputCls}
              value={draft.column}
              onChange={(e) => set('column', e.target.value as ColumnId)}
            >
              {COLUMNS.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                  disabled={
                    (c.id === 'doing' && doingOptionDisabled) ||
                    (c.id === 'done' && doneBlockers.length > 0)
                  }
                >
                  {c.id === 'doing' && doingOptionDisabled
                    ? `Doing (full, ${doingCount}/${wipLimit})`
                    : c.id === 'done' && doneBlockers.length > 0
                      ? `Done (blocked by '${doneBlockers[0].title}'${doneBlockers.length > 1 ? ` +${doneBlockers.length - 1}` : ''})`
                      : c.title}
                </option>
              ))}
            </select>
            {doingOptionDisabled && blockReason && (
              <span className="mt-1 block text-xs text-rose-600">
                Doing is full ({doingCount}/{wipLimit}). Move a card out of Doing to enable this status.
              </span>
            )}
            {doneBlockReason && (
              <span className="mt-1 block text-xs text-rose-600">{doneBlockReason}</span>
            )}
            {card && (
              <>
                <span className="mt-1 block text-xs text-slate-500">
                  In {COLUMNS.find((column) => column.id === card.column)?.title ?? card.column} for{' '}
                  {formatDays(timeInColumnDays(card, new Date()))}
                </span>
                {cycleDays !== null && (
                  <span className="mt-1 block text-xs text-slate-500">
                    Cycle time {formatDays(cycleDays)}
                  </span>
                )}
              </>
            )}
          </Field>
          <Field label="Type">
            <select className={inputCls} value={draft.type} onChange={(e) => set('type', e.target.value as CardType)}>
              {(Object.keys(TYPE_META) as CardType[]).map((t) => (
                <option key={t} value={t}>
                  {t === 'escalation' ? 'Customer escalation' : TYPE_META[t].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputCls} value={draft.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select className={inputCls} value={draft.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role === 'fde' ? 'FDE' : m.role === 'lead' ? 'Lead' : 'Eng'})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Customer account" hint="Leave empty for internal work">
            <input className={inputCls} list="relay-customers" value={draft.customer} onChange={(e) => set('customer', e.target.value)} placeholder="e.g. Acme Logistics" />
            <datalist id="relay-customers">
              {customers.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Due date">
            <input type="date" className={inputCls} value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Labels" hint="Press Enter or comma to add a label.">
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
            {draft.labels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
              >
                {label}
                <button
                  type="button"
                  aria-label={`Remove ${label} label`}
                  className="rounded text-slate-400 hover:text-slate-700"
                  onClick={() => set('labels', draft.labels.filter((item) => item !== label))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400 focus:ring-0"
              list="relay-labels"
              value={labelInput}
              onChange={(event) => {
                const parts = event.target.value.split(',')
                if (parts.length > 1) {
                  addLabels(parts.slice(0, -1))
                  setLabelInput(parts[parts.length - 1])
                } else {
                  setLabelInput(event.target.value)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault()
                  addLabels([labelInput])
                } else if (event.key === 'Backspace' && !labelInput && draft.labels.length) {
                  set('labels', draft.labels.slice(0, -1))
                }
              }}
              aria-label="Add label"
              placeholder={draft.labels.length ? 'Add label…' : 'api, infra'}
            />
            <datalist id="relay-labels">
              {allLabels.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
        </Field>
        <Field label="Description">
          <textarea className={inputCls} rows={4} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Context, acceptance criteria, customer impact…" />
        </Field>
        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-rose-600" checked={draft.blocked} onChange={(e) => set('blocked', e.target.checked)} />
            Blocked
          </label>
          {draft.blocked && (
            <input className={`${inputCls} mt-2`} value={draft.blockedReason} onChange={(e) => set('blockedReason', e.target.value)} placeholder="What is blocking this? Who can unblock it?" />
          )}
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Blocked by</span>
          <BlockerPicker
            cardId={card?.id ?? null}
            cards={cards}
            value={draft.blockedBy}
            onChange={(blockedBy) => set('blockedBy', blockedBy)}
            onRefuse={(reason) => showToast({ message: reason, variant: 'error' })}
          />
          <span className="mt-1 block text-xs text-slate-400">
            This card can't move to Done until every blocker is Done.
          </span>
        </div>
        {blocks.length > 0 && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Blocks</span>
            <ul className="flex flex-wrap gap-1.5">
              {blocks.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openCard(item.id)}
                    className="max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="submit" hidden />
      </form>

      <ChecklistEditor
        key={state.mode === 'edit' ? `edit:${state.id}` : `new:${state.column}`}
        items={card?.checklist ?? stagedChecklist}
        onAdd={addChecklist}
        onUpdate={updateChecklist}
        onDelete={deleteChecklist}
        onReorder={reorderChecklist}
      />

      {card && (
        <>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Reported by {reporter?.name ?? 'Unknown'}</span>
            <span>Created {relativeTime(card.createdAt)}</span>
            <span>Updated {relativeTime(card.updatedAt)}</span>
          </div>
          {linkedRequest && (
            <button
              onClick={() => openRequest(linkedRequest.id)}
              className="mt-4 flex w-full items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-left text-sm text-indigo-800 hover:bg-indigo-50"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Feature request</span>
              <span className="flex-1 truncate">{linkedRequest.title}</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          )}
          <hr className="my-6 border-slate-100" />
          <CommentThread comments={card.comments} onAdd={(body) => addComment('card', card.id, body)} />
        </>
      )}
    </Drawer>
  )
}
