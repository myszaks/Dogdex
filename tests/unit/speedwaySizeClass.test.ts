import { describe, expect, it } from 'vitest'
import {
  ensureSpeedwayClassificationFields,
  extractSizeClassFromFormData,
  extractSizeClassFromRegistration,
  getSizeClass,
  isSpeedwayClassificationFieldKey,
  isSighthoundBreed,
  normalizeSizeClass,
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
    expect(extractSizeClassFromRegistration({ age_category: '33' }, 62)).toBe('L')
    expect(extractSizeClassFromRegistration({}, '52,5')).toBe('L')
  })

  it('prefers form data over dog profile height', () => {
    expect(extractSizeClassFromRegistration({ height_cm: '35' }, 62)).toBe('S')
  })

  it('assigns all dogs at least 50 cm tall to class L', () => {
    expect(getSizeClass(50)).toBe('L')
    expect(getSizeClass(60)).toBe('L')
    expect(getSizeClass(90)).toBe('L')
    expect(normalizeSizeClass('XL')).toBe('L')
  })

  it('recognizes all FCI sighthound breeds and common Polish names', () => {
    const sighthounds = [
      'Chart afgański',
      'Saluki',
      'Borzoj',
      'Deerhound',
      'Wilczarz irlandzki',
      'Greyhound',
      'Whippet',
      'Magyar agár',
      'Charcik włoski',
      'Azawakh',
      'Sloughi',
      'Chart polski',
      'Galgo Español',
      'Kazakh Tazy',
    ]

    for (const breed of sighthounds) {
      expect(isSighthoundBreed(breed), breed).toBe(true)
    }
    expect(isSighthoundBreed('Labrador retriever')).toBe(false)
    expect(isSighthoundBreed('Owczarek australijski')).toBe(false)
  })

  it('assigns class Chart from registration breed or dog profile breed before height', () => {
    expect(extractSizeClassFromRegistration(
      { height_cm: '28' },
      28,
      'Whippet',
      null,
    )).toBe('CHART')

    expect(extractSizeClassFromRegistration(
      { height_cm: '62' },
      62,
      null,
      'Charcik włoski',
    )).toBe('CHART')
  })

  it('gives class Sport the highest priority', () => {
    expect(extractSizeClassFromRegistration(
      { height_cm: '28', sport_class_1710000000000: 'true' },
      28,
      'Whippet',
      null,
    )).toBe('SPORT')
  })

  it('adds protected classification fields to every Speedway form only once', () => {
    const fields = ensureSpeedwayClassificationFields([], 'speedway')
    expect(fields).toContainEqual(expect.objectContaining({
      id: 'height_cm',
      type: 'number',
      required: true,
    }))
    expect(fields).toContainEqual(expect.objectContaining({
      id: 'sport_class',
      type: 'checkbox',
      description: 'Dla psów będących w treningu sportowym',
    }))
    expect(ensureSpeedwayClassificationFields(fields, 'speedway')).toHaveLength(2)
    expect(ensureSpeedwayClassificationFields([], 'agility')).toEqual([])
  })

  it('repairs modified Speedway fields and removes system-field duplicates', () => {
    const fields = ensureSpeedwayClassificationFields([
      { id: 'height_cm_1', label: 'Usuń mnie', type: 'text', required: false },
      { id: 'height_cm_2', label: 'Duplikat', type: 'text', required: false },
      { id: 'sport_class_1', label: 'Inna nazwa', type: 'select', required: true },
    ], 'speedway')

    expect(fields).toHaveLength(2)
    expect(fields[0]).toMatchObject({
      id: 'height_cm_1',
      label: 'Wzrost psa w kłębie (cm)',
      type: 'number',
      required: true,
    })
    expect(fields[1]).toMatchObject({
      id: 'sport_class_1',
      label: 'Klasa sport',
      type: 'checkbox',
      required: false,
    })
    expect(isSpeedwayClassificationFieldKey('height_cm_123')).toBe(true)
    expect(isSpeedwayClassificationFieldKey('sport_class_123')).toBe(true)
  })
})
