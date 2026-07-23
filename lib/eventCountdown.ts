const DAY_IN_MS = 24 * 60 * 60 * 1000

type EventCountdownInput = {
  status: 'upcoming' | 'ongoing' | 'finished' | 'cancelled'
  registrationPhase: 'not_started' | 'open' | 'closed'
  registrationAvailable: boolean
  start_at?: string | null
  end_at?: string | null
  registration_opens_at?: string | null
  registration_deadline?: string | null
}

export type EventCountdown = {
  days: number
  target: 'registration_opening' | 'registration_deadline' | 'event_start' | 'event_end'
  label: 'Do początku zapisów' | 'Do końca zapisów' | 'Do wydarzenia' | 'Do końca wydarzenia'
}

function futureDate(value: string | null | undefined, now: Date): Date | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date <= now) return null

  return date
}

/**
 * Returns a clearly identified countdown target based on the event state.
 *
 * Before registration opens, the counter targets its opening date. An
 * available registration with a future deadline counts down to that deadline.
 * Otherwise an upcoming event counts down to its start. An ongoing event
 * counts down to its end, when available. Finished and cancelled events have
 * no countdown. Any started 24-hour period is shown as one remaining day.
 */
export function getEventCountdown(
  event: EventCountdownInput,
  now = new Date()
): EventCountdown | null {
  if (event.status === 'finished' || event.status === 'cancelled') return null

  if (event.status === 'ongoing') {
    const eventEnd = futureDate(event.end_at, now)
    if (!eventEnd) return null

    return {
      days: Math.ceil((eventEnd.getTime() - now.getTime()) / DAY_IN_MS),
      target: 'event_end',
      label: 'Do końca wydarzenia',
    }
  }

  const eventStart = futureDate(event.start_at, now)
  const registrationOpening = event.registrationPhase === 'not_started'
    ? futureDate(event.registration_opens_at, now)
    : null

  if (
    registrationOpening &&
    (!eventStart || registrationOpening <= eventStart)
  ) {
    return {
      days: Math.ceil((registrationOpening.getTime() - now.getTime()) / DAY_IN_MS),
      target: 'registration_opening',
      label: 'Do początku zapisów',
    }
  }

  const registrationDeadline = event.registrationAvailable
    ? futureDate(event.registration_deadline, now)
    : null

  // A malformed deadline after the event start cannot extend registrations
  // beyond the event itself.
  if (
    registrationDeadline &&
    (!eventStart || registrationDeadline <= eventStart)
  ) {
    return {
      days: Math.ceil((registrationDeadline.getTime() - now.getTime()) / DAY_IN_MS),
      target: 'registration_deadline',
      label: 'Do końca zapisów',
    }
  }

  if (!eventStart) return null

  return {
    days: Math.ceil((eventStart.getTime() - now.getTime()) / DAY_IN_MS),
    target: 'event_start',
    label: 'Do wydarzenia',
  }
}
