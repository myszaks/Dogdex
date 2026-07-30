import { describe, expect, it } from 'vitest'
import {
  competitionFieldLabels,
  describeCompetitionExpression,
} from '@/lib/competitionFormatPresentation'
import { TIME_TRIAL_FORMAT } from '@/lib/competitionPresets'

describe('competition format read-only presentation', () => {
  it('describes organizer calculations with visible field labels', () => {
    const labels = competitionFieldLabels(TIME_TRIAL_FORMAT)
    const description = describeCompetitionExpression(
      TIME_TRIAL_FORMAT.computedFields[0].expression,
      labels,
    )

    expect(description).toContain('najniższa wartość')
    expect(description).toContain('Czas')
    expect(description).not.toContain('valid_attempts')
  })

  it('describes conditions without exposing engine syntax', () => {
    const description = describeCompetitionExpression({
      op: 'if',
      condition: {
        op: 'gte',
        left: { op: 'ref', path: 'computed.points' },
        right: { op: 'literal', value: 10 },
      },
      then: { op: 'literal', value: 1 },
      else: { op: 'literal', value: 0 },
    }, new Map([['computed.points', 'Punkty końcowe']]))

    expect(description).toBe('jeżeli „Punkty końcowe” ≥ 10, to 1, w przeciwnym razie 0')
  })
})
