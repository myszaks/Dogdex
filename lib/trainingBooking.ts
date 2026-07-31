export const BOOKING_TIME_ZONE = 'Europe/Warsaw'

export function getBookingDateTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOOKING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value || ''

  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  }
}

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function resolveBookingDuration(requestedDuration: unknown, defaultDuration: number) {
  return defaultDuration
}

export function getInitialTrainingBookingState(priceAmount: number, nowMs = Date.now()) {
  const isPaid = priceAmount > 0
  const now = new Date(nowMs).toISOString()

  return {
    status: isPaid ? 'pending' as const : 'confirmed' as const,
    // Stripe expires Checkout after 30 minutes. Keep a five-minute reconciliation
    // grace period so a payment completed at the boundary cannot be cancelled first.
    expires_at: isPaid ? new Date(nowMs + 35 * 60 * 1000).toISOString() : null,
    confirmed_at: isPaid ? null : now,
  }
}

export function bookingsOverlap(
  startA: Date,
  durationMinutesA: number,
  startB: Date,
  durationMinutesB: number
) {
  const endA = new Date(startA.getTime() + durationMinutesA * 60000)
  const endB = new Date(startB.getTime() + durationMinutesB * 60000)
  return startA < endB && endA > startB
}

export function bookingFitsAvailability(
  bookingStart: Date,
  durationMinutes: number,
  availabilityStart: string,
  availabilityEnd: string
) {
  const bookingEnd = new Date(bookingStart.getTime() + durationMinutes * 60000)
  const { date: bookingDate, time: bookingStartTime } = getBookingDateTimeParts(bookingStart)
  const { date: bookingEndDate, time: bookingEndTime } = getBookingDateTimeParts(bookingEnd)

  if (bookingEndDate !== bookingDate) return false

  const bookingStartMinutes = timeToMinutes(bookingStartTime)
  const bookingEndMinutes = timeToMinutes(bookingEndTime)
  const availabilityStartMinutes = timeToMinutes(availabilityStart)
  const availabilityEndMinutes = timeToMinutes(availabilityEnd)

  return (
    bookingStartMinutes >= availabilityStartMinutes &&
    bookingEndMinutes <= availabilityEndMinutes
  )
}
