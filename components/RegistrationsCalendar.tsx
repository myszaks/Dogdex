'use client'
import { useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, format, parseISO,
} from 'date-fns'
import { pl } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface CalendarDate {
  date: string       // ISO date string YYYY-MM-DD
  id: string
  href: string
  kind: 'event' | 'training'
  title: string
}

interface Props {
  dates: CalendarDate[]
  className?: string
}

export default function RegistrationsCalendar({ className, dates }: Props) {
  const [current, setCurrent] = useState(() => startOfMonth(new Date()))

  const monthStart = startOfMonth(current)
  const monthEnd = endOfMonth(current)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function datesOnDay(day: Date): CalendarDate[] {
    return dates.filter(entry => isSameDay(parseISO(entry.date), day))
  }

  const DOW = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd']

  return (
    <div className={cn('rounded-2xl bg-card p-5 shadow-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setCurrent(prev => subMonths(prev, 1))}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-heading font-semibold text-foreground">
          {format(current, 'LLLL yyyy', { locale: pl })}
        </span>
        <button
          type="button"
          onClick={() => setCurrent(prev => addMonths(prev, 1))}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {days.map(day => {
          const entries = datesOnDay(day)
          const inMonth = isSameMonth(day, current)
          const today = isToday(day)
          const hasEntries = entries.length > 0
          const hasEvent = entries.some(entry => entry.kind === 'event')
          const hasTraining = entries.some(entry => entry.kind === 'training')
          const hasBothKinds = hasEvent && hasTraining

          return (
            <div key={day.toISOString()} className="flex flex-col items-center py-0.5 px-0.5 group relative">
              <div
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors',
                  !inMonth && 'text-muted-foreground/30',
                  inMonth && !hasEntries && 'text-foreground',
                  inMonth && hasEntries && 'font-bold text-white',
                  inMonth && hasEvent && !hasTraining && 'bg-primary',
                  inMonth && hasTraining && !hasEvent && 'bg-accent',
                  today && 'ring-2 ring-primary ring-offset-1'
                )}
                style={inMonth && hasBothKinds
                  ? {
                      background: 'linear-gradient(135deg, hsl(var(--primary)) 0 50%, hsl(var(--accent)) 50% 100%)',
                    }
                  : undefined}
              >
                {format(day, 'd')}
              </div>

              {/* Tooltip on hover */}
              {hasEntries && inMonth && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 hidden group-hover:flex flex-col gap-1 min-w-max pointer-events-auto">
                  {entries.map(entry => (
                    <Link
                      key={`${entry.id}-${entry.date}`}
                      href={entry.href}
                      className="flex items-center bg-popover rounded-lg shadow-lg px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
                    >
                      <span
                        className={cn(
                          'mr-2 h-2 w-2 shrink-0 rounded-full',
                          entry.kind === 'event' ? 'bg-primary' : 'bg-accent'
                        )}
                      />
                      <span className="font-medium">{entry.title}</span>
                      <span className="text-muted-foreground ml-1.5">
                        {format(parseISO(entry.date), 'd MMM', { locale: pl })}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-primary inline-block" />
          Wydarzenie
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-accent inline-block" />
          Trening indywidualny
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-primary inline-block" />
          Dzisiaj
        </span>
      </div>
    </div>
  )
}
