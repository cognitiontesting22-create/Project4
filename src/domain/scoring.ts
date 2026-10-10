import type {
  FeatureRequest,
  Member,
  RequestStatus,
  ScoringWeights,
} from './types'

export const ACTIVE_STATUSES: RequestStatus[] = ['open', 'planned']

export interface ScoreBreakdown {
  rice: number
  riceNorm: number
  votes: number
  votesNorm: number
  revenue: number
  revenueNorm: number
  score: number
}

export function riceOf(request: FeatureRequest): number {
  return (
    (request.reach * request.impact * (request.confidence / 100)) /
    Math.max(request.effort, 0.5)
  )
}

export function totalVotes(request: FeatureRequest): number {
  return Object.values(request.votes).reduce((total, points) => total + points, 0)
}

export function scoreRequests(
  requests: FeatureRequest[],
  weights: ScoringWeights,
): Record<string, ScoreBreakdown> {
  const activeRequests = requests.filter((request) =>
    ACTIVE_STATUSES.includes(request.status),
  )
  const maxRice = Math.max(0, ...activeRequests.map(riceOf))
  const maxVotes = Math.max(0, ...activeRequests.map(totalVotes))
  const maxRevenue = Math.max(0, ...activeRequests.map((request) => request.arrAtStake))
  const weightSum = weights.rice + weights.votes + weights.revenue
  const normalizedWeights =
    weightSum <= 0
      ? { rice: 1 / 3, votes: 1 / 3, revenue: 1 / 3 }
      : {
          rice: weights.rice / weightSum,
          votes: weights.votes / weightSum,
          revenue: weights.revenue / weightSum,
        }

  return Object.fromEntries(
    requests.map((request) => {
      const rice = riceOf(request)
      const votes = totalVotes(request)
      const revenue = request.arrAtStake
      const riceNorm = maxRice === 0 ? 0 : clamp(rice / maxRice)
      const votesNorm = maxVotes === 0 ? 0 : clamp(votes / maxVotes)
      const revenueNorm = maxRevenue === 0 ? 0 : clamp(revenue / maxRevenue)
      const score = Math.round(
        100 *
          (normalizedWeights.rice * riceNorm +
            normalizedWeights.votes * votesNorm +
            normalizedWeights.revenue * revenueNorm),
      )

      return [
        request.id,
        { rice, riceNorm, votes, votesNorm, revenue, revenueNorm, score },
      ]
    }),
  )
}

export function rankRequests(
  requests: FeatureRequest[],
  weights: ScoringWeights,
): { request: FeatureRequest; breakdown: ScoreBreakdown; rank: number }[] {
  const breakdowns = scoreRequests(requests, weights)

  return [...requests]
    .sort((a, b) => {
      const aIsActive = ACTIVE_STATUSES.includes(a.status)
      const bIsActive = ACTIVE_STATUSES.includes(b.status)

      if (aIsActive !== bIsActive) return aIsActive ? -1 : 1
      const scoreDifference = breakdowns[b.id].score - breakdowns[a.id].score
      if (scoreDifference !== 0) return scoreDifference
      const voteDifference = totalVotes(b) - totalVotes(a)
      if (voteDifference !== 0) return voteDifference
      return a.createdAt.localeCompare(b.createdAt)
    })
    .map((request, index) => ({
      request,
      breakdown: breakdowns[request.id],
      rank: index + 1,
    }))
}

export function votesUsed(requests: FeatureRequest[], memberId: string): number {
  return requests.reduce(
    (total, request) =>
      total +
      (ACTIVE_STATUSES.includes(request.status) ? request.votes[memberId] ?? 0 : 0),
    0,
  )
}

export function parseMentions(body: string, members: Member[]): string[] {
  const mentioned = new Set<string>()

  for (const member of members) {
    const firstName = member.name.trim().split(/\s+/)[0]
    if (!firstName) continue
    const escapedName = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const mentionPattern = new RegExp(`(?<![\\w.+-])@${escapedName}\\b`, 'i')
    if (mentionPattern.test(body)) mentioned.add(member.id)
  }

  return [...mentioned]
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
