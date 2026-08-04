import { describe, expect, it } from 'vitest'
import { buildGoogleCalendarUrl } from '@/lib/googleCalendar'

describe('Google Calendar links', () => {
  it('creates a pre-filled timed event without OAuth', () => {
    const result = new URL(buildGoogleCalendarUrl({
      title: 'Trening Fado – agility',
      start: '2030-05-20T10:00:00.000Z',
      end: '2030-05-20T11:30:00.000Z',
      description: 'Szczegóły treningu',
      location: 'Warszawa, Park',
    }))

    expect(result.origin).toBe('https://calendar.google.com')
    expect(result.searchParams.get('action')).toBe('TEMPLATE')
    expect(result.searchParams.get('text')).toBe('Trening Fado – agility')
    expect(result.searchParams.get('dates')).toBe('20300520T100000Z/20300520T113000Z')
    expect(result.searchParams.get('details')).toBe('Szczegóły treningu')
    expect(result.searchParams.get('location')).toBe('Warszawa, Park')
  })

  it('uses the next day as the exclusive end of an all-day event', () => {
    const result = new URL(buildGoogleCalendarUrl({
      title: 'Zawody',
      start: '2030-05-20',
      allDay: true,
    }))

    expect(result.searchParams.get('dates')).toBe('20300520/20300521')
  })

  it('uses one hour when an event has no end date', () => {
    const result = new URL(buildGoogleCalendarUrl({
      title: 'Spotkanie',
      start: '2030-05-20T10:00:00.000Z',
    }))

    expect(result.searchParams.get('dates')).toBe('20300520T100000Z/20300520T110000Z')
  })
})
