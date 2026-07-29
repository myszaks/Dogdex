import { describe, expect, it } from 'vitest'
import {
  extractHeightCmFromRegistration,
  extractSizeClassFromFormData,
  extractSizeClassFromRegistration,
  isSighthoundBreed,
  isSpeedwaySighthoundRegistration,
  isSpeedwaySportRegistration,
} from '@/lib/speedway'

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
    expect(extractHeightCmFromRegistration({ height_cm: '35,5' }, 62)).toBe(35.5)
  })

  it('understands descriptive XS–XL option labels from registration forms', () => {
    expect(extractSizeClassFromFormData({ size_class: 'XS (< 30 cm)' })).toBe('XS')
    expect(extractSizeClassFromFormData({ category: 'XL (≥ 60 cm)' })).toBe('XL')
  })

  it('recognizes the optional Sport class from checkbox data', () => {
    expect(isSpeedwaySportRegistration({ sport_class: 'true' })).toBe(true)
    expect(isSpeedwaySportRegistration({ sport_class: '' })).toBe(false)
  })

  it('recognizes the sighthound class from checkbox or breed', () => {
    expect(isSpeedwaySighthoundRegistration({ sighthound_class: true }, null)).toBe(true)
    expect(isSpeedwaySighthoundRegistration({}, 'Whippet')).toBe(true)
    expect(isSighthoundBreed('Chart afgański')).toBe(true)
    expect(isSighthoundBreed('Border Collie')).toBe(false)
  })
})
