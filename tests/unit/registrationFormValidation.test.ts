import { describe, expect, it } from 'vitest'
import { validateRegistrationFormData } from '@/lib/registrationFormValidation'
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
