import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { CalendarCog, CreditCard, Dumbbell, Shield } from 'lucide-react'
import { getServerUser } from '@/lib/getServerUser'
import { isOrganizerRole, isTrainerRole } from '@/lib/roles'

export const metadata: Metadata = { title: 'Zarządzanie' }
export const dynamic = 'force-dynamic'

export default async function ManagePage() {
  const { user, role } = await getServerUser()
  if (!user) redirect('/')

  const organizer = isOrganizerRole(role)
  const trainer = isTrainerRole(role)
  if (!organizer && !trainer) redirect('/profile/role-request')

  return (
    <div className="space-y-7">
      <header>
        <h2 className="font-heading text-2xl font-bold">Przegląd</h2>
        <p className="mt-2 text-muted-foreground">
          Wybierz obszar, którym chcesz się teraz zająć.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {organizer && (
          <WorkspaceCard href="/organizer" title="Wydarzenia" description="Zapisy, grafiki, check-in i wyniki." Icon={CalendarCog} />
        )}
        {trainer && (
          <WorkspaceCard href="/trainer" title="Treningi" description="Rezerwacje, dostępność i oferta treningów." Icon={Dumbbell} />
        )}
        <WorkspaceCard href="/payments" title="Płatności" description="Wspólne rozliczenia wydarzeń i treningów." Icon={CreditCard} />
        {role === 'admin' && (
          <WorkspaceCard href="/admin/users" title="Administracja" description="Użytkownicy, role i uprawnienia." Icon={Shield} />
        )}
      </div>
    </div>
  )
}

function WorkspaceCard({
  href,
  title,
  description,
  Icon,
}: {
  href: string
  title: string
  description: string
  Icon: React.ElementType
}) {
  return (
    <Link href={href} className="card card-hover group p-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-5 font-heading text-xl font-semibold group-hover:text-accent">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <span className="mt-5 inline-block text-sm font-semibold text-accent">Otwórz →</span>
    </Link>
  )
}
