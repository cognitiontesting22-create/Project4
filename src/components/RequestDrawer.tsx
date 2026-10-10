import { ArrowUpRight, Kanban, Trash } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ACTIVE_STATUSES, scoreRequests } from '../domain/scoring'
import type { Confidence, FeatureRequest, Impact, RequestStatus } from '../domain/types'
import { btnDanger, btnPrimary, btnSecondary, contributions, formatCurrency, IMPACT_OPTIONS, inputCls, relativeTime, SCORE_COLORS, splitList, STATUS_META } from '../lib/meta'
import { useUiStore } from '../lib/ui-store'
import { useAppStore } from '../store/useAppStore'
import { Avatar, RoleBadge } from './Avatar'
import { CommentThread } from './CommentThread'
import { Drawer, Field } from './Drawer'

interface Draft {
  title: string
  problem: string
  customers: string
  reach: string
  impact: Impact
  confidence: Confidence
  effort: string
  arrAtStake: string
  status: RequestStatus
}

const toDraft = (r?: FeatureRequest): Draft => ({
  title: r?.title ?? '',
  problem: r?.problem ?? '',
  customers: (r?.customers ?? []).join(', '),
  reach: String(r?.reach ?? 1),
  impact: r?.impact ?? 1,
  confidence: r?.confidence ?? 80,
  effort: String(r?.effort ?? 1),
  arrAtStake: String(r?.arrAtStake ?? 0),
  status: r?.status ?? 'open',
})

const num = (v: string, min: number) => Math.max(min, Number(v) || 0)

