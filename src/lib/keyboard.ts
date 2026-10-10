import type { ColumnId } from '../domain/types'

export type MoveDir = 'up' | 'down' | 'left' | 'right'

const COLUMNS: ColumnId[] = ['todo', 'doing', 'done']

export function keyboardMoveTarget(
  columnOrder: Record<ColumnId, string[]>,
  cardId: string,
  dir: MoveDir,
): { to: ColumnId; toIndex: number } | null {
  const from = COLUMNS.find((column) => columnOrder[column].includes(cardId))
  if (!from) return null
  const index = columnOrder[from].indexOf(cardId)

  if (dir === 'up' || dir === 'down') {
    const toIndex = dir === 'up' ? index - 1 : index + 1
    if (toIndex < 0 || toIndex >= columnOrder[from].length) return null
    return { to: from, toIndex }
  }

  const fromColumnIndex = COLUMNS.indexOf(from)
  const to = COLUMNS[fromColumnIndex + (dir === 'left' ? -1 : 1)]
  if (!to) return null
  return { to, toIndex: Math.min(index, columnOrder[to].length) }
}
