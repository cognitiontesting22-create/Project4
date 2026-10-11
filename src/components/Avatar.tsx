import clsx from 'clsx'
import type { Member } from '../domain/types'
import { ROLE_META } from '../lib/meta'

const SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs' }

export function Avatar({
  member,
  size = 'sm',
  className,
  formerMember = false,
}: {
  member?: Member
  size?: keyof typeof SIZES
  className?: string
  formerMember?: boolean
}) {
  if (!member && formerMember)
    return (
      <span
        title="Former member"
        className={clsx(SIZES[size], 'inline-flex shrink-0 items-center justify-center rounded-full bg-slate-400 font-semibold text-white ring-2 ring-white', className)}
      >
        ?
      </span>
    )
  if (!member)
    return (
      <span
        title="Unassigned"
        className={clsx(SIZES[size], 'inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-slate-400', className)}
      >
        ?
      </span>
    )
  return (
    <span
      title={`${member.name} · ${ROLE_META[member.role].label}`}
      style={{ backgroundColor: member.avatarColor }}
      className={clsx(SIZES[size], 'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white', className)}
    >
      {member.initials}
    </span>
  )
}

export function RoleBadge({ member }: { member: Member }) {
  const meta = ROLE_META[member.role]
  return (
    <span title={meta.label} className={clsx('inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold tracking-wide ring-1 ring-inset', meta.className)}>
      {meta.short}
    </span>
  )
}
