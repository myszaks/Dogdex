import { describe, expect, it } from 'vitest'
import { plForm } from '@/lib/utils'

describe('plForm', () => {
  it.each([
    [0, '0 dni'],
    [1, '1 dzień'],
    [2, '2 dni'],
    [4, '4 dni'],
    [5, '5 dni'],
    [11, '11 dni'],
    [12, '12 dni'],
    [14, '14 dni'],
    [21, '21 dni'],
    [22, '22 dni'],
    [24, '24 dni'],
    [25, '25 dni'],
    [31, '31 dni'],
    [32, '32 dni'],
    [101, '101 dni'],
  ])('uses the correct Polish form for %i', (value, expected) => {
    expect(plForm(value as number, 'dzień', 'dni', 'dni')).toBe(expected)
  })
})
