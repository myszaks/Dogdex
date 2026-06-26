import { describe, expect, it } from 'vitest'
import { extractSizeClassFromFormData } from '@/lib/speedway'

describe('speedway size class extraction', () => {
  it('assigns size class from the exact height_cm form field', () => {
    expect(extractSizeClassFromFormData({ height_cm: '33' })).toBe('S')
    expect(extractSizeClassFromFormData({ height_cm: '35' })).toBe('S')
  })

  it('assigns size class from suffixed template height fields', () => {
    expect(extractSizeClassFromFormData({ height_cm_1710000000000: '33' })).toBe('S')
    expect(extractSizeClassFromFormData({ height_cm_field: '35,5' })).toBe('S')
  })

  it('does not treat unrelated numeric fields as height', () => {
    expect(extractSizeClassFromFormData({ age_category: '33' })).toBeNull()
  })
})
