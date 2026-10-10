import { Bug, SquareCheck, Flame, Sparkles, type LucideIcon } from 'lucide-react'
import type { ScoreBreakdown } from '../domain/scoring'
import type { CardType, ColumnId, Impact, Priority, RequestStatus, Role, ScoringWeights } from '../domain/types'

export const ROLE_META: Record<Role, { label: string; short: string; className: string }> = {
  fde: { label: 'Forward Deployed Engineer', short: 'FDE', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  engineer: { label: 'Engineer', short: 'ENG', className: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  lead: { label: 'Lead', short: 'LEAD', className: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
}

export const TYPE_META: Record<CardType, { label: string; icon: LucideIcon; className: string }> = {
  task: { label: 'Task', icon: SquareCheck, className: 'bg-slate-100 text-slate-600' },
  bug: { label: 'Bug', icon: Bug, className: 'bg-rose-50 text-rose-700' },
  escalation: { label: 'Escalation', icon: Flame, className: 'bg-orange-50 text-orange-700' },
  feature: { label: 'Feature', icon: Sparkles, className: 'bg-indigo-50 text-indigo-700' },
}

export const PRIORITY_META: Record<Priority, { label: string; dot: string }> = {
  urgent: { label: 'Urgent', dot: 'bg-rose-500' },
  high: { label: 'High', dot: 'bg-orange-400' },
  medium: { label: 'Medium', dot: 'bg-amber-300' },
  low: { label: 'Low', dot: 'bg-slate-300' },
}

export const STATUS_META: Record<RequestStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  planned: { label: 'Planned', className: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20' },
  shipped: { label: 'Shipped', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  declined: { label: 'Declined', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
}

export const COLUMN_ACCENT: Record<ColumnId, string> = {
  todo: 'bg-slate-400',
  doing: 'bg-indigo-500',
  done: 'bg-emerald-500',
}

export const IMPACT_OPTIONS: { value: Impact; label: string }[] = [
  { value: 3, label: 'Massive (3×)' },
  { value: 2, label: 'High (2×)' },
  { value: 1, label: 'Medium (1×)' },
  { value: 0.5, label: 'Low (0.5×)' },
  { value: 0.25, label: 'Minimal (0.25×)' },
]

export const SCORE_COLORS = { rice: 'bg-indigo-500', votes: 'bg-sky-400', revenue: 'bg-emerald-400' }

export const inputCls =
  'block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500'

export const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50'

export const btnDanger =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500'

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000)
  if (diff < 45) return 'just now'
  const mins = Math.round(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dueState(date: string | null): 'overdue' | 'soon' | 'ok' | null {
  if (!date) return null
  const today = todayISO()
  if (date < today) return 'overdue'
  const diffDays = (new Date(date).getTime() - new Date(today).getTime()) / 86_400_000
  return diffDays <= 2 ? 'soon' : 'ok'
}

export function formatDue(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function contributions(b: ScoreBreakdown, w: ScoringWeights) {
  const sum = w.rice + w.votes + w.revenue
  const [r, v, a] = sum > 0 ? [w.rice / sum, w.votes / sum, w.revenue / sum] : [1 / 3, 1 / 3, 1 / 3]
  return { rice: 100 * r * b.riceNorm, votes: 100 * v * b.votesNorm, revenue: 100 * a * b.revenueNorm }
}

