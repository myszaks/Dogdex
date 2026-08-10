'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock, ClipboardCheck, Eye, LayoutDashboard, ListChecks, Settings2, Trophy, UsersRound, WalletCards } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import type { EventTeamPermission } from '@/lib/eventPermissions'

interface EventWorkspaceShellProps {
  children: React.ReactNode
  event: {
    slug: string
    title: string
    eventTypeId: string | null
    hasSchedule: boolean
    hasResults: boolean
  }
  permissions: EventTeamPermission[]
  canManageTeam: boolean
  canEditEvent: boolean
}

export default function EventWorkspaceShell({ children, event, permissions, canManageTeam, canEditEvent }: EventWorkspaceShellProps) {
  const pathname = usePathname() ?? ''
  const baseHref = `/organizer/events/${event.slug}`
  const can = (permission: EventTeamPermission) => permissions.includes(permission)
  const tabs = [
    { href: baseHref, label: 'Podsumowanie', Icon: LayoutDashboard, active: pathname === baseHref },
    ...(can('registrations') ? [{ href: `${baseHref}/registrations`, label: 'Zapisy', Icon: ListChecks, active: pathname.startsWith(`${baseHref}/registrations`) }] : []),
    ...(event.hasSchedule && (can('registrations') || can('results')) ? [{ href: `${baseHref}/schedule`, label: 'Grafik', Icon: CalendarClock, active: pathname.startsWith(`${baseHref}/schedule`) }] : []),
    ...(can('checkin') ? [{ href: `${baseHref}/checkin`, label: 'Check-in', Icon: ClipboardCheck, active: pathname.startsWith(`${baseHref}/checkin`) }] : []),
    ...(event.hasResults && can('results') ? [{ href: `${baseHref}/results`, label: 'Wyniki', Icon: Trophy, active: pathname.startsWith(`${baseHref}/results`) || pathname.startsWith(`${baseHref}/live-entry`) }] : []),
    ...(can('finance') ? [{ href: `${baseHref}/finances`, label: 'Finanse', Icon: WalletCards, active: pathname.startsWith(`${baseHref}/finances`) }] : []),
    ...(canManageTeam ? [{ href: `${baseHref}/team`, label: 'Zespół', Icon: UsersRound, active: pathname.startsWith(`${baseHref}/team`) }] : []),
    ...(canEditEvent ? [{ href: `${baseHref}/edit`, label: 'Ustawienia', Icon: Settings2, active: pathname.startsWith(`${baseHref}/edit`) }] : []),
  ]

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Workspace wydarzenia"
        title={event.title}
        description="Wszystkie narzędzia tego wydarzenia w jednym miejscu."
        breadcrumbs={[
          { label: 'Zarządzanie', href: '/manage' },
          { label: 'Wydarzenia', href: '/organizer' },
          { label: event.title },
        ]}
        actions={(
          <Link href={`/events/${event.slug}`} target="_blank" className="btn btn-secondary btn-sm">
            <Eye className="h-4 w-4" />
            Widok publiczny
          </Link>
        )}
      />

      <nav aria-label="Narzędzia wydarzenia" className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-1 rounded-2xl bg-secondary/80 p-1.5">
          {tabs.map(({ href, label, Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {children}
    </section>
  )
}
