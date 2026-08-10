import { describe, expect, it } from 'vitest'
import {
  BUSINESS_PERMISSIONS,
  isBusinessPermission,
  normalizeBusinessPermissions,
} from '@/lib/businessPermissions'

describe('business permissions', () => {
  it('keeps only known unique permissions', () => {
    expect(normalizeBusinessPermissions(['trainings.offer', 'unknown', 'trainings.offer', 'refunds.manage']))
      .toEqual(['trainings.offer', 'refunds.manage', 'payments.view'])
  })

  it('keeps viewing payments separate from issuing refunds', () => {
    expect(isBusinessPermission('payments.view')).toBe(true)
    expect(BUSINESS_PERMISSIONS).toContain('refunds.manage')
    expect('payments.view').not.toBe('refunds.manage')
  })

  it('adds read scopes required by sensitive write permissions', () => {
    expect(normalizeBusinessPermissions(['refunds.manage'])).toEqual(['refunds.manage', 'payments.view'])
    expect(normalizeBusinessPermissions(['trainings.attendance'])).toEqual(['trainings.attendance', 'customers.view'])
    expect(normalizeBusinessPermissions(['trainings.bookings'])).toEqual(['trainings.bookings', 'customers.view'])
  })
})
