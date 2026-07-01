import { describe, expect, it } from 'vitest'
import { extractSizeClassFromFormData, extractSizeClassFromRegistration } from '@/lib/speedway'

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

  it('falls back to dog profile height when form data has no height', () => {
    expect(extractSizeClassFromRegistration({ age_category: '33' }, 62)).toBe('XL')
    expect(extractSizeClassFromRegistration({}, '52,5')).toBe('L')
  })

  it('prefers form data over dog profile height', () => {
    expect(extractSizeClassFromRegistration({ height_cm: '35' }, 62)).toBe('S')
  })
})
