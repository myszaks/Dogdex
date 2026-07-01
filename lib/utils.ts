import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { DogEvent } from "@/types"
import { effectiveEventStatus, isEventRegistrationOpen } from "@/lib/eventStatus"

export const DISPLAY_TIME_ZONE = 'Europe/Warsaw'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Polish plural form helper.
 * plForm(3, 'termin', 'terminy', 'terminów') → '3 terminy'
 */
export function plForm(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`
  return `${n} ${many}`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      timeZone: DISPLAY_TIME_ZONE,
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      timeZone: DISPLAY_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export function formatTime(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const totalSec = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  const millis = ms % 1000
  return `${minutes > 0 ? `${minutes}m ` : ''}${seconds}.${String(millis).padStart(3, '0')}s`
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    upcoming: 'Nadchodzące',
    ongoing: 'W trakcie',
    finished: 'Zakończone',
    cancelled: 'Odwołane',
  }
  return labels[status] ?? status
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    upcoming: 'badge-blue',
    ongoing: 'badge-green',
    finished: 'badge-sage',
    cancelled: 'badge-red',
  }
  return colors[status] ?? 'badge'
}

export function statusBadgeClasses(status: string): string {
  const map: Record<string, string> = {
    upcoming: 'bg-blue-100 text-blue-700',
    ongoing: 'bg-emerald-100 text-emerald-700',
    finished: 'bg-secondary text-muted-foreground',
    cancelled: 'bg-red-100 text-red-700',
  }
  return map[status] ?? 'bg-secondary text-muted-foreground'
}

export function isRegistrationOpen(event: DogEvent): boolean {
  return isEventRegistrationOpen(event)
}

export function effectiveStatus(event: DogEvent): string {
  return effectiveEventStatus(event)
}

