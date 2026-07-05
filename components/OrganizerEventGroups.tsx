'use client'
import { useState } from 'react'
import OrganizerEventCard from './OrganizerEventCard'
import type { DogEvent } from '@/types'
import { effectiveStatus } from '@/lib/utils'
import { ChevronDown, ChevronRight, Radio, Calendar, CheckCircle2, XCircle } from 'lucide-react'

interface Props {
  events: DogEvent[]
  registrationCountMap?: Record<string, number>
}

interface GroupConfig {
  key: string
  label: string
  icon: React.ReactNode
  color: string
  defaultCollapsed: boolean
}

const GROUPS: GroupConfig[] = [
  {
    key: 'ongoing',
    label: 'W trakcie',
    icon: <Radio className="w-4 h-4 text-emerald-600" />,
    color: 'text-emerald-700',
    defaultCollapsed: false,
  },
  {
    key: 'upcoming',
    label: 'Nadchodzące',
    icon: <Calendar className="w-4 h-4 text-blue-600" />,
    color: 'text-blue-700',
    defaultCollapsed: false,
  },
  {
    key: 'finished',
    label: 'Zakończone',
    icon: <CheckCircle2 className="w-4 h-4 text-muted-foreground" />,
    color: 'text-muted-foreground',
    defaultCollapsed: false,
  },
  {
    key: 'cancelled',
    label: 'Odwołane',
    icon: <XCircle className="w-4 h-4 text-red-500" />,
    color: 'text-red-600',
    defaultCollapsed: true,
  },
]

export default function OrganizerEventGroups({ events, registrationCountMap = {} }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    Object.fromEntries(GROUPS.map(g => [g.key, g.defaultCollapsed]))
  )

  function toggle(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const grouped: Record<string, DogEvent[]> = {
    ongoing: [],
    upcoming: [],
    finished: [],
    cancelled: [],
  }

  for (const event of events) {
    const status = effectiveStatus(event)
    if (status in grouped) grouped[status].push(event)
    else grouped['finished'].push(event)
  }

  // Sort each group
  grouped.ongoing.sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''))
  grouped.upcoming.sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''))
  grouped.finished.sort((a, b) => (b.start_at ?? '').localeCompare(a.start_at ?? ''))
  grouped.cancelled.sort((a, b) => (b.start_at ?? '').localeCompare(a.start_at ?? ''))

  const hasAny = events.length > 0

  if (!hasAny) return null

  return (
    <div className="space-y-8">
      {GROUPS.map(group => {
        const items = grouped[group.key]
        if (items.length === 0) return null

        const isCollapsed = collapsed[group.key]

        return (
          <div key={group.key}>
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggle(group.key)}
              className="flex items-center gap-2 mb-4 w-full text-left group"
            >
              <span className="flex items-center gap-2 flex-1">
                {group.icon}
                <span className={`font-heading font-semibold text-base ${group.color}`}>
                  {group.label}
                </span>
                <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5 font-medium">
                  {items.length}
                </span>
              </span>
              <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4" />
                  : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>

            {/* Cards */}
            {!isCollapsed && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(event => (
                  <OrganizerEventCard
                    key={event.id}
                    event={event}
                    registeredCount={registrationCountMap[event.id] ?? 0}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
