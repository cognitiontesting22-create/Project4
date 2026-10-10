import { describe, expect, it } from 'vitest'
import { keyboardMoveTarget } from './keyboard'

const order = {
  todo: ['a', 'b'],
  doing: ['c', 'd', 'e'],
  done: ['f'],
}

describe('keyboardMoveTarget', () => {
  it('moves up and down within a column', () => {
    expect(keyboardMoveTarget(order, 'd', 'up')).toEqual({ to: 'doing', toIndex: 0 })
    expect(keyboardMoveTarget(order, 'd', 'down')).toEqual({ to: 'doing', toIndex: 2 })
  })

  it('moves left and right to adjacent columns at the same clamped index', () => {
    expect(keyboardMoveTarget(order, 'd', 'left')).toEqual({ to: 'todo', toIndex: 1 })
    expect(keyboardMoveTarget(order, 'b', 'right')).toEqual({ to: 'doing', toIndex: 1 })
    expect(keyboardMoveTarget(order, 'e', 'right')).toEqual({ to: 'done', toIndex: 1 })
  })

  it('returns null at column edges and for unknown cards', () => {
    expect(keyboardMoveTarget(order, 'a', 'up')).toBeNull()
    expect(keyboardMoveTarget(order, 'c', 'up')).toBeNull()
    expect(keyboardMoveTarget(order, 'b', 'down')).toBeNull()
    expect(keyboardMoveTarget(order, 'e', 'down')).toBeNull()
    expect(keyboardMoveTarget(order, 'f', 'down')).toBeNull()
    expect(keyboardMoveTarget(order, 'a', 'left')).toBeNull()
    expect(keyboardMoveTarget(order, 'f', 'right')).toBeNull()
    expect(keyboardMoveTarget(order, 'missing', 'up')).toBeNull()
  })
})
