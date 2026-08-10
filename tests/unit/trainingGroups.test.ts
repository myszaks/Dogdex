import { describe, expect, it } from 'vitest'
import { buildRecurringSessionStarts, consumePassBalance, courseEnrollmentStatus } from '@/lib/trainingGroups'

describe('group trainings and passes', () => {
  it('builds a recurring weekly course schedule', () => {
    expect(buildRecurringSessionStarts(new Date('2026-09-01T16:00:00Z'), 3, 7)).toEqual([
      '2026-09-01T16:00:00.000Z',
      '2026-09-08T16:00:00.000Z',
      '2026-09-15T16:00:00.000Z',
    ])
  })

  it('uses capacity, approval and price to decide enrollment status', () => {
    expect(courseEnrollmentStatus({ occupied: 8, capacity: 8, enrollmentMode: 'open', price: 0 })).toBe('waitlisted')
    expect(courseEnrollmentStatus({ occupied: 2, capacity: 8, enrollmentMode: 'approval', price: 0 })).toBe('pending')
    expect(courseEnrollmentStatus({ occupied: 2, capacity: 8, enrollmentMode: 'open', price: 150 })).toBe('pending')
    expect(courseEnrollmentStatus({ occupied: 2, capacity: 8, enrollmentMode: 'open', price: 0 })).toBe('confirmed')
  })

  it('closes a pass after its final entry', () => {
    expect(consumePassBalance(2)).toEqual({ remaining: 1, status: 'active' })
    expect(consumePassBalance(1)).toEqual({ remaining: 0, status: 'used' })
    expect(consumePassBalance(0)).toBeNull()
  })
})
