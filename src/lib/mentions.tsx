import type { Member } from '../domain/types'

export function renderWithMentions(body: string, members: Member[]) {
  const names = new Set(members.map((m) => m.name.split(' ')[0].toLowerCase()))
  return body.split(/(@[A-Za-z]+)/g).map((part, i) =>
    part.startsWith('@') && names.has(part.slice(1).toLowerCase()) ? (
      <span key={i} className="rounded bg-indigo-50 px-0.5 font-medium text-indigo-700">
        {part}
      </span>
    ) : (
      part
    ),
  )
}
