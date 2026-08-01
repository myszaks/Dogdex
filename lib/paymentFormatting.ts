import { DISPLAY_TIME_ZONE } from '@/lib/utils'

export function formatPaymentDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(typeof value === 'string' ? new Date(value) : value)
}
