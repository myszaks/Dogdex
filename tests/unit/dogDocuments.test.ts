import { describe, expect, it } from 'vitest'
import {
  normalizeEventEntryRequirements,
  validateDogEligibility,
  validateEventEntryRequirements,
} from '@/lib/dogDocuments'

describe('dog event eligibility', () => {
  it('normalizes unsupported values and duplicate documents', () => {
    expect(normalizeEventEntryRequirements({
      minAgeMonths: 12,
      maxHeightCm: 400,
      allowedGenders: ['female', 'unknown', 'female'],
      documents: [
        { type: 'pedigree', mustBeValidOnEventDate: false },
        { type: 'pedigree', mustBeValidOnEventDate: true },
        { type: 'other' },
      ],
    })).toEqual({
      minAgeMonths: 12,
      maxAgeMonths: null,
      minHeightCm: null,
      maxHeightCm: null,
      allowedGenders: ['female'],
      documents: [{ type: 'pedigree', mustBeValidOnEventDate: false }],
    })
  })

  it('rejects inverted ranges', () => {
    expect(validateEventEntryRequirements(normalizeEventEntryRequirements({
      minAgeMonths: 24,
      maxAgeMonths: 12,
    }))).toContain('Minimalny wiek')
  })

  it('accepts a dog that meets profile and document requirements', () => {
    const issues = validateDogEligibility({
      dog: {
        birth_date: '2023-01-15',
        height_cm: 48,
        gender: 'female',
        rabies_vaccine_expiry: '2026-12-31',
      },
      documents: [{ type: 'sport_license', expires_at: '2026-09-01' }],
      requirements: normalizeEventEntryRequirements({
        minAgeMonths: 24,
        maxHeightCm: 50,
        allowedGenders: ['female'],
        documents: [
          { type: 'rabies_vaccination', mustBeValidOnEventDate: true },
          { type: 'sport_license', mustBeValidOnEventDate: true },
        ],
      }),
      eventStartsAt: '2026-08-20T08:00:00Z',
      eventEndsAt: '2026-08-21T18:00:00Z',
    })

    expect(issues).toEqual([])
  })

  it('reports missing profile data and expired documents', () => {
    const issues = validateDogEligibility({
      dog: { birth_date: null, height_cm: null, gender: 'male' },
      documents: [{ type: 'sport_license', expires_at: '2026-08-01' }],
      requirements: normalizeEventEntryRequirements({
        minAgeMonths: 12,
        minHeightCm: 30,
        allowedGenders: ['female'],
        documents: [{ type: 'sport_license', mustBeValidOnEventDate: true }],
      }),
      eventStartsAt: '2026-08-20T08:00:00Z',
      eventEndsAt: '2026-08-21T18:00:00Z',
    })

    expect(issues.map(issue => issue.code)).toEqual(['birth_date', 'height', 'gender', 'document'])
  })
})
