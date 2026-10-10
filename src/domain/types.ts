export type Role = 'fde' | 'engineer' | 'lead'

export interface Member {
  id: string
  name: string
  role: Role
  title: string
  initials: string
  avatarColor: string // tailwind-independent hex, e.g. '#6366f1'
}

export type ColumnId = 'todo' | 'doing' | 'done'

export const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' },
]

export type CardType = 'task' | 'bug' | 'escalation' | 'feature'
export type Priority = 'urgent' | 'high' | 'medium' | 'low'

export interface Comment {
  id: string
  authorId: string
  body: string
  createdAt: string // ISO
}

export interface Card {
  id: string
  title: string
  description: string
  column: ColumnId
  type: CardType
  priority: Priority
  assigneeId: string | null
  reporterId: string
  customer: string // '' when internal
  labels: string[]
  dueDate: string | null // YYYY-MM-DD
  blocked: boolean
  blockedReason: string
  comments: Comment[]
  requestId: string | null // feature request this card was promoted from
  createdAt: string
  updatedAt: string
}

export type RequestStatus = 'open' | 'planned' | 'shipped' | 'declined'
export type Impact = 0.25 | 0.5 | 1 | 2 | 3
export type Confidence = 50 | 80 | 100

export interface FeatureRequest {
  id: string
  title: string
  problem: string
  requesterId: string
  customers: string[] // accounts asking for it
  reach: number // accounts/users affected per quarter
  impact: Impact
  confidence: Confidence
  effort: number // person-weeks, > 0
  arrAtStake: number // USD
  votes: Record<string, number> // memberId -> points
  status: RequestStatus
  cardId: string | null
  comments: Comment[]
  createdAt: string
  updatedAt: string
}

export type ActivityKind =
  | 'card_created'
  | 'card_moved'
  | 'card_updated'
  | 'card_deleted'
  | 'comment_added'
  | 'request_created'
  | 'request_voted'
  | 'request_promoted'
  | 'request_status'

export interface Activity {
  id: string
  kind: ActivityKind
  actorId: string
  targetType: 'card' | 'request'
  targetId: string
  targetTitle: string
  detail: string // human readable, e.g. 'moved to Doing'
  mentions: string[] // member ids mentioned
  createdAt: string
}

export interface ScoringWeights {
  rice: number
  votes: number
  revenue: number
}

export interface Settings {
  doingWipLimit: number // 0 = no limit
  voteBudget: number // points per member across active (open|planned) requests
  maxVotesPerRequest: number
  weights: ScoringWeights
}

export interface AppData {
  version: 1
  members: Member[]
  currentUserId: string
  cards: Card[]
  columnOrder: Record<ColumnId, string[]>
  requests: FeatureRequest[]
  activity: Activity[] // newest first, capped at 200
  lastSeen: Record<string, string> // memberId -> ISO of last inbox view
  settings: Settings
}
