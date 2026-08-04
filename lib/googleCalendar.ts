export interface GoogleCalendarEntry {
  title: string
  start: Date | string
  end?: Date | string | null
  allDay?: boolean
  description?: string | null
  location?: string | null
}

function validDate(value: Date | string) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Nieprawidłowa data kalendarza')
  return date
}

function formatUtc(value: Date | string) {
  return validDate(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function formatAllDay(value: Date | string) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replace(/-/g, '')
  return validDate(value).toISOString().slice(0, 10).replace(/-/g, '')
}

function dayAfter(value: Date | string) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : validDate(value)
  date.setUTCDate(date.getUTCDate() + 1)
  return date
}

export function buildGoogleCalendarUrl(entry: GoogleCalendarEntry) {
  let dates: string
  if (entry.allDay) {
    dates = `${formatAllDay(entry.start)}/${formatAllDay(entry.end ?? dayAfter(entry.start))}`
  } else {
    const start = validDate(entry.start)
    const end = entry.end ? validDate(entry.end) : new Date(start.getTime() + 60 * 60 * 1000)
    dates = `${formatUtc(start)}/${formatUtc(end)}`
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: entry.title,
    dates,
  })
  if (entry.description) params.set('details', entry.description)
  if (entry.location) params.set('location', entry.location)
  params.set('trp', 'false')
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
