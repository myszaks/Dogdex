'use client'

import { useMemo, useState } from 'react'
import { Activity, Calendar, FileText, LayoutDashboard } from 'lucide-react'
import OrganizerEventGroups from './OrganizerEventGroups'
import type { DogEvent } from '@/types'
import { cn, effectiveStatus } from '@/lib/utils'

type FilterKey = 'all' | 'draft' | 'upcoming' | 'ongoing'

interface Props {
  events: DogEvent[]
  registrationCountMap?: Record<string, number>
}

const FILTERS: Array<{
  key: FilterKey
  label: string
  Icon: typeof LayoutDashboard
  iconClass: string
  valueClass: string
  iconBg: string
}> = [
  {
    key: 'all',
    label: 'Wszystkich',
    Icon: LayoutDashboard,
    iconClass: 'text-primary',
    valueClass: 'text-foreground',
    iconBg: 'bg-secondary',
  },
  {
    key: 'draft',
    label: 'Szkice',
    Icon: FileText,
    iconClass: 'text-slate-600',
    valueClass: 'text-slate-600',
    iconBg: 'bg-slate-100',
  },
  {
    key: 'upcoming',
    label: 'Nadchodzące',
    Icon: Calendar,
    iconClass: 'text-blue-600',
    valueClass: 'text-blue-600',
    iconBg: 'bg-blue-50',
  },
  {
    key: 'ongoing',
    label: 'W trakcie',
    Icon: Activity,
    iconClass: 'text-emerald-600',
    valueClass: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
  },
]

export default function OrganizerEventFilters({ events, registrationCountMap = {} }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  const counts = useMemo(() => {
    const next: Record<FilterKey, number> = {
      all: events.length,
      draft: 0,
      upcoming: 0,
      ongoing: 0,
    }

    for (const event of events) {
      const status = effectiveStatus(event)
      if (status === 'draft' || status === 'upcoming' || status === 'ongoing') {
        next[status] += 1
      }
    }

    return next
  }, [events])

  const filteredEvents = useMemo(() => {
    if (activeFilter === 'all') return events
    return events.filter(event => effectiveStatus(event) === activeFilter)
  }, [activeFilter, events])

  const activeLabel = FILTERS.find(filter => filter.key === activeFilter)?.label ?? 'Wszystkich'

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {FILTERS.map(({ key, label, Icon, iconClass, valueClass, iconBg }) => {
          const active = activeFilter === key

          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter(key)}
              aria-pressed={active}
              className={cn(
                'bg-card rounded-2xl border p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/25',
                active ? 'border-primary ring-2 ring-primary/10' : 'border-border',
              )}
            >
              <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2', iconBg)}>
                <Icon className={cn('w-5 h-5', iconClass)} />
              </span>
              <span className={cn('block text-2xl font-heading font-bold', valueClass)}>
                {counts[key]}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">{label}</span>
            </button>
          )
        })}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-10 text-center shadow-sm">
          <p className="font-heading font-semibold text-foreground text-lg">Brak wydarzeń w filtrze</p>
          <p className="text-muted-foreground text-sm mt-1">
            Nie ma jeszcze wydarzeń w kategorii: {activeLabel}.
          </p>
        </div>
      ) : (
        <OrganizerEventGroups
          events={filteredEvents}
          registrationCountMap={registrationCountMap}
        />
      )}
    </div>
  )
}
