import { AtSign } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Comment } from '../domain/types'
import { renderWithMentions } from '../lib/mentions'
import { btnPrimary, inputCls, relativeTime } from '../lib/meta'
import { useAppStore } from '../store/useAppStore'
import { Avatar, RoleBadge } from './Avatar'

export function CommentThread({ comments, onAdd }: { comments: Comment[]; onAdd: (body: string) => void }) {
  const members = useAppStore((s) => s.members)
  const currentUserId = useAppStore((s) => s.currentUserId)
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const me = byId.get(currentUserId)
  const [body, setBody] = useState('')

  const submit = () => {
    if (!body.trim()) return
    onAdd(body)
    setBody('')
  }

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">
        Discussion <span className="font-normal text-slate-400">· {comments.length}</span>
      </h3>
      <ol className="space-y-4">
        {comments.map((c) => {
          const author = byId.get(c.authorId)
          return (
            <li key={c.id} className="flex gap-3">
              <Avatar member={author} formerMember={!author} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-800">{author?.name ?? 'Former member'}</span>
                  {author && <RoleBadge member={author} />}
                  <span className="text-slate-400">{relativeTime(c.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{renderWithMentions(c.body, members)}</p>
              </div>
            </li>
          )
        })}
        {comments.length === 0 && <li className="text-sm text-slate-400">No discussion yet. Loop in a teammate with @name.</li>}
      </ol>
      <div className="mt-4 flex gap-3">
        <Avatar member={me} />
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            rows={3}
            placeholder="Write a comment… use @name to notify a teammate"
            className={inputCls}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <AtSign className="h-3.5 w-3.5 text-slate-400" />
            {members
              .filter((m) => m.id !== currentUserId)
              .map((m) => {
                const handle = m.name.split(' ')[0]
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}@${handle} `)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                  >
                    {handle}
                  </button>
                )
              })}
            <button type="button" onClick={submit} disabled={!body.trim()} className={`${btnPrimary} ml-auto py-1.5`}>
              Comment
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
