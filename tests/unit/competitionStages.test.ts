import { describe, expect, it } from 'vitest'
import {
  calculateCompetitionResults,
  validateCompetitionFieldValues,
  validateCompetitionFormatDefinition,
} from '@/lib/competitionEngine'
import { isParticipantCompetitionComplete } from '@/lib/competitionProgress'
import { resultFieldsForStage } from '@/lib/competitionStages'
import type {
  CompetitionAttemptInput,
  CompetitionFormatDefinition,
} from '@/types/competition'

const MULTI_STAGE_FORMAT: CompetitionFormatDefinition = {
  schemaVersion: 1,
  name: 'Dwubój z karami',
  eventFields: [],
  resultFields: [
    {
      id: 'points',
      label: 'Punkty',
      type: 'number',
      required: true,
      stageIds: ['skills'],
    },
    {
      id: 'penalties',
      label: 'Kary',
      type: 'number',
      required: true,
      stageIds: ['final'],
    },
    {
      id: 'note',
      label: 'Notatka wspólna',
      type: 'text',
    },
  ],
  stages: [
    {
      id: 'skills',
      label: 'Umiejętności',
      attempts: [{ id: 'round_1', label: 'Runda punktowa' }],
    },
    {
      id: 'final',
      label: 'Finał',
      attempts: [{ id: 'round_1', label: 'Runda kar' }],
    },
  ],
  statuses: [],
  computedFields: [{
    id: 'total',
    label: 'Wynik końcowy',
    type: 'number',
    expression: {
      op: 'subtract',
      args: [
        {
          op: 'sum',
          args: [{ op: 'ref', path: 'valid_attempts.values.points' }],
        },
        {
          op: 'sum',
          args: [{ op: 'ref', path: 'valid_attempts.values.penalties' }],
        },
      ],
    },
  }],
  groups: [],
  rankings: [{
    id: 'overall',
    label: 'Klasyfikacja',
    groupBy: [],
    orderBy: [{
      expression: { op: 'ref', path: 'computed.total' },
      direction: 'desc',
    }],
    ties: 'competition',
  }],
  views: [],
}

describe('stage-specific competition fields', () => {
  it('keeps legacy fields visible everywhere and scopes new fields to one stage', () => {
    expect(resultFieldsForStage(MULTI_STAGE_FORMAT, 'skills').map(field => field.id))
      .toEqual(['points', 'note'])
    expect(resultFieldsForStage(MULTI_STAGE_FORMAT, 'final').map(field => field.id))
      .toEqual(['penalties', 'note'])
  })

  it('validates values and completeness against the active stage only', () => {
    const skillsFields = resultFieldsForStage(MULTI_STAGE_FORMAT, 'skills')
    expect(validateCompetitionFieldValues(skillsFields, { points: 100 })).toEqual([])
    expect(validateCompetitionFieldValues(skillsFields, { penalties: 5 })).toEqual([
      { path: 'penalties', message: 'Pole nie występuje w definicji formatu.' },
      { path: 'points', message: 'Pole jest wymagane.' },
    ])

    const completeAttempts: CompetitionAttemptInput[] = [
      {
        stageId: 'skills',
        attemptId: 'round_1',
        status: null,
        values: { points: 100 },
      },
      {
        stageId: 'final',
        attemptId: 'round_1',
        status: null,
        values: { penalties: 5 },
      },
    ]
    expect(isParticipantCompetitionComplete(MULTI_STAGE_FORMAT, completeAttempts)).toBe(true)
    expect(isParticipantCompetitionComplete(
      MULTI_STAGE_FORMAT,
      completeAttempts.slice(0, 1),
    )).toBe(false)
  })

  it('calculates and ranks a real multi-stage result without duplicate inputs', () => {
    const rows = calculateCompetitionResults(MULTI_STAGE_FORMAT, [
      {
        participantId: 'dog-a',
        event: {},
        participant: {},
        registration: {},
        attempts: [
          {
            stageId: 'skills',
            attemptId: 'round_1',
            status: null,
            values: { points: 100 },
          },
          {
            stageId: 'final',
            attemptId: 'round_1',
            status: null,
            values: { penalties: 5, points: 999 },
          },
        ],
      },
      {
        participantId: 'dog-b',
        event: {},
        participant: {},
        registration: {},
        attempts: [
          {
            stageId: 'skills',
            attemptId: 'round_1',
            status: null,
            values: { points: 96 },
          },
          {
            stageId: 'final',
            attemptId: 'round_1',
            status: null,
            values: { penalties: 3 },
          },
        ],
      },
    ])
    const byId = Object.fromEntries(rows.map(row => [row.participantId, row]))

    expect(validateCompetitionFormatDefinition(MULTI_STAGE_FORMAT).success).toBe(true)
    expect(byId['dog-a'].computed.total).toBe(95)
    expect(byId['dog-b'].computed.total).toBe(93)
    expect(byId['dog-a'].ranks.overall).toBe(1)
  })

  it('rejects empty, duplicate and unknown stage assignments', () => {
    const invalid = structuredClone(MULTI_STAGE_FORMAT)
    invalid.resultFields[0].stageIds = ['skills', 'skills', 'missing']
    invalid.resultFields[1].stageIds = []

    const validation = validateCompetitionFormatDefinition(invalid)
    expect(validation.success).toBe(false)
    if (validation.success) return
    expect(validation.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([
      'resultFields[0].stageIds[1]',
      'resultFields[0].stageIds[2]',
      'resultFields[1].stageIds',
    ]))
  })
})
