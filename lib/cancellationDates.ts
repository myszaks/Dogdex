export function readCancellationDates(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.filter((date): date is string => typeof date === 'string' && date.length > 0)
}
