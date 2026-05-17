import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { DogEvent } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('pl-PL', {
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
  if (effectiveStatus(event) !== 'upcoming') return false
  if (event.registration_deadline) {
    return new Date(event.registration_deadline) > new Date()
  }
  return true
}

export function effectiveStatus(event: DogEvent): string {
  // Always trust explicit terminal states set by admin
  if (event.status === 'cancelled') return 'cancelled'

  // Derive ongoing/finished/upcoming from actual dates
  const now = new Date()
  const start = event.start_at ? new Date(event.start_at) : null
  const end = event.end_at ? new Date(event.end_at) : null

  if (end && now > end) return 'finished'
  if (start && now >= start) return 'ongoing'
  return 'upcoming'
}

