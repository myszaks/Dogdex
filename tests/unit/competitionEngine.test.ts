import { describe, expect, it } from 'vitest'
import {
  calculateCompetitionResults,
  evaluateCompetitionExpression,
  validateCompetitionFormatDefinition,
} from '@/lib/competitionEngine'
import { TIME_TRIAL_FORMAT } from '@/lib/competitionPresets'

describe('competition engine', () => {
  it('evaluates formulas without executing organizer-provided code', () => {
    const result = evaluateCompetitionExpression({
      op: 'round',
      precision: 2,
      value: {
        op: 'divide',
        args: [
          { op: 'literal', value: 10 },
          { op: 'literal', value: 3 },
        ],
      },
    }, {})

    expect(result).toBe(3.33)
  })

  it('projects attempt values and calculates derived metrics', () => {
    const rows = calculateCompetitionResults(TIME_TRIAL_FORMAT, [
      {
        participantId: 'dog-1',
        event: { distance_m: 100 },
        participant: {},
        registration: {},
        attempts: [
          { stageId: 'main', attemptId: 'run_1', status: null, values: { time_ms: 5000 } },
          { stageId: 'main', attemptId: 'run_2', status: null, values: { time_ms: 4800 } },
        ],
      },
    ])

    expect(rows[0].computed.best_time_ms).toBe(4800)
    expect(rows[0].computed.speed_kmh).toBe(75)
    expect(rows[0].ranks.overall).toBe(1)
  })

  it('applies competition ranking and leaves ineligible rows unranked', () => {
    const entrant = (participantId: string, time: number | null) => ({
      participantId,
      event: { distance_m: 100 },
      participant: {},
      registration: {},
      attempts: [
        { stageId: 'main', attemptId: 'run_1', status: time === null ? 'dnf' : null, values: { time_ms: time } },
      ],
    })

    const rows = calculateCompetitionResults(TIME_TRIAL_FORMAT, [
      entrant('dog-a', 5000),
      entrant('dog-b', 4800),
      entrant('dog-c', 4800),
      entrant('dog-d', null),
    ])
    const byId = Object.fromEntries(rows.map(row => [row.participantId, row]))

    expect(byId['dog-b'].ranks.overall).toBe(1)
    expect(byId['dog-c'].ranks.overall).toBe(1)
    expect(byId['dog-a'].ranks.overall).toBe(3)
    expect(byId['dog-d'].ranks.overall).toBeNull()
  })

  it('validates references used by view blocks and rejects unknown operations', () => {
    expect(validateCompetitionFormatDefinition(TIME_TRIAL_FORMAT).success).toBe(true)

    const invalid = structuredClone(TIME_TRIAL_FORMAT) as unknown as Record<string, unknown>
    const computedFields = invalid.computedFields as Array<Record<string, unknown>>
    computedFields[0].expression = { op: 'execute_javascript', source: 'process.exit()' }
    const result = validateCompetitionFormatDefinition(invalid)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some(issue => issue.message.includes('Nieobsługiwany operator'))).toBe(true)
    }
  })

  it('resolves computed dependencies regardless of field order', () => {
    const definition = structuredClone(TIME_TRIAL_FORMAT)
    definition.computedFields = [...definition.computedFields].reverse()

    const [row] = calculateCompetitionResults(definition, [{
      participantId: 'dog-1',
      event: { distance_m: 100 },
      participant: {},
      registration: {},
      attempts: [
        { stageId: 'main', attemptId: 'run_1', status: null, values: { time_ms: 5000 } },
      ],
    }])

    expect(row.computed.best_time_ms).toBe(5000)
    expect(row.computed.speed_kmh).toBe(72)
  })

  it('rejects cyclic computed fields', () => {
    const definition = structuredClone(TIME_TRIAL_FORMAT)
    definition.computedFields = [
      {
        id: 'first',
        label: 'Pierwsza',
        type: 'number',
        expression: { op: 'ref', path: 'computed.second' },
      },
      {
        id: 'second',
        label: 'Druga',
        type: 'number',
        expression: { op: 'ref', path: 'computed.first' },
      },
    ]
    definition.rankings[0].orderBy[0].expression = { op: 'ref', path: 'computed.first' }
    const result = validateCompetitionFormatDefinition(definition)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some(issue => issue.message.includes('cykliczną'))).toBe(true)
    }
  })
})
