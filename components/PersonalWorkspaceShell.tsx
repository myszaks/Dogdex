'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ClipboardList, Dog, ShieldCheck, UserRound, UserRoundCog } from 'lucide-react'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/moje-zapisy', label: 'Zapisy', Icon: ClipboardList, active: (path: string) => path.startsWith('/moje-zapisy') || path.startsWith('/moje-treningi') },
  { href: '/moje-psy', label: 'Psy', Icon: Dog, active: (path: string) => path.startsWith('/moje-psy') },
  { href: '/profile', label: 'Profil', Icon: UserRound, active: (path: string) => path === '/profile' },
  { href: '/profile/role-request', label: 'Role i dostęp', Icon: UserRoundCog, active: (path: string) => path.startsWith('/profile/role-request') },
  { href: '/settings', label: 'Bezpieczeństwo', Icon: ShieldCheck, active: (path: string) => path.startsWith('/settings') },
]

export default function PersonalWorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const trainingsTab = pathname === '/moje-zapisy' && searchParams.get('tab') === 'trainings'

  return (
    <PageContainer className="space-y-7">
      <header className="space-y-5">
        <PageHeader
          eyebrow="Twoja przestrzeń"
          title="Mój Dogdex"
          description="Zapisy, psy oraz ustawienia konta w jednym miejscu."
          breadcrumbs={[{ label: 'Główna', href: '/' }, { label: 'Mój Dogdex' }]}
        />

        <nav aria-label="Mój Dogdex" className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-1 rounded-2xl bg-secondary/80 p-1.5">
            {tabs.map(({ href, label, Icon, active }) => {
              const isActive = active(pathname)
              const target = href === '/moje-zapisy' && trainingsTab ? '/moje-zapisy?tab=trainings' : href
              return (
                <Link
                  key={href}
                  href={target}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>
      </header>

      {children}
    </PageContainer>
  )
}
