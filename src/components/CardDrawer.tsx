import { ArrowUpRight, Trash } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { COLUMNS, type Card, type CardType, type ColumnId, type Priority } from '../domain/types'
import { btnDanger, btnPrimary, btnSecondary, inputCls, PRIORITY_META, relativeTime, splitList, TYPE_META } from '../lib/meta'
import { useUiStore } from '../lib/ui-store'
import { useAppStore } from '../store/useAppStore'
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
  labels: string
  dueDate: string
  blocked: boolean
  blockedReason: string
}

const toDraft = (c: Partial<Card> & { column: ColumnId }): Draft => ({
  title: c.title ?? '',
  description: c.description ?? '',
  column: c.column,
  type: c.type ?? 'task',
  priority: c.priority ?? 'medium',
  assigneeId: c.assigneeId ?? '',
  customer: c.customer ?? '',
  labels: (c.labels ?? []).join(', '),
  dueDate: c.dueDate ?? '',
  blocked: c.blocked ?? false,
  blockedReason: c.blockedReason ?? '',
})

export function CardDrawer() {
  const state = useUiStore((s) => s.cardDrawer)
  const close = useUiStore((s) => s.closeCard)
  const openRequest = useUiStore((s) => s.openRequest)
  const cards = useAppStore((s) => s.cards)
  const members = useAppStore((s) => s.members)
  const requests = useAppStore((s) => s.requests)
  const { addCard, updateCard, deleteCard, addComment } = useAppStore.getState()

  const card = state.mode === 'edit' ? cards.find((c) => c.id === state.id) : undefined
  const customers = useMemo(() => [...new Set(cards.map((c) => c.customer).filter(Boolean))].sort(), [cards])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const key = state.mode === 'edit' ? state.id : state.mode === 'new' ? `new:${state.column}` : null
  useEffect(() => {
    setConfirmDelete(false)
    if (state.mode === 'new') setDraft(toDraft({ column: state.column }))
    else if (state.mode === 'edit') {
      const c = useAppStore.getState().cards.find((x) => x.id === state.id)
      setDraft(c ? toDraft(c) : null)
    } else setDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (state.mode === 'closed' || !draft || (state.mode === 'edit' && !card)) return null

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const linkedRequest = card?.requestId ? requests.find((r) => r.id === card.requestId) : undefined
  const reporter = card ? members.find((m) => m.id === card.reporterId) : undefined

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
      labels: splitList(draft.labels),
      dueDate: draft.dueDate || null,
      blocked: draft.blocked,
      blockedReason: draft.blocked ? draft.blockedReason : '',
    }
    if (card) updateCard(card.id, patch)
    else addCard({ ...patch, title: draft.title.trim(), column: draft.column })
    close()
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
              <button className={btnDanger} onClick={() => setConfirmDelete(true)}>
                <Trash className="h-4 w-4" />
                Delete
              </button>
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
            <select className={inputCls} value={draft.column} onChange={(e) => set('column', e.target.value as ColumnId)}>
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
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
        <Field label="Labels" hint="Comma separated">
          <input className={inputCls} value={draft.labels} onChange={(e) => set('labels', e.target.value)} placeholder="api, infra" />
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
        <button type="submit" hidden />
      </form>

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
