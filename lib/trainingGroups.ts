export function buildRecurringSessionStarts(start: Date, count: number, intervalDays: number): string[] {
  if (Number.isNaN(start.getTime())) return []
  const safeCount = Math.max(1, Math.min(100, Math.trunc(count)))
  const safeInterval = Math.max(1, Math.min(365, Math.trunc(intervalDays)))
  return Array.from({ length: safeCount }, (_, index) =>
    new Date(start.getTime() + index * safeInterval * 86400000).toISOString()
  )
}

export function courseEnrollmentStatus(input: {
  occupied: number
  capacity: number
  enrollmentMode: 'open' | 'approval'
  price: number
}): 'confirmed' | 'pending' | 'waitlisted' {
  if (input.occupied >= input.capacity) return 'waitlisted'
  return input.enrollmentMode === 'open' && input.price === 0 ? 'confirmed' : 'pending'
}

export function consumePassBalance(remaining: number): { remaining: number; status: 'active' | 'used' } | null {
  if (!Number.isInteger(remaining) || remaining < 1) return null
  const next = remaining - 1
  return { remaining: next, status: next === 0 ? 'used' : 'active' }
}
