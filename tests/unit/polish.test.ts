import { describe, expect, it } from 'vitest'
import {
  formatPolishCount,
  polishForm,
  POLISH_FORMS,
} from '@/lib/polish'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

describe('Polish cardinal forms', () => {
  it.each([
    [0, 'psów'],
    [1, 'pies'],
    [2, 'psy'],
    [4, 'psy'],
    [5, 'psów'],
    [11, 'psów'],
    [12, 'psów'],
    [14, 'psów'],
    [21, 'psów'],
    [22, 'psy'],
    [24, 'psy'],
    [25, 'psów'],
    [101, 'psów'],
    [102, 'psy'],
    [1.5, 'psów'],
    [-1, 'pies'],
    [-2, 'psy'],
  ] as const)('selects the correct dog form for %s', (count, expected) => {
    expect(polishForm(count, POLISH_FORMS.dog)).toBe(expected)
  })

  it.each([
    [1, '1 pole', '1 zapis'],
    [2, '2 pola', '2 zapisy'],
    [5, '5 pól', '5 zapisów'],
    [21, '21 pól', '21 zapisów'],
    [22, '22 pola', '22 zapisy'],
  ] as const)('formats reusable forms for %s', (count, field, registration) => {
    expect(formatPolishCount(count, POLISH_FORMS.field)).toBe(field)
    expect(formatPolishCount(count, POLISH_FORMS.registration)).toBe(registration)
  })

  it('uses the nominative month standalone and the genitive month with a day', () => {
    const date = new Date(2026, 6, 30, 12)

    expect(format(date, 'LLLL yyyy', { locale: pl })).toBe('lipiec 2026')
    expect(format(date, 'd MMMM yyyy', { locale: pl })).toBe('30 lipca 2026')
  })
})
