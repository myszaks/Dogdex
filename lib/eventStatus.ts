import type { DogEvent } from '@/types'

type EventStatusLike = {
  status: DogEvent['status']
  start_at: string | null
  end_at?: string | null
  registration_deadline?: string | null
}

export function effectiveEventStatus(event: EventStatusLike, now = new Date()): string {
  if (event.status === 'cancelled') return 'cancelled'

  const start = event.start_at ? new Date(event.start_at) : null
  const end = event.end_at ? new Date(event.end_at) : null

  if (end && now > end) return 'finished'
  if (start && now >= start) return 'ongoing'
  return 'upcoming'
}

export function isEventRegistrationOpen(event: EventStatusLike, now = new Date()): boolean {
  if (effectiveEventStatus(event, now) !== 'upcoming') return false
  if (event.registration_deadline) {
    return new Date(event.registration_deadline) > now
  }
  return true
}
