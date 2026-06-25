import { effectiveEventStatus } from '@/lib/eventStatus'

const REMINDER_TIME_ZONE = 'Europe/Warsaw'

export function getIsoDateInTimeZone(date: Date, timeZone = REMINDER_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value || ''

  return `${value('year')}-${value('month')}-${value('day')}`
}

export function hasMultidateSelection(formData: Record<string, unknown>) {
  return Object.values(formData).some(value =>
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item))
  )
}

export function shouldSendMultidateReminder(event: {
  status: string
  start_at: string | null
  end_at?: string | null
}) {
  return effectiveEventStatus(event) === 'upcoming'
}