export function RequestDrawer() {
  const target = useUiStore((s) => s.requestDrawer)
  const close = useUiStore((s) => s.closeRequest)
  const openCard = useUiStore((s) => s.openCard)
  const setView = useUiStore((s) => s.setView)
  const requests = useAppStore((s) => s.requests)
  const members = useAppStore((s) => s.members)
  const weights = useAppStore((s) => s.settings.weights)
  const { addRequest, updateRequest, deleteRequest, promoteRequest, addComment } = useAppStore.getState()

  const request = target && target !== 'new' ? requests.find((r) => r.id === target) : undefined
  const [draft, setDraft] = useState<Draft>(toDraft())
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setConfirmDelete(false)
    setDraft(toDraft(target && target !== 'new' ? useAppStore.getState().requests.find((r) => r.id === target) : undefined))
  }, [target])

  const patch: Partial<FeatureRequest> = {
    title: draft.title.trim(),
    problem: draft.problem,
    customers: splitList(draft.customers),
    reach: num(draft.reach, 0),
    impact: draft.impact,
    confidence: draft.confidence,
    effort: num(draft.effort, 0.5),
    arrAtStake: num(draft.arrAtStake, 0),
    status: draft.status,
  }

  // Live preview of the score as the draft changes.
  const preview = useMemo(() => {
    const id = request?.id ?? '__draft__'
    const base: FeatureRequest = request ?? {
      id,
      title: '',
      problem: '',
      requesterId: '',
      customers: [],
      reach: 1,
      impact: 1,
      confidence: 80,
      effort: 1,
      arrAtStake: 0,
      votes: {},
      status: 'open',
      cardId: null,
      comments: [],
      createdAt: '',
      updatedAt: '',
    }
    const merged = { ...base, ...patch }
    const list = request ? requests.map((r) => (r.id === id ? merged : r)) : [...requests, merged]
    return scoreRequests(list, weights)[id]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, requests, weights, request])

  if (!target || (target !== 'new' && !request)) return null
  const requester = request ? members.find((m) => m.id === request.requesterId) : undefined
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const c = contributions(preview, weights)

  const save = () => {
    if (!draft.title.trim()) return
    if (request) updateRequest(request.id, patch)
    else addRequest({ ...patch, title: draft.title.trim() })
    close()
  }

  const goToCard = (cardId: string) => {
    setView('board')
    openCard(cardId)
  }

  return (
    <Drawer
      open
      onClose={close}
      title={request ? <span className="text-slate-500">Feature request · <span className="font-mono text-xs">{request.id}</span></span> : 'New feature request'}
      footer={
        <>
          {request &&
            (confirmDelete ? (
              <>
                <span className="text-sm text-rose-700">Delete request?</span>
                <button
                  className={btnDanger}
                  onClick={() => {
                    deleteRequest(request.id)
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
              {request ? 'Save changes' : 'Submit request'}
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <input
          autoFocus={!request}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="What should we build?"
          aria-label="Title"
          className="w-full border-0 p-0 text-xl font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0"
        />
        {requester && request && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Avatar member={requester} size="xs" />
            <span>
              Requested by <span className="font-medium text-slate-700">{requester.name}</span>
            </span>
            <RoleBadge member={requester} />
            <span>· {relativeTime(request.createdAt)}</span>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Priority score</span>
            <span>
              <span className="text-2xl font-semibold tabular-nums text-slate-900">{preview.score}</span>
              <span className="text-xs text-slate-400"> / 100</span>
            </span>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <BreakdownRow color={SCORE_COLORS.rice} label="RICE" value={preview.rice.toFixed(1)} points={c.rice} />
            <BreakdownRow color={SCORE_COLORS.votes} label="Team votes" value={`${preview.votes} pts`} points={c.votes} />
            <BreakdownRow color={SCORE_COLORS.revenue} label="Revenue at stake" value={formatCurrency(preview.revenue)} points={c.revenue} />
          </div>
        </div>

        <Field label="Problem & who it's for">
          <textarea className={inputCls} rows={3} value={draft.problem} onChange={(e) => set('problem', e.target.value)} placeholder="What pain are customers or the team feeling? What happens if we don't build it?" />
        </Field>
        <Field label="Requesting customers" hint="Comma separated account names">
          <input className={inputCls} value={draft.customers} onChange={(e) => set('customers', e.target.value)} placeholder="Acme Logistics, Northwind Health" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reach" hint="Accounts or users affected per quarter">
            <input type="number" min={0} className={inputCls} value={draft.reach} onChange={(e) => set('reach', e.target.value)} />
          </Field>
          <Field label="Impact">
            <select className={inputCls} value={draft.impact} onChange={(e) => set('impact', Number(e.target.value) as Impact)}>
              {IMPACT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Confidence">
            <select className={inputCls} value={draft.confidence} onChange={(e) => set('confidence', Number(e.target.value) as Confidence)}>
              <option value={100}>High (100%)</option>
              <option value={80}>Medium (80%)</option>
              <option value={50}>Low (50%)</option>
            </select>
          </Field>
          <Field label="Effort" hint="Person-weeks">
            <input type="number" min={0.5} step={0.5} className={inputCls} value={draft.effort} onChange={(e) => set('effort', e.target.value)} />
          </Field>
          <Field label="ARR at stake (USD)">
            <input type="number" min={0} step={1000} className={inputCls} value={draft.arrAtStake} onChange={(e) => set('arrAtStake', e.target.value)} />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={draft.status} onChange={(e) => set('status', e.target.value as RequestStatus)}>
              {(Object.keys(STATUS_META) as RequestStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {request && (
          <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
            <Kanban className="h-5 w-5 text-indigo-500" />
            <div className="flex-1 text-sm">
              {request.cardId ? (
                <span className="text-indigo-900">On the board. The request ships automatically when its card reaches Done.</span>
              ) : (
                <span className="text-indigo-900">Ready to commit? Promote it to a card in To do.</span>
              )}
            </div>
            {request.cardId ? (
              <button className={btnSecondary} onClick={() => goToCard(request.cardId!)}>
                View card <ArrowUpRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                className={btnPrimary}
                disabled={!ACTIVE_STATUSES.includes(request.status)}
                onClick={() => {
                  const cardId = promoteRequest(request.id)
                  goToCard(cardId)
                }}
              >
                Promote to board
              </button>
            )}
          </div>
        )}
      </div>

      {request && (
        <>
          <hr className="my-6 border-slate-100" />
          <CommentThread comments={request.comments} onAdd={(body) => addComment('request', request.id, body)} />
        </>
      )}
    </Drawer>
  )
}

function BreakdownRow({ color, label, value, points }: { color: string; label: string; value: string; points: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="w-28 text-slate-600">{label}</span>
      <span className="w-20 tabular-nums text-slate-500">{value}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${color}`} style={{ width: `${points}%` }} />
      </div>
      <span className="w-12 text-right font-medium tabular-nums text-slate-700">+{points.toFixed(1)}</span>
    </div>
  )
}
