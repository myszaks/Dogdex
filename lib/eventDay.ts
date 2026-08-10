export function parseCheckInCode(raw: string): string {
  return raw.trim().replace(/^DOGDEX-CHECKIN:/i, '')
}

export function optimizeEventDayQueue<T extends { checked_in?: boolean | null; order_index?: number | null; created_at?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) =>
    Number(Boolean(right.checked_in)) - Number(Boolean(left.checked_in))
    || (left.order_index ?? Number.MAX_SAFE_INTEGER) - (right.order_index ?? Number.MAX_SAFE_INTEGER)
    || String(left.created_at ?? '').localeCompare(String(right.created_at ?? ''))
  )
}
