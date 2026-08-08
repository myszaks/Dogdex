import type { DogEvent } from '@/types'

type EventStatusLike = {
  status: DogEvent['status']
  start_at: string | null
  end_at?: string | null
  registration_opens_at?: string | null
  registration_deadline?: string | null
}

export type EventRegistrationPhase = 'not_started' | 'open' | 'closed'

export function effectiveEventStatus(event: EventStatusLike, now = new Date()): string {
  if (event.status === 'cancelled') return 'cancelled'
  if (event.status === 'finished') return 'finished'

  const start = event.start_at ? new Date(event.start_at) : null
  const end = event.end_at ? new Date(event.end_at) : null

  if (end && now >= end) return 'finished'
  if (start && now >= start) return 'ongoing'
  return 'upcoming'
}

export function getEventRegistrationPhase(
  event: EventStatusLike,
  now = new Date(),
): EventRegistrationPhase {
  if (effectiveEventStatus(event, now) !== 'upcoming') return 'closed'

  if (event.registration_opens_at && new Date(event.registration_opens_at) > now) {
    return 'not_started'
  }

  if (event.registration_deadline && new Date(event.registration_deadline) <= now) {
    return 'closed'
  }

  return 'open'
}

export function isEventRegistrationOpen(event: EventStatusLike, now = new Date()): boolean {
  return getEventRegistrationPhase(event, now) === 'open'
}

type RegistrationWindowLike = {
  start_at?: unknown
  registration_opens_at?: unknown
  registration_deadline?: unknown
}

type EventScheduleLike = {
  status?: unknown
  start_at?: unknown
  end_at?: unknown
}

function parseOptionalDate(value: unknown): Date | null | 'invalid' {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return 'invalid'

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'invalid' : date
}

export function eventScheduleValidationError(event: EventScheduleLike): string | null {
  const start = parseOptionalDate(event.start_at)
  const end = parseOptionalDate(event.end_at)
  const status = typeof event.status === 'string' ? event.status : 'upcoming'
  const terminal = status === 'finished' || status === 'cancelled'

  if (start === 'invalid') return 'Nieprawidłowa data rozpoczęcia wydarzenia'
  if (end === 'invalid') return 'Nieprawidłowa data zakończenia wydarzenia'

  // Legacy terminal events may not have complete schedule data. Active events
  // need both dates so their effective status can always close automatically.
  if (!terminal && !start) return 'Data rozpoczęcia wydarzenia jest wymagana'
  if (!terminal && !end) return 'Data zakończenia wydarzenia jest wymagana'

  if (start && end && end <= start) {
    return 'Data zakończenia wydarzenia musi przypadać po dacie rozpoczęcia'
  }

  return null
}

export function registrationWindowValidationError(
  event: RegistrationWindowLike,
): string | null {
  const opensAt = parseOptionalDate(event.registration_opens_at)
  const deadline = parseOptionalDate(event.registration_deadline)
  const eventStart = parseOptionalDate(event.start_at)

  if (opensAt === 'invalid') return 'Nieprawidłowa data początku zapisów'
  if (deadline === 'invalid') return 'Nieprawidłowa data końca zapisów'
  if (eventStart === 'invalid') return 'Nieprawidłowa data rozpoczęcia wydarzenia'

  if (opensAt && deadline && opensAt >= deadline) {
    return 'Początek zapisów musi przypadać przed końcem zapisów'
  }

  if (opensAt && eventStart && opensAt >= eventStart) {
    return 'Początek zapisów musi przypadać przed rozpoczęciem wydarzenia'
  }

  return null
}
