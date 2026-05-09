export function toSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '')
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr))
}

export function formatTime(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const seconds = Math.floor(ms / 1000)
  const hundredths = Math.floor((ms % 1000) / 10)
  return `${seconds}.${String(hundredths).padStart(2, '0')} s`
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    upcoming: 'Nadchodzące',
    upcoming_closed: 'Zapisy zamknięte',
    ongoing: 'W trakcie',
    finished: 'Zakończone',
    cancelled: 'Odwołane',
    pending: 'Oczekujące',
    confirmed: 'Potwierdzone',
  }
  return map[status] ?? status
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    upcoming: 'badge-blue',
    upcoming_closed: 'badge-yellow',
    ongoing: 'badge-green',
    finished: 'badge-yellow',
    cancelled: 'badge-red',
    pending: 'badge-yellow',
    confirmed: 'badge-green',
  }
  return map[status] ?? 'badge-blue'
}

/** Returns true if registrations are currently open for this event */
export function isRegistrationOpen(event: { status: string; registration_deadline: string | null }): boolean {
  if (event.status !== 'upcoming') return false
  if (!event.registration_deadline) return true
  return new Date() < new Date(event.registration_deadline)
}

/** Returns the effective display status (adds upcoming_closed when past deadline) */
export function effectiveStatus(event: { status: string; registration_deadline: string | null }): string {
  if (event.status === 'upcoming' && event.registration_deadline && new Date() >= new Date(event.registration_deadline)) {
    return 'upcoming_closed'
  }
  return event.status
}
