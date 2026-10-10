import { describe, expect, it } from 'vitest'
import {
  parseMentions,
  rankRequests,
  riceOf,
  scoreRequests,
  totalVotes,
  votesUsed,
} from './scoring'
import type { FeatureRequest, Member } from './types'

const request = (
  id: string,
  overrides: Partial<FeatureRequest> = {},
): FeatureRequest => ({
  id,
  title: id,
  problem: '',
  requesterId: 'member-1',
  customers: [],
  reach: 1,
  impact: 1,
  confidence: 100,
  effort: 1,
  arrAtStake: 0,
  votes: {},
  status: 'open',
  cardId: null,
  comments: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
})

describe('scoring', () => {
  it('calculates RICE with an effort floor of 0.5', () => {
    expect(
      riceOf(request('normal', { reach: 10, impact: 2, confidence: 80, effort: 4 })),
    ).toBe(4)
    expect(riceOf(request('small-effort', { reach: 10, impact: 2, effort: 0 }))).toBe(40)
    expect(totalVotes(request('votes', { votes: { a: 2, b: 3 } }))).toBe(5)
  })

  it('normalizes against active requests only', () => {
    const active = request('active', { arrAtStake: 100, votes: { a: 2 } })
    const lower = request('lower', { arrAtStake: 50, votes: { a: 1 }, reach: 0.5 })
    const shipped = request('shipped', {
      arrAtStake: 1000000,
      reach: 1000000,
      votes: { a: 1000 },
      status: 'shipped',
    })
    const scores = scoreRequests([active, lower, shipped], {
      rice: 1,
      votes: 0,
      revenue: 0,
    })

    expect(scores.active.revenueNorm).toBe(1)
    expect(scores.lower.revenueNorm).toBe(0.5)
    expect(scores.shipped.revenueNorm).toBe(1)
    expect(scores.active.votesNorm).toBe(1)
    expect(scores.lower.votesNorm).toBe(0.5)
    expect(votesUsed([active, lower, shipped], 'a')).toBe(3)
  })

  it('normalizes weights by their sum and uses equal weights when the sum is zero', () => {
    const riceOnly = request('rice', { reach: 3, votes: {}, arrAtStake: 0 })
    const votesOnly = request('votes', {
      reach: 0,
      votes: { a: 1 },
      arrAtStake: 0,
    })
    const weights = scoreRequests([riceOnly, votesOnly], {
      rice: 5,
      votes: 0,
      revenue: 0,
    })
    const equal = scoreRequests([riceOnly, votesOnly], {
      rice: 0,
      votes: 0,
      revenue: 0,
    })

    expect(weights.rice.score).toBe(100)
    expect(weights.votes.score).toBe(0)
    expect(equal.rice.score).toBe(33)
    expect(equal.votes.score).toBe(33)
  })

  it('ranks active requests first and uses score, votes, then creation time as tie-breakers', () => {
    const oldest = request('oldest', {
      reach: 2,
      votes: { a: 1 },
      createdAt: '2025-01-01T00:00:00.000Z',
    })
    const moreVotes = request('more-votes', {
      reach: 2,
      votes: { a: 2 },
      createdAt: '2025-01-03T00:00:00.000Z',
    })
    const shipped = request('shipped', {
      reach: 100,
      status: 'shipped',
      createdAt: '2024-01-01T00:00:00.000Z',
    })
    const ranked = rankRequests([oldest, shipped, moreVotes], {
      rice: 1,
      votes: 0,
      revenue: 0,
    })

    expect(ranked.map((item) => item.request.id)).toEqual([
      'more-votes',
      'oldest',
      'shipped',
    ])
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3])
  })

  it('parses case-insensitive first-name mentions, dedupes, and excludes email addresses', () => {
    const members: Member[] = [
      {
        id: 'alice',
        name: 'Alice Chen',
        role: 'engineer',
        title: 'Engineer',
        initials: 'AC',
        avatarColor: '#000000',
      },
      {
        id: 'avery',
        name: 'Avery Kim',
        role: 'fde',
        title: 'FDE',
        initials: 'AK',
        avatarColor: '#000000',
      },
    ]

    expect(parseMentions('@ALICE, @alice a@b.com and @Avery!', members)).toEqual([
      'alice',
      'avery',
    ])
  })
})
