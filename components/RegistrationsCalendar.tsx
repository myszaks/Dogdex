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

interface EventDate {
  date: string       // ISO date string YYYY-MM-DD
  id: string
  slug: string | null
  title: string
}

interface Props {
  eventDates: EventDate[]
}

export default function RegistrationsCalendar({ eventDates }: Props) {
  const [current, setCurrent] = useState(() => startOfMonth(new Date()))

  const monthStart = startOfMonth(current)
  const monthEnd = endOfMonth(current)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function eventsOnDay(day: Date): EventDate[] {
    return eventDates.filter(ed => isSameDay(parseISO(ed.date), day))
  }

  const DOW = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd']

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setCurrent(prev => subMonths(prev, 1))}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-heading font-semibold text-foreground capitalize">
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
          const evs = eventsOnDay(day)
          const inMonth = isSameMonth(day, current)
          const today = isToday(day)
          const hasEvents = evs.length > 0

          return (
            <div key={day.toISOString()} className="flex flex-col items-center py-0.5 px-0.5 group relative">
              <div
                className={[
                  'w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors',
                  !inMonth ? 'text-muted-foreground/30' : '',
                  today ? 'ring-2 ring-primary ring-offset-1' : '',
                  hasEvents && inMonth ? 'bg-primary text-primary-foreground font-bold' : inMonth ? 'text-foreground' : '',
                ].join(' ')}
              >
                {format(day, 'd')}
              </div>

              {/* Tooltip on hover */}
              {hasEvents && inMonth && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 hidden group-hover:flex flex-col gap-1 min-w-max pointer-events-auto">
                  {evs.map(ev => (
                    <Link
                      key={`${ev.id}-${ev.date}`}
                      href={`/events/${ev.slug ?? ev.id}`}
                      className="block bg-popover border border-border rounded-lg shadow-lg px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
                    >
                      <span className="font-medium">{ev.title}</span>
                      <span className="text-muted-foreground ml-1.5">
                        {format(parseISO(ev.date), 'd MMM', { locale: pl })}
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
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-primary inline-block" />
          Twój termin
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-primary inline-block" />
          Dzisiaj
        </span>
      </div>
    </div>
  )
}
