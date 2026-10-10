import clsx from 'clsx'
import { Building, ChevronDown, ChevronUp, Info, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar, RoleBadge } from '../components/Avatar'
import { ACTIVE_STATUSES, rankRequests, totalVotes, votesUsed, type ScoreBreakdown } from '../domain/scoring'
import type { FeatureRequest, RequestStatus, ScoringWeights } from '../domain/types'
import { btnPrimary, contributions, formatCurrency, SCORE_COLORS, STATUS_META } from '../lib/meta'
import { useUiStore } from '../lib/ui-store'
import { useAppStore } from '../store/useAppStore'

type Tab = 'active' | RequestStatus | 'all'
const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'open', label: 'Open' },
  { id: 'planned', label: 'Planned' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'declined', label: 'Declined' },
  { id: 'all', label: 'All' },
]

export function ScoreBar({ breakdown, weights }: { breakdown: ScoreBreakdown; weights: ScoringWeights }) {
  const c = contributions(breakdown, weights)
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <div className={SCORE_COLORS.rice} style={{ width: `${c.rice}%` }} />
      <div className={SCORE_COLORS.votes} style={{ width: `${c.votes}%` }} />
      <div className={SCORE_COLORS.revenue} style={{ width: `${c.revenue}%` }} />
    </div>
  )
}

