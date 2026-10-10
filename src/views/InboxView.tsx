import clsx from 'clsx'
import { AtSign } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Avatar, RoleBadge } from '../components/Avatar'
import type { Activity } from '../domain/types'
import { isRelevantTo } from '../lib/inbox'
import { relativeTime } from '../lib/meta'
import { useUiStore } from '../lib/ui-store'
import { useAppStore } from '../store/useAppStore'

export function InboxView() {
  const activity = useAppStore((s) => s.activity)
  const cards = useAppStore((s) => s.cards)
  const requests = useAppStore((s) => s.requests)
  const members = useAppStore((s) => s.members)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const markInboxSeen = useAppStore((s) => s.markInboxSeen)
  const { openCard, openRequest } = useUiStore.getState()
  const [tab, setTab] = useState<'mine' | 'all'>('mine')
  // Snapshot of lastSeen when the inbox was opened, so unread markers stay visible while reading.
  const [seenAt] = useState(() => useAppStore.getState().lastSeen[currentUserId] ?? '')

  useEffect(() => {
    markInboxSeen()
  }, [currentUserId, markInboxSeen])

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const items = tab === 'mine' ? activity.filter((a) => isRelevantTo(a, currentUserId, cards)) : activity

  const open = (a: Activity) => {
    if (a.targetType === 'card' && cards.some((c) => c.id === a.targetId)) openCard(a.targetId)
    if (a.targetType === 'request' && requests.some((r) => r.id === a.targetId)) openRequest(a.targetId)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-8 pb-0 pt-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Inbox</h1>
        <p className="mt-1 text-sm text-slate-500">Mentions and updates on work you own or reported.</p>
        <nav className="mt-4 flex gap-1">
          {(
            [
              ['mine', 'For you'],
              ['all', 'All activity'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <ol className="mx-auto max-w-3xl divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {items.map((a) => {
            const actor = memberById.get(a.actorId)
            const unread = a.createdAt > seenAt && a.actorId !== currentUserId
            const mentioned = a.mentions.includes(currentUserId)
            const exists = a.targetType === 'card' ? cards.some((c) => c.id === a.targetId) : requests.some((r) => r.id === a.targetId)
            return (
              <li key={a.id}>
                <button onClick={() => open(a)} disabled={!exists} className={clsx('flex w-full gap-3 px-5 py-4 text-left', exists && 'hover:bg-slate-50', unread && 'bg-indigo-50/40')}>
                  <Avatar member={actor} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                      <span className="font-semibold text-slate-900">{actor?.name ?? 'Someone'}</span>
                      {actor && <RoleBadge member={actor} />}
                      <span className="text-slate-600">{a.detail}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-px font-medium uppercase tracking-wide text-[10px] text-slate-500">{a.targetType === 'card' ? 'Card' : 'Request'}</span>
                      <span className={clsx('truncate', exists ? 'text-slate-700' : 'text-slate-400 line-through')}>{a.targetTitle}</span>
                      {mentioned && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-indigo-100 px-1.5 py-px text-[10px] font-semibold text-indigo-700">
                          <AtSign className="h-3 w-3" />
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs text-slate-400">{relativeTime(a.createdAt)}</span>
                    {unread && <span className="h-2 w-2 rounded-full bg-indigo-500" aria-label="Unread" />}
                  </div>
                </button>
              </li>
            )
          })}
          {items.length === 0 && <li className="px-5 py-12 text-center text-sm text-slate-400">You're all caught up.</li>}
        </ol>
      </div>
    </div>
  )
}
