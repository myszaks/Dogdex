export type CompetitionScalar = string | number | boolean | null

export type CompetitionFieldType = 'number' | 'duration_ms' | 'text' | 'boolean'

export interface CompetitionFieldDefinition {
  id: string
  label: string
  type: CompetitionFieldType
  required?: boolean
  unit?: string
  min?: number
  max?: number
  precision?: number
}

export type CompetitionExpression =
  | { op: 'literal'; value: CompetitionScalar }
  | { op: 'ref'; path: string }
  | {
      op: 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max' | 'sum' | 'average'
      args: CompetitionExpression[]
    }
  | { op: 'coalesce'; args: CompetitionExpression[] }
  | { op: 'round'; value: CompetitionExpression; precision?: number }
  | {
      op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
      left: CompetitionExpression
      right: CompetitionExpression
    }
  | { op: 'and' | 'or'; args: CompetitionExpression[] }
  | { op: 'not'; value: CompetitionExpression }
  | {
      op: 'if'
      condition: CompetitionExpression
      then: CompetitionExpression
      else: CompetitionExpression
    }

export interface CompetitionStageDefinition {
  id: string
  label: string
  attempts: Array<{
    id: string
    label: string
  }>
}

export interface CompetitionStatusDefinition {
  id: string
  label: string
  kind: 'valid' | 'excluded' | 'rank_last'
}

export interface CompetitionComputedFieldDefinition {
  id: string
  label: string
  type: CompetitionFieldType
  expression: CompetitionExpression
  unit?: string
  precision?: number
}

export interface CompetitionGroupDefinition {
  id: string
  label: string
  source: CompetitionExpression
  buckets?: Array<{
    key: string
    label: string
    min?: number
    max?: number
  }>
}

export interface CompetitionRankingDefinition {
  id: string
  label: string
  groupBy: string[]
  eligibility?: CompetitionExpression
  orderBy: Array<{
    expression: CompetitionExpression
    direction: 'asc' | 'desc'
    nulls?: 'first' | 'last'
  }>
  ties: 'competition' | 'dense' | 'ordinal'
}

export type CompetitionViewBlockType =
  | 'current_entry'
  | 'next_up'
  | 'result_table'
  | 'leaderboard'
  | 'podium'
  | 'metric'
  | 'progress'
  | 'message'

export interface CompetitionViewBlockDefinition {
  id: string
  type: CompetitionViewBlockType
  title?: string
  rankingId?: string
  fields?: string[]
  limit?: number
  options?: Record<string, CompetitionScalar>
}

export interface CompetitionViewDefinition {
  id: string
  label: string
  kind: 'live' | 'results'
  blocks: CompetitionViewBlockDefinition[]
}

export interface CompetitionFormatDefinition {
  schemaVersion: 1
  name: string
  eventFields: CompetitionFieldDefinition[]
  resultFields: CompetitionFieldDefinition[]
  stages: CompetitionStageDefinition[]
  statuses: CompetitionStatusDefinition[]
  computedFields: CompetitionComputedFieldDefinition[]
  groups: CompetitionGroupDefinition[]
  rankings: CompetitionRankingDefinition[]
  views: CompetitionViewDefinition[]
}

export interface CompetitionAttemptInput {
  stageId: string
  attemptId: string
  status: string | null
  values: Record<string, CompetitionScalar>
}

export interface CompetitionEntrantInput {
  participantId: string
  event: Record<string, unknown>
  participant: Record<string, unknown>
  registration: Record<string, unknown>
  attempts: CompetitionAttemptInput[]
}

export interface CompetitionCalculatedRow {
  participantId: string
  computed: Record<string, CompetitionScalar>
  groups: Record<string, string | null>
  ranks: Record<string, number | null>
}
