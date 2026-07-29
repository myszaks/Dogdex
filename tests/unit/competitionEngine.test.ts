import { describe, expect, it } from 'vitest'
import {
  calculateCompetitionResults,
  evaluateCompetitionExpression,
  validateCompetitionFormatDefinition,
} from '@/lib/competitionEngine'
import { groupCompetitionResultsForBlock } from '@/lib/competitionViews'
import {
  SPEEDWAY_FORMAT,
  TIME_TRIAL_FORMAT,
  VERSATILE_DOG_CUP_FORMAT,
} from '@/lib/competitionPresets'
import {
  buildWeightedScoreExpression,
  parseWeightedScoreExpression,
} from '@/lib/competitionFormulaBuilder'
import type { WeightedScoreRecipe } from '@/lib/competitionFormulaBuilder'

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

  it('reproduces Speedway calculations and ranks dogs inside size classes', () => {
    const speedwayEntrant = (
      participantId: string,
      heightCm: number,
      checkedIn: boolean,
      run1: number | 'dns' | 'dnf',
      run2: number | 'dns' | 'dnf',
    ) => ({
      participantId,
      event: { distance_m: 50 },
      participant: {},
      registration: { dog_height_cm: heightCm, checked_in: checkedIn },
      attempts: [
        {
          stageId: 'main',
          attemptId: 'run_1',
          status: typeof run1 === 'number' ? null : run1,
          values: { time_ms: typeof run1 === 'number' ? run1 : null },
        },
        {
          stageId: 'main',
          attemptId: 'run_2',
          status: typeof run2 === 'number' ? null : run2,
          values: { time_ms: typeof run2 === 'number' ? run2 : null },
        },
      ],
    })

    const rows = calculateCompetitionResults(SPEEDWAY_FORMAT, [
      speedwayEntrant('xs-fast-a', 29.9, true, 5000, 4800),
      speedwayEntrant('xs-fast-b', 25, true, 4800, 'dnf'),
      speedwayEntrant('xs-third', 10, true, 5200, 5100),
      speedwayEntrant('s-fast', 30, true, 4700, 4600),
      speedwayEntrant('s-no-time', 39.9, true, 'dns', 'dnf'),
      speedwayEntrant('s-not-checked-in', 35, false, 4500, 4400),
      speedwayEntrant('large-production-class', 62, true, 4900, 4700),
    ])
    const byId = Object.fromEntries(rows.map(row => [row.participantId, row]))

    expect(validateCompetitionFormatDefinition(SPEEDWAY_FORMAT).success).toBe(true)
    expect(byId['xs-fast-a'].computed.best_time_ms).toBe(4800)
    expect(byId['xs-fast-a'].computed.speed_kmh).toBe(37.5)
    expect(byId['xs-fast-a'].groups.size_class).toBe('xs')
    expect(byId['xs-fast-a'].ranks.class).toBe(1)
    expect(byId['xs-fast-b'].ranks.class).toBe(1)
    expect(byId['xs-third'].ranks.class).toBe(3)
    expect(byId['s-fast'].ranks.class).toBe(1)
    expect(byId['s-no-time'].computed.best_time_ms).toBeNull()
    expect(byId['s-no-time'].computed.speed_kmh).toBeNull()
    expect(byId['s-no-time'].ranks.class).toBeNull()
    expect(byId['s-not-checked-in'].computed.best_time_ms).toBe(4400)
    expect(byId['s-not-checked-in'].ranks.class).toBeNull()
    expect(byId['large-production-class'].groups.size_class).toBe('l')

    const customClasses = structuredClone(SPEEDWAY_FORMAT)
    customClasses.groups[0].buckets = [
      { key: 'xs', label: 'XS', max: 30 },
      { key: 's', label: 'S', min: 30, max: 40 },
      { key: 'm', label: 'M', min: 40, max: 50 },
      { key: 'l', label: 'L', min: 50, max: 60 },
      { key: 'xl', label: 'XL', min: 60 },
    ]
    expect(
      calculateCompetitionResults(customClasses, [
        speedwayEntrant('large-custom-class', 62, true, 4900, 4700),
      ])[0].groups.size_class,
    ).toBe('xl')

    const viewRows = rows.map(row => ({
      participant_id: row.participantId,
      computed: row.computed,
      groups: row.groups,
      ranks: row.ranks,
    }))
    const resultBlock = SPEEDWAY_FORMAT.views
      .find(view => view.kind === 'results')!
      .blocks.find(block => block.type === 'result_table')!
    const viewGroups = groupCompetitionResultsForBlock(
      SPEEDWAY_FORMAT,
      viewRows,
      resultBlock,
    )

    expect(viewGroups.map(group => group.title)).toEqual([
      'Klasa wzrostowa: XS',
      'Klasa wzrostowa: S',
      'Klasa wzrostowa: L',
    ])
    expect(viewGroups[0].rows.map(row => row.ranks.class)).toEqual([1, 1, 3])
    expect(viewGroups[1].rows.map(row => row.ranks.class)).toEqual([1, null, null])
    expect(viewGroups[2].rows.map(row => row.ranks.class)).toEqual([1])
  })

  it('builds an editable weighted score recipe without exposing expression JSON', () => {
    const recipe: WeightedScoreRecipe = {
      precision: 1,
      terms: [
        { fieldId: 'skill', aggregation: 'sum', operation: 'add', multiplier: 1.5 },
        { fieldId: 'penalty', aggregation: 'sum', operation: 'subtract', multiplier: 2 },
      ],
    }
    const expression = buildWeightedScoreExpression(recipe)

    expect(parseWeightedScoreExpression(expression)).toEqual(recipe)
    expect(evaluateCompetitionExpression(expression, {
      valid_attempts: [
        { values: { skill: 20, penalty: 2 } },
        { values: { skill: 10, penalty: 1 } },
      ],
    })).toBe(39)
  })

  it('handles a complex organizer-created points event with threshold and tie-breakers', () => {
    const entrant = (
      participantId: string,
      values: Record<string, number>,
    ) => ({
      participantId,
      event: {},
      participant: {},
      registration: {},
      attempts: [{
        stageId: 'main',
        attemptId: 'scorecard',
        status: null,
        values,
      }],
    })
    const rows = calculateCompetitionResults(VERSATILE_DOG_CUP_FORMAT, [
      entrant('dog-a', {
        agility_points: 90,
        obedience_points: 80,
        nosework_points: 70,
        teamwork_bonus: 10,
        penalty_points: 5,
      }),
      entrant('dog-b', {
        agility_points: 80,
        obedience_points: 90,
        nosework_points: 70,
        teamwork_bonus: 10,
        penalty_points: 4,
      }),
      entrant('dog-c', {
        agility_points: 40,
        obedience_points: 40,
        nosework_points: 40,
        teamwork_bonus: 0,
        penalty_points: 5,
      }),
    ])
    const byId = Object.fromEntries(rows.map(row => [row.participantId, row]))

    expect(validateCompetitionFormatDefinition(VERSATILE_DOG_CUP_FORMAT).success).toBe(true)
    expect(byId['dog-a'].computed.total_points).toBe(79)
    expect(byId['dog-b'].computed.total_points).toBe(79)
    expect(byId['dog-b'].ranks.overall).toBe(1)
    expect(byId['dog-a'].ranks.overall).toBe(2)
    expect(byId['dog-c'].computed.total_points).toBe(31)
    expect(byId['dog-c'].ranks.overall).toBeNull()
  })
})
