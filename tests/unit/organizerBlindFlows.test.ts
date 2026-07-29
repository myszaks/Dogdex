import { describe, expect, it } from 'vitest'
import {
  cloneCompetitionPreset,
  getLiveVisibilityLabel,
  getRecommendedCompetitionPreset,
  isLikelyNonCompetitiveEvent,
} from '@/lib/eventCompetitionSetup'
import {
  calculateCompetitionResults,
  validateCompetitionFieldValues,
  validateCompetitionFormatDefinition,
} from '@/lib/competitionEngine'
import { isParticipantCompetitionComplete } from '@/lib/competitionProgress'
import { validateFormFieldDefinitions } from '@/lib/registrationFormValidation'

describe('blind organizer journeys through the event creator', () => {
  it('lets a walk organizer ignore results without seeing a misleading live status', () => {
    expect(isLikelyNonCompetitiveEvent('spacer')).toBe(true)
    expect(getRecommendedCompetitionPreset('spacer')).toBeNull()
    expect(getLiveVisibilityLabel(false, true)).toBe('Wyłączony')
    expect(validateFormFieldDefinitions([])).toEqual([])
  })

  it('lets a workshop organizer proceed without choosing any scoring language', () => {
    expect(isLikelyNonCompetitiveEvent('wykłady')).toBe(true)
    expect(getRecommendedCompetitionPreset('wykłady')).toBeNull()
    expect(getLiveVisibilityLabel(false, false)).toBe('Wyłączony')
    expect(validateFormFieldDefinitions([{
      id: 'workshop_date',
      label: 'Wybierz termin',
      type: 'multidate',
      required: true,
      options: ['2026-09-12', '2026-09-13'],
    }])).toEqual([])
  })

  it('gives a Speedway organizer a usable default and a plain required parameter', () => {
    const recommendation = getRecommendedCompetitionPreset('speedway')
    expect(recommendation?.key).toBe('speedway')

    const definition = cloneCompetitionPreset('speedway')
    expect(validateCompetitionFormatDefinition(definition).success).toBe(true)
    expect(validateCompetitionFieldValues(definition.eventFields, {})).toEqual([
      { path: 'distance_m', message: 'Pole jest wymagane.' },
    ])
    expect(validateCompetitionFieldValues(
      definition.eventFields,
      { distance_m: 50 },
    )).toEqual([])
    expect(definition.resultFields.map(field => field.id)).toEqual(['time_ms'])
    expect(definition.eventFields.map(field => field.id)).toContain('distance_m')
    expect(definition.groups[0].source).toEqual({
      op: 'ref',
      path: 'registration.dog_height_cm',
    })
    expect(definition.groups[0].buckets).toEqual([
      { key: 'xs', label: 'XS', max: 30 },
      { key: 's', label: 'S', min: 30, max: 40 },
      { key: 'm', label: 'M', min: 40, max: 50 },
      { key: 'l', label: 'L', min: 50 },
    ])
  })

  it('does not silently assign an unrelated points system to obedience', () => {
    expect(getRecommendedCompetitionPreset('obedience')).toBeNull()
  })

  it('handles a deliberately complex points event selected by its organizer', () => {
    const definition = cloneCompetitionPreset('points')
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

    const rows = calculateCompetitionResults(definition, [
      entrant('balanced-dog', {
        agility_points: 90,
        obedience_points: 80,
        nosework_points: 70,
        teamwork_bonus: 10,
        penalty_points: 5,
      }),
      entrant('precise-dog', {
        agility_points: 80,
        obedience_points: 90,
        nosework_points: 70,
        teamwork_bonus: 10,
        penalty_points: 4,
      }),
      entrant('below-threshold', {
        agility_points: 40,
        obedience_points: 40,
        nosework_points: 40,
        teamwork_bonus: 0,
        penalty_points: 5,
      }),
    ])
    const byId = Object.fromEntries(rows.map(row => [row.participantId, row]))

    expect(byId['precise-dog'].ranks.overall).toBe(1)
    expect(byId['balanced-dog'].ranks.overall).toBe(2)
    expect(byId['below-threshold'].ranks.overall).toBeNull()
    expect(isParticipantCompetitionComplete(
      definition,
      entrant('below-threshold', {
        agility_points: 40,
        obedience_points: 40,
        nosework_points: 40,
        teamwork_bonus: 0,
        penalty_points: 5,
      }).attempts,
    )).toBe(true)
  })

  it('stops a novice organizer before publishing an impossible registration form', () => {
    const issues = validateFormFieldDefinitions([{
      id: 'category',
      label: 'Wybierz kategorię',
      type: 'select',
      required: true,
      options: [],
    }])

    expect(issues[0].message).toBe(
      'Wybierz kategorię: dodaj co najmniej jedną opcję odpowiedzi.',
    )
  })
})
