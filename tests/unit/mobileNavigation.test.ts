import { describe, expect, it } from 'vitest'
import { shouldHideMobileBottomNavigation } from '@/lib/mobileNavigation'

describe('mobile bottom navigation on long forms', () => {
  it.each([
    '/organizer/events/new',
    '/organizer/events/event-1/edit',
    '/organizer/events/event-1/live-entry',
    '/organizer/events/event-1/results',
    '/organizer/formats/new',
    '/organizer/formats/format-1/edit',
    '/register/event-1',
    '/profile/role-request',
    '/reset-password',
    '/settings',
    '/trainer/profile',
    '/trainings/trainer-1/book/type-1',
    '/live/event-1',
  ])('hides navigation on %s', pathname => {
    expect(shouldHideMobileBottomNavigation(pathname)).toBe(true)
  })

  it.each([
    '/',
    '/organizer',
    '/organizer/formats',
    '/events/event-1',
    '/moje-zapisy',
  ])('keeps navigation on %s', pathname => {
    expect(shouldHideMobileBottomNavigation(pathname)).toBe(false)
  })
})
