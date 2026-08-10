import { describe, expect, it } from 'vitest'
import { eventPermissionsFromBusiness } from '@/lib/businessTeam'

describe('business team compatibility mapping', () => {
  it('maps only event permissions to the legacy per-event model', () => {
    expect(eventPermissionsFromBusiness(['events.create', 'events.edit', 'events.registrations', 'customers.view', 'refunds.manage', 'events.checkin']))
      .toEqual(['registrations', 'checkin'])
  })
})