export function RequestsView() {
  const requests = useAppStore((s) => s.requests)
  const members = useAppStore((s) => s.members)
  const settings = useAppStore((s) => s.settings)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const openRequest = useUiStore((s) => s.openRequest)
  const [tab, setTab] = useState<Tab>('active')

  const ranked = useMemo(() => rankRequests(requests, settings.weights), [requests, settings.weights])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const used = votesUsed(requests, currentUserId)
  const remaining = Math.max(0, settings.voteBudget - used)
  const rows = ranked.filter(({ request: r }) => (tab === 'all' ? true : tab === 'active' ? ACTIVE_STATUSES.includes(r.status) : r.status === tab))
  const totalArr = requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).reduce((n, r) => n + r.arrAtStake, 0)
  const w = settings.weights
  const wSum = w.rice + w.votes + w.revenue || 1

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-8 pb-0 pt-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Feature requests</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Ranked by a transparent priority score. {formatCurrency(totalArr)} ARR is attached to active requests.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-48">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-600">Your vote points</span>
                <span className={clsx('font-semibold', remaining === 0 ? 'text-rose-600' : 'text-slate-900')}>
                  {remaining} / {settings.voteBudget} left
                </span>
              </div>
              <div className="mt-1.5 flex gap-0.5">
                {Array.from({ length: settings.voteBudget }, (_, i) => (
                  <span key={i} className={clsx('h-1.5 flex-1 rounded-full', i < used ? 'bg-sky-400' : 'bg-slate-200')} />
                ))}
              </div>
            </div>
            <button className={btnPrimary} onClick={() => openRequest('new')}>
              <Plus className="h-4 w-4" />
              New request
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-inset ring-slate-200">
          <Info className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            <strong className="font-semibold text-slate-800">Score</strong> = 
          </span>
          <Legend color={SCORE_COLORS.rice} label={`RICE ${Math.round((100 * w.rice) / wSum)}%`} hint="Reach × Impact × Confidence ÷ Effort" />
          <Legend color={SCORE_COLORS.votes} label={`Team votes ${Math.round((100 * w.votes) / wSum)}%`} hint={`Each person spends ${settings.voteBudget} points, max ${settings.maxVotesPerRequest} per request`} />
          <Legend color={SCORE_COLORS.revenue} label={`Revenue ${Math.round((100 * w.revenue) / wSum)}%`} hint="ARR at stake from requesting customers" />
          <span className="ml-auto text-slate-400">Each factor is scaled against the top active request</span>
        </div>
        <nav className="mt-3 flex gap-1" aria-label="Status">
          {TABS.map((t) => {
            const count = t.id === 'all' ? requests.length : t.id === 'active' ? requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length : requests.filter((r) => r.status === t.id).length
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                  tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800',
                )}
              >
                {t.label} <span className="ml-0.5 text-xs text-slate-400">{count}</span>
              </button>
            )
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[3.5rem_1fr_9rem_7rem_8.5rem] items-center gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Rank</span>
            <span>Request</span>
            <span>Score</span>
            <span className="text-right">ARR at stake</span>
            <span className="text-center">Your vote</span>
          </div>
          <ol>
            {rows.map(({ request, breakdown, rank }) => (
              <RequestRow
                key={request.id}
                request={request}
                breakdown={breakdown}
                rank={ACTIVE_STATUSES.includes(request.status) ? rank : null}
                requester={memberById.get(request.requesterId)}
                weights={settings.weights}
                myVotes={request.votes[currentUserId] ?? 0}
                canAdd={remaining > 0 && (request.votes[currentUserId] ?? 0) < settings.maxVotesPerRequest && ACTIVE_STATUSES.includes(request.status)}
                onOpen={() => openRequest(request.id)}
              />
            ))}
            {rows.length === 0 && <li className="px-5 py-12 text-center text-sm text-slate-400">No requests here yet.</li>}
          </ol>
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label, hint }: { color: string; label: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={hint}>
      <span className={clsx('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  )
}

function RequestRow({
  request,
  breakdown,
  rank,
  requester,
  weights,
  myVotes,
  canAdd,
  onOpen,
}: {
  request: FeatureRequest
  breakdown: ScoreBreakdown
  rank: number | null
  requester?: ReturnType<typeof useAppStore.getState>['members'][number]
  weights: ScoringWeights
  myVotes: number
  canAdd: boolean
  onOpen: () => void
}) {
  const setVote = useAppStore((s) => s.setVote)
  const active = ACTIVE_STATUSES.includes(request.status)
  return (
    <li className="group grid grid-cols-[3.5rem_1fr_9rem_7rem_8.5rem] items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-0 hover:bg-slate-50/70">
      <span className={clsx('text-lg font-semibold tabular-nums', rank === 1 ? 'text-indigo-600' : rank ? 'text-slate-400' : 'text-slate-300')}>{rank ? `#${rank}` : '—'}</span>
      <button onClick={onOpen} className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-700">{request.title}</span>
          <span className={clsx('shrink-0 rounded-md px-1.5 py-px text-[11px] font-medium ring-1 ring-inset', STATUS_META[request.status].className)}>{STATUS_META[request.status].label}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {requester && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar member={requester} size="xs" />
              {requester.name}
              <RoleBadge member={requester} />
            </span>
          )}
          {request.customers.slice(0, 3).map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-800">
              <Building className="h-3 w-3" />
              {c}
            </span>
          ))}
          {request.customers.length > 3 && <span>+{request.customers.length - 3} more</span>}
          <span>{request.comments.length} {request.comments.length === 1 ? 'comment' : 'comments'}</span>
        </div>
      </button>
      <div title={`RICE ${breakdown.rice.toFixed(1)} · ${breakdown.votes} votes · ${formatCurrency(breakdown.revenue)} ARR`}>
        <div className="mb-1.5 flex items-baseline gap-1">
          <span className={clsx('text-xl font-semibold tabular-nums', active ? 'text-slate-900' : 'text-slate-400')}>{breakdown.score}</span>
          <span className="text-xs text-slate-400">/ 100</span>
        </div>
        <ScoreBar breakdown={breakdown} weights={weights} />
      </div>
      <span className="text-right text-sm font-medium tabular-nums text-slate-700">{request.arrAtStake ? formatCurrency(request.arrAtStake) : '—'}</span>
      <div className="flex items-center justify-center gap-1">
        <button
          aria-label="Remove a vote point"
          disabled={!active || myVotes === 0}
          onClick={() => setVote(request.id, myVotes - 1)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <div className="w-12 text-center">
          <div className={clsx('text-sm font-semibold tabular-nums', myVotes ? 'text-sky-600' : 'text-slate-400')}>{myVotes}</div>
          <div className="text-[10px] text-slate-400">{totalVotes(request)} total</div>
        </div>
        <button
          aria-label="Add a vote point"
          disabled={!canAdd}
          onClick={() => setVote(request.id, myVotes + 1)}
          className="rounded-md p-1 text-slate-400 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}
