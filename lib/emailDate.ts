export const EMAIL_TIME_ZONE = 'Europe/Warsaw'

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

type EmailDateOptions = {
  weekday?: boolean
  year?: boolean
  time?: boolean
}

function parseEmailDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = DATE_ONLY_RE.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

export function formatEmailDate(
  value: string | null | undefined,
  options: EmailDateOptions = {}
): string {
  if (!value) return ''

  const date = parseEmailDate(value)
  if (!date) return value

  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: EMAIL_TIME_ZONE,
    ...(options.weekday ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    ...(options.year !== false ? { year: 'numeric' as const } : {}),
    ...(options.time ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}),
  }).format(date)
}

export function formatEmailDateTime(value: string | null | undefined): string {
  return formatEmailDate(value, { time: true })
}
