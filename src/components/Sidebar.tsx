import clsx from 'clsx'
import { Archive, ChevronsUpDown, Inbox, Kanban, Settings, Trophy, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isRelevantTo } from '../lib/inbox'
import { ROLE_META } from '../lib/meta'
import { useUiStore, type View } from '../lib/ui-store'
import { useAppStore } from '../store/useAppStore'
import { Avatar } from './Avatar'

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'board', label: 'Board', icon: Kanban },
  { view: 'requests', label: 'Feature requests', icon: Trophy },
  { view: 'inbox', label: 'Inbox', icon: Inbox },
  { view: 'archive', label: 'Archive', icon: Archive },
  { view: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const activity = useAppStore((s) => s.activity)
  const cards = useAppStore((s) => s.cards)
  const members = useAppStore((s) => s.members)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const lastSeen = useAppStore((s) => s.lastSeen[s.currentUserId])
  const requests = useAppStore((s) => s.requests)

  const unread = useMemo(
    () => activity.filter((a) => (!lastSeen || a.createdAt > lastSeen) && isRelevantTo(a, currentUserId, cards)).length,
    [activity, lastSeen, currentUserId, cards],
  )
  const openRequests = requests.filter((r) => r.status === 'open').length

  return (
    <nav className="flex w-60 shrink-0 flex-col bg-slate-950 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
          R
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Relay</div>
          <div className="text-[11px] text-slate-500">Engineering workspace</div>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 px-3">
        {NAV.map(({ view: v, label, icon: Icon }) => {
          const badge = v === 'inbox' ? unread : v === 'requests' ? openRequests : 0
          return (
            <li key={v}>
              <button
                onClick={() => setView(v)}
                aria-current={view === v ? 'page' : undefined}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  view === v ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{label}</span>
                {badge > 0 && (
                  <span
                    className={clsx(
                      'rounded-full px-1.5 py-px text-[10px] font-semibold',
                      v === 'inbox' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-slate-300',
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-auto border-t border-white/5 p-3">
        <UserSwitcher members={members} currentUserId={currentUserId} />
      </div>
    </nav>
  )
}

function UserSwitcher({ members, currentUserId }: { members: ReturnType<typeof useAppStore.getState>['members']; currentUserId: string }) {
  const setCurrentUser = useAppStore((s) => s.setCurrentUser)
  const [open, setOpen] = useState(false)
  const me = members.find((m) => m.id === currentUserId)
  return (
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul role="listbox" className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900 py-1 shadow-xl">
            <li className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Act as</li>
            {members.map((m) => (
              <li key={m.id}>
                <button
                  role="option"
                  aria-selected={m.id === currentUserId}
                  onClick={() => {
                    setCurrentUser(m.id)
                    setOpen(false)
                  }}
                  className={clsx('flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-white/5', m.id === currentUserId && 'bg-white/5')}
                >
                  <Avatar member={m} size="xs" className="ring-slate-900" />
                  <span className="flex-1 truncate text-xs text-slate-200">{m.name}</span>
                  <span className="text-[10px] text-slate-500">{ROLE_META[m.role].short}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/5">
        <Avatar member={me} className="ring-slate-950" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{me?.name}</div>
          <div className="truncate text-[11px] text-slate-500">{me && `${me.title} · ${ROLE_META[me.role].short}`}</div>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-slate-500" />
      </button>
    </div>
  )
}
