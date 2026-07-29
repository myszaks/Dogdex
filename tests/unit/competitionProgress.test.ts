import { describe, expect, it } from 'vitest'
import { cloneCompetitionPreset } from '@/lib/eventCompetitionSetup'
import { isParticipantCompetitionComplete } from '@/lib/competitionProgress'

describe('configurable competition progress', () => {
  it('does not treat a ranked Speedway dog as complete before every run is recorded', () => {
    const definition = cloneCompetitionPreset('speedway')
    expect(isParticipantCompetitionComplete(definition, [{
      stageId: 'main',
      attemptId: 'run_1',
      status: null,
      values: { time_ms: 5000 },
    }])).toBe(false)
  })

  it('counts normal results and terminal statuses as completed attempts', () => {
    const definition = cloneCompetitionPreset('speedway')
    expect(isParticipantCompetitionComplete(definition, [
      {
        stageId: 'main',
        attemptId: 'run_1',
        status: null,
        values: { time_ms: 5000 },
      },
      {
        stageId: 'main',
        attemptId: 'run_2',
        status: 'dns',
        values: {},
      },
    ])).toBe(true)
  })

  it('counts a below-threshold points scorecard as entered even without a rank', () => {
    const definition = cloneCompetitionPreset('points')
    expect(isParticipantCompetitionComplete(definition, [{
      stageId: 'main',
      attemptId: 'scorecard',
      status: null,
      values: {
        agility_points: 30,
        obedience_points: 30,
        nosework_points: 30,
        teamwork_bonus: 0,
        penalty_points: 10,
      },
    }])).toBe(true)
  })
})
