import { describe, expect, it } from 'vitest'
import {
  ensureEventTypeRegistrationDependencies,
  hasSizeClassRegistrationSource,
  validateEventCompetitionDependencies,
} from '@/lib/eventCompetitionDependencies'
import { cloneCompetitionPreset } from '@/lib/eventCompetitionSetup'
import type { FormField } from '@/types'

describe('event form and competition schema dependencies', () => {
  it('automatically adds the required height source for Speedway', () => {
    const fields = ensureEventTypeRegistrationDependencies('speedway', [])
    expect(fields).toEqual([
      expect.objectContaining({
        id: 'height_cm',
        type: 'number',
        required: true,
      }),
    ])
    expect(
      validateEventCompetitionDependencies(fields, cloneCompetitionPreset('speedway')),
    ).toEqual([])
  })

  it('accepts a complete required XS–XL choice instead of height', () => {
    const fields: FormField[] = [{
      id: 'size_class',
      label: 'Klasa wzrostowa',
      type: 'select',
      required: true,
      options: ['XS (< 30 cm)', 'S', 'M', 'L', 'XL (≥ 60 cm)'],
    }]
    expect(
      validateEventCompetitionDependencies(fields, cloneCompetitionPreset('speedway')),
    ).toEqual([])
    expect(ensureEventTypeRegistrationDependencies('speedway', fields)).toBe(fields)
  })

  it('detects when an organizer makes the automatic Speedway source optional', () => {
    const [heightField] = ensureEventTypeRegistrationDependencies('speedway', [])
    const editedFields = [{ ...heightField, required: false }]

    expect(hasSizeClassRegistrationSource(editedFields)).toBe(false)
    expect(
      validateEventCompetitionDependencies(
        editedFields,
        cloneCompetitionPreset('speedway'),
      )[0].message,
    ).toContain('musi wymagać wzrostu psa')
  })

  it('rejects a schema whose required registration answer is missing or optional', () => {
    const definition = cloneCompetitionPreset('points')
    definition.groups = [{
      id: 'level',
      label: 'Poziom',
      source: { op: 'ref', path: 'registration.form_data.level' },
    }]

    expect(validateEventCompetitionDependencies([], definition)[0].message).toContain(
      'formularz zapisów nie zawiera',
    )
    expect(validateEventCompetitionDependencies([{
      id: 'level',
      label: 'Poziom',
      type: 'select',
      required: false,
      options: ['A', 'B'],
    }], definition)[0].message).toContain('musi być wymagane')
  })
})
