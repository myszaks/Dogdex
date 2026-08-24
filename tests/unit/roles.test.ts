import { describe, expect, it } from 'vitest'
import { hasAnyRole } from '@/lib/roles'

describe('hasAnyRole', () => {
  it('grants organizer and trainer capabilities to organizer_trainer', () => {
    expect(hasAnyRole('organizer_trainer', ['organizer'])).toBe(true)
    expect(hasAnyRole('organizer_trainer', ['trainer'])).toBe(true)
  })

  it('does not grant admin capability to organizer_trainer', () => {
    expect(hasAnyRole('organizer_trainer', ['admin'])).toBe(false)
  })

  it('keeps exact roles and the admin override', () => {
    expect(hasAnyRole('trainer', ['trainer'])).toBe(true)
    expect(hasAnyRole('trainer', ['organizer'])).toBe(false)
    expect(hasAnyRole('admin', ['organizer'])).toBe(true)
    expect(hasAnyRole(null, ['user'])).toBe(false)
  })
})
