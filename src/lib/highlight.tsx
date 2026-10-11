import type { ReactNode } from 'react'

export function highlight(text: string, query: string): ReactNode {
  const trimmed = query.trim()
  if (!trimmed) return text

  const expression = new RegExp(escapeRegExp(trimmed), 'gi')
  const parts: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = expression.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index))
    parts.push(
      <mark key={match.index} className="rounded bg-yellow-200/80 px-0.5 text-inherit">
        {match[0]}
      </mark>,
    )
    cursor = match.index + match[0].length
  }
  if (cursor === 0) return text
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

export function descriptionSnippet(text: string, query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return text
  const index = text.toLocaleLowerCase().indexOf(trimmed.toLocaleLowerCase())
  if (index < 0) return text

  const maxLength = 88
  const start = Math.max(0, index - Math.floor((maxLength - trimmed.length) / 2))
  const end = Math.min(text.length, start + maxLength)
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
