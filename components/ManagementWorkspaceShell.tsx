'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CalendarClock,
  CalendarCog,
  CalendarDays,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  Settings2,
  Shield,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isOrganizerRole, isTrainerRole } from '@/lib/roles'
import PageHeader from '@/components/layout/PageHeader'

interface ManagementWorkspaceShellProps {
  children: React.ReactNode
  role: string | null
}

interface WorkspaceTab {
  href: string
  label: string
  Icon: React.ElementType
  active: (pathname: string) => boolean
}

const organizerTabs: WorkspaceTab[] = [
  {
    href: '/organizer',
    label: 'Wydarzenia',
    Icon: CalendarDays,
    active: pathname => pathname === '/organizer' || pathname.startsWith('/organizer/events'),
  },
  {
    href: '/organizer/formats',
    label: 'Formaty wyników',
    Icon: SlidersHorizontal,
    active: pathname => pathname.startsWith('/organizer/formats'),
  },
  {
    href: '/organizer/profile',
    label: 'Profil publiczny',
    Icon: Settings2,
    active: pathname => pathname.startsWith('/organizer/profile'),
  },
]

const trainerTabs: WorkspaceTab[] = [
  { href: '/trainer', label: 'Pulpit', Icon: LayoutDashboard, active: pathname => pathname === '/trainer' },
  { href: '/trainer/bookings', label: 'Rezerwacje', Icon: ListChecks, active: pathname => pathname.startsWith('/trainer/bookings') },
  { href: '/trainer/types', label: 'Oferta', Icon: Dumbbell, active: pathname => pathname.startsWith('/trainer/types') },
  { href: '/trainer/availability', label: 'Dostępność', Icon: CalendarClock, active: pathname => pathname.startsWith('/trainer/availability') },
  { href: '/trainer/analytics', label: 'Analityka', Icon: BarChart3, active: pathname => pathname.startsWith('/trainer/analytics') },
  { href: '/trainer/profile', label: 'Profil trenera', Icon: Settings2, active: pathname => pathname.startsWith('/trainer/profile') },
]

export default function ManagementWorkspaceShell({ children, role }: ManagementWorkspaceShellProps) {
  const pathname = usePathname() ?? ''
  const organizer = isOrganizerRole(role)
  const trainer = isTrainerRole(role)
  const eventWorkspace = /^\/organizer\/events\/(?!new(?:\/|$))[^/]+/.test(pathname)

  const primaryTabs: WorkspaceTab[] = [
    { href: '/manage', label: 'Przegląd', Icon: LayoutDashboard, active: path => path === '/manage' },
    ...(organizer ? [{ href: '/organizer', label: 'Wydarzenia', Icon: CalendarCog, active: (path: string) => path.startsWith('/organizer') }] : []),
    ...(trainer ? [{ href: '/trainer', label: 'Treningi', Icon: Dumbbell, active: (path: string) => path.startsWith('/trainer') }] : []),
    { href: '/payments', label: 'Płatności', Icon: CreditCard, active: path => path.startsWith('/payments') },
    ...(role === 'admin' ? [{ href: '/admin/users', label: 'Administracja', Icon: Shield, active: (path: string) => path.startsWith('/admin') }] : []),
  ]

  const secondaryTabs = pathname.startsWith('/organizer')
    && !eventWorkspace
    ? organizerTabs
    : pathname.startsWith('/trainer')
      ? trainerTabs
      : []

  return (
    <div className="space-y-7">
      <header className="space-y-5">
        {!eventWorkspace && (
          <PageHeader
            eyebrow="Centrum pracy"
            title="Zarządzanie"
            description="Wydarzenia, treningi i rozliczenia w jednym miejscu."
            breadcrumbs={[{ label: 'Główna', href: '/' }, { label: 'Zarządzanie' }]}
          />
        )}

        <WorkspaceNavigation label="Główne obszary zarządzania" pathname={pathname} tabs={primaryTabs} />

        {secondaryTabs.length > 0 && (
          <WorkspaceNavigation
            compact
            label={pathname.startsWith('/organizer') ? 'Narzędzia organizatora' : 'Narzędzia trenera'}
            pathname={pathname}
            tabs={secondaryTabs}
          />
        )}
      </header>

      {children}
    </div>
  )
}

function WorkspaceNavigation({
  compact = false,
  label,
  pathname,
  tabs,
}: {
  compact?: boolean
  label: string
  pathname: string
  tabs: WorkspaceTab[]
}) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className={cn(
        'flex min-w-max gap-1 p-1.5',
        compact ? 'border-b border-border' : 'rounded-2xl bg-secondary/80',
      )}>
        {tabs.map(({ href, label: tabLabel, Icon, active }) => {
          const isActive = active(pathname)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? compact
                    ? 'bg-accent/10 text-accent'
                    : 'bg-white text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {tabLabel}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
