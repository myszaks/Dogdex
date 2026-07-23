const DAY_IN_MS = 24 * 60 * 60 * 1000

type EventCountdownInput = {
  start_at?: string | null
  registration_deadline?: string | null
}

export type EventCountdown = {
  days: number
  target: 'registration_deadline' | 'event_start'
  label: 'Do końca zapisów' | 'Do wydarzenia'
}

function futureDate(value: string | null | undefined, now: Date): Date | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date <= now) return null

  return date
}

/**
 * Returns a clearly identified countdown target for an upcoming event.
 *
 * A future registration deadline takes precedence. Once registrations close,
 * the countdown switches to the event start. A started/invalid event has no
 * countdown. Any started 24-hour period is presented as one remaining day.
 */
export function getEventCountdown(
  event: EventCountdownInput,
  now = new Date()
): EventCountdown | null {
  const registrationDeadline = futureDate(event.registration_deadline, now)
  if (registrationDeadline) {
    return {
      days: Math.ceil((registrationDeadline.getTime() - now.getTime()) / DAY_IN_MS),
      target: 'registration_deadline',
      label: 'Do końca zapisów',
    }
  }

  const eventStart = futureDate(event.start_at, now)
  if (!eventStart) return null

  return {
    days: Math.ceil((eventStart.getTime() - now.getTime()) / DAY_IN_MS),
    target: 'event_start',
    label: 'Do wydarzenia',
  }
}
