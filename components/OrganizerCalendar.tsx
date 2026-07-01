'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { DogEvent } from '@/types'

// ─── Color palette ─────────────────────────────────────────
const PALETTE = [
  '#10b981', '#3b82f6', '#f59e0b', '#ec4899',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
]

function eventColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

// ─── Date parsing ───────────────────────────────────────────
function toISODate(dateStr: string): string | null {
  // DD.MM.YYYY (Polish format)
  const m = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // ISO datetime or YYYY-MM-DD
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch { /* ignore */ }
  return null
}

// ─── Build date → events map ───────────────────────────────
function buildDateMap(events: DogEvent[]): Map<string, DogEvent[]> {
  const map = new Map<string, DogEvent[]>()

  function push(isoDate: string, event: DogEvent) {
    const list = map.get(isoDate) ?? []
    if (!list.includes(event)) list.push(event)
    map.set(isoDate, list)
  }

  for (const event of events) {
    const multidateField = (event.form_fields ?? []).find(f => f.type === 'multidate')

    if (multidateField?.options?.length) {
      // Multidate event: mark each option date
      for (const opt of multidateField.options) {
        const iso = toISODate(opt)
        if (iso) push(iso, event)
      }
    } else {
      // Regular event: mark start_at and fill range to end_at
      const startISO = event.start_at ? toISODate(event.start_at) : null
      const endISO = event.end_at ? toISODate(event.end_at) : null
      if (startISO) {
        push(startISO, event)
        if (endISO && endISO !== startISO) {
          const cur = new Date(startISO)
          const end = new Date(endISO)
          cur.setDate(cur.getDate() + 1)
          let safety = 0
          while (cur <= end && safety < 366) {
            push(cur.toISOString().slice(0, 10), event)
            cur.setDate(cur.getDate() + 1)
            safety++
          }
        }
      }
    }
  }

  return map
}

// ─── Polish labels ──────────────────────────────────────────
const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]
const DAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd']

interface PopoverState {
  isoDate: string
  events: DogEvent[]
}

interface Props {
  events: DogEvent[]
}

export default function OrganizerCalendar({ events }: Props) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-based
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const dateMap = buildDateMap(events)

  function prevMonth() {
    setPopover(null)
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    setPopover(null)
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Monday-based grid
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7 // Mon=0 … Sun=6

  const todayISO = today.toISOString().slice(0, 10)

  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function handleDayClick(day: number) {
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayEvents = dateMap.get(isoDate)
    if (!dayEvents?.length) { setPopover(null); return }
    if (popover?.isoDate === isoDate) { setPopover(null); return }
    setPopover({ isoDate, events: dayEvents })
  }

  // Unique events for legend (deduplicated)
  const uniqueEvents = [...new Map(events.map(e => [e.id, e])).values()]

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-4 select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
          aria-label="Poprzedni miesiąc"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <h2 className="text-sm font-semibold text-foreground">
          {MONTHS[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
          aria-label="Następny miesiąc"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground/50 py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />
          const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = dateMap.get(isoDate) ?? []
          const isToday = isoDate === todayISO
          const isSelected = popover?.isoDate === isoDate
          const hasEvents = dayEvents.length > 0

          return (
            <div
              key={day}
              onClick={() => handleDayClick(day)}
              className={[
                'flex flex-col items-center py-0.5 rounded-lg transition-colors',
                hasEvents ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
                isSelected ? 'bg-muted' : '',
              ].filter(Boolean).join(' ')}
            >
              <span
                className={[
                  'text-[11px] w-6 h-6 flex items-center justify-center rounded-full leading-none',
                  isToday
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-foreground/80',
                ].join(' ')}
              >
                {day}
              </span>
              {/* Colored dots */}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-[28px]">
                  {dayEvents.slice(0, 3).map(e => (
                    <span
                      key={e.id}
                      className="block w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: eventColor(e.id) }}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] text-muted-foreground leading-none">
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Inline popover */}
      {popover && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground/70">
              {new Date(popover.isoDate + 'T12:00:00').toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              onClick={() => setPopover(null)}
              className="p-0.5 hover:bg-muted rounded"
              aria-label="Zamknij"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
            {popover.events.map(event => (
              <div
                key={event.id}
                className="rounded-xl border border-border bg-background p-2.5"
                style={{ borderLeftColor: eventColor(event.id), borderLeftWidth: '3px' }}
              >
                <p className="text-xs font-semibold text-foreground leading-tight mb-2 line-clamp-2">
                  {event.title}
                </p>
                <div className="flex gap-1.5">
                  <Link
                    href={`/organizer/events/${event.slug}/registrations`}
                    className="flex-1 text-center text-[11px] bg-primary/10 text-primary rounded-lg px-2 py-1 hover:bg-primary/20 transition-colors font-medium"
                  >
                    Zapisy
                  </Link>
                  <Link
                    href={`/events/${event.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center text-[11px] bg-muted text-muted-foreground rounded-lg px-2 py-1 hover:bg-muted/80 transition-colors"
                  >
                    Podgląd
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      {uniqueEvents.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide mb-1.5">
            Legenda
          </p>
          <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
            {uniqueEvents.map(event => (
              <div key={event.id} className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: eventColor(event.id) }}
                />
                <span className="text-[11px] text-muted-foreground truncate">
                  {event.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
