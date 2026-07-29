const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidTrainingTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}

export function isValidTrainingTimeRange(start: unknown, end: unknown): boolean {
  return isValidTrainingTime(start)
    && isValidTrainingTime(end)
    && start < end
}

export function isValidTrainingDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}
