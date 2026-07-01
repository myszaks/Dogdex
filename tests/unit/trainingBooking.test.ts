import { describe, expect, it } from 'vitest'
import {
  bookingFitsAvailability,
  bookingsOverlap,
  getBookingDateTimeParts,
  resolveBookingDuration,
} from '@/lib/trainingBooking'

describe('trainingBooking helpers', () => {
  it('always resolves booking duration from the training type', () => {
    expect(resolveBookingDuration(15, 60)).toBe(60)
    expect(resolveBookingDuration(undefined, 45)).toBe(45)
  })

  it('detects overlapping bookings but allows touching edges', () => {
    const first = new Date('2026-06-25T08:00:00.000Z')
    const second = new Date('2026-06-25T08:30:00.000Z')
    const touching = new Date('2026-06-25T09:00:00.000Z')

    expect(bookingsOverlap(first, 60, second, 60)).toBe(true)
    expect(bookingsOverlap(first, 60, touching, 30)).toBe(false)
  })

  it('keeps booking date parts in Europe/Warsaw time', () => {
    expect(getBookingDateTimeParts(new Date('2026-06-25T22:30:00.000Z'))).toEqual({
      date: '2026-06-26',
      time: '00:30',
    })
  })

  it('checks whether a booking fits the trainer availability window', () => {
    const start = new Date('2026-06-25T06:00:00.000Z')
    const tooLate = new Date('2026-06-25T07:30:00.000Z')

    expect(bookingFitsAvailability(start, 60, '08:00:00', '10:00:00')).toBe(true)
    expect(bookingFitsAvailability(tooLate, 60, '08:00:00', '10:00:00')).toBe(false)
  })
})
