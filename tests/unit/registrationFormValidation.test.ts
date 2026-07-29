import { describe, expect, it } from 'vitest'
import {
  validateFormFieldDefinitions,
  validateRegistrationFormData,
} from '@/lib/registrationFormValidation'
import type { FormField } from '@/types'

const fields: FormField[] = [
  {
    id: 'level',
    label: 'Poziom',
    type: 'select',
    required: true,
    options: ['A1', 'A2'],
  },
  {
    id: 'dates',
    label: 'Terminy',
    type: 'multidate',
    required: true,
    options: ['2026-08-01', '2026-08-02'],
  },
  {
    id: 'consent',
    label: 'Zgoda',
    type: 'checkbox',
    required: true,
  },
]

describe('registration form validation', () => {
  it('blocks publishing a choice field that has no usable options', () => {
    expect(validateFormFieldDefinitions([{
      id: 'category',
      label: 'Kategoria',
      type: 'select',
      required: true,
      options: [],
    }])).toEqual([{
      fieldId: 'category',
      message: 'Kategoria: dodaj co najmniej jedną opcję odpowiedzi.',
    }])
  })

  it('allows an unfinished choice list only inside a reusable draft template', () => {
    expect(validateFormFieldDefinitions([{
      id: 'dates',
      label: 'Terminy',
      type: 'multidate',
      required: true,
      options: [],
    }], { allowEmptyOptions: true })).toEqual([])
  })

  it('rejects duplicated ids, duplicated options and invalid dates', () => {
    const issues = validateFormFieldDefinitions([
      {
        id: 'choice',
        label: 'Poziom',
        type: 'select',
        required: false,
        options: ['A1', 'A1'],
      },
      {
        id: 'choice',
        label: 'Termin',
        type: 'multidate',
        required: false,
        options: ['jutro'],
      },
    ])

    expect(issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      'Poziom: każda opcja musi być unikalna.',
      'Termin: identyfikator pola nie jest unikalny.',
      'Termin: wszystkie terminy muszą być prawidłowymi datami.',
    ]))
  })

  it('normalizes valid values using the event form definition', () => {
    expect(validateRegistrationFormData(fields, {
      level: 'A1',
      dates: '2026-08-01,2026-08-02',
      consent: 'true',
    })).toEqual({
      ok: true,
      data: {
        level: 'A1',
        dates: ['2026-08-01', '2026-08-02'],
        consent: true,
      },
    })
  })

  it('rejects omitted required values', () => {
    const result = validateRegistrationFormData(fields, {
      level: 'A1',
      dates: ['2026-08-01'],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Zgoda')
  })

  it('rejects forged fields and options', () => {
    expect(validateRegistrationFormData(fields, {
      level: 'OPEN',
      dates: ['2026-08-01'],
      consent: true,
    }).ok).toBe(false)

    expect(validateRegistrationFormData(fields, {
      level: 'A1',
      dates: ['2026-08-01'],
      consent: true,
      admin_note: 'forged',
    }).ok).toBe(false)
  })
})
