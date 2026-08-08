interface EventSchedule {
  status: unknown
  startAt: unknown
  endAt: unknown
}

function parseOptionalDate(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return 'invalid'
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? 'invalid' : timestamp
}

export function validateEventSchedule({ status, startAt, endAt }: EventSchedule): string | null {
  const start = parseOptionalDate(startAt)
  const end = parseOptionalDate(endAt)
  const normalizedStatus = typeof status === 'string' ? status : 'upcoming'

  if (start === 'invalid') return 'Data rozpoczęcia wydarzenia jest nieprawidłowa'
  if (end === 'invalid') return 'Data zakończenia wydarzenia jest nieprawidłowa'

  const scheduleOptional = normalizedStatus === 'draft'
    || normalizedStatus === 'finished'
    || normalizedStatus === 'cancelled'
  if (!scheduleOptional && start === null) return 'Data rozpoczęcia wydarzenia jest wymagana'
  if (!scheduleOptional && end === null) return 'Data zakończenia wydarzenia jest wymagana'

  if (typeof start === 'number' && typeof end === 'number' && end <= start) {
    return 'Data zakończenia wydarzenia musi przypadać po dacie rozpoczęcia'
  }

  return null
}
