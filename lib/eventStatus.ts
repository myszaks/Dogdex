import type { DogEvent } from '@/types'

type EventStatusLike = {
  status: DogEvent['status']
  start_at: string | null
  end_at?: string | null
  registration_opens_at?: string | null
  registration_deadline?: string | null
}

export type EventLiveState = 'draft' | 'upcoming' | 'live' | 'finished' | 'cancelled'

export function effectiveEventStatus(event: EventStatusLike, now = new Date()): string {
  if (event.status === 'draft') return 'draft'
  if (event.status === 'cancelled') return 'cancelled'
  if (event.status === 'finished') return 'finished'

  const start = event.start_at ? new Date(event.start_at) : null
  const end = event.end_at ? new Date(event.end_at) : null

  if (end && now > end) return 'finished'
  if (start && now >= start) return 'ongoing'
  return 'upcoming'
}

export function eventLiveState(event: EventStatusLike, now = new Date()): EventLiveState {
  const effectiveStatus = effectiveEventStatus(event, now)

  if (effectiveStatus === 'draft') return 'draft'
  if (effectiveStatus === 'cancelled') return 'cancelled'
  if (effectiveStatus === 'finished') return 'finished'

  // An explicit ongoing status is treated as a manual start, even when the
  // scheduled start time has not been reached yet.
  if (event.status === 'ongoing' || effectiveStatus === 'ongoing') return 'live'

  return 'upcoming'
}

export function isEventRegistrationOpen(event: EventStatusLike, now = new Date()): boolean {
  if (effectiveEventStatus(event, now) !== 'upcoming') return false
  if (event.registration_opens_at && new Date(event.registration_opens_at) > now) return false
  if (event.registration_deadline) {
    return new Date(event.registration_deadline) > now
  }
  return true
}
