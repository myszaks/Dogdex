import { describe, expect, it } from 'vitest'
import {
  hasRequiredRole,
  isOrganizerRole,
  isTrainerRole,
  nextRoleAfterApproval,
} from '@/lib/roles'

describe('roles', () => {
  it('keeps organizer and trainer permissions separate', () => {
    expect(isOrganizerRole('organizer')).toBe(true)
    expect(isOrganizerRole('trainer')).toBe(false)
    expect(isTrainerRole('trainer')).toBe(true)
    expect(isTrainerRole('organizer')).toBe(false)
  })

  it('allows combined role to pass organizer and trainer checks', () => {
    expect(hasRequiredRole('organizer_trainer', ['organizer'])).toBe(true)
    expect(hasRequiredRole('organizer_trainer', ['trainer'])).toBe(true)
  })

  it('promotes a single-role user to combined role after second approval', () => {
    expect(nextRoleAfterApproval('organizer', 'trainer')).toBe('organizer_trainer')
    expect(nextRoleAfterApproval('trainer', 'organizer')).toBe('organizer_trainer')
  })
})
