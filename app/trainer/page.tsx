import Link from 'next/link'
import type { Metadata } from 'next'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { BookOpen, Calendar, Plus, Settings2 } from 'lucide-react'
import { requireRole } from '@/lib/getServerUser'
import { createAuthClient } from '@/lib/supabaseServer'
import { hydrateTrainingBookings, type TrainingBookingWithRelations } from '@/lib/trainingBookingRelations'

export const metadata: Metadata = { title: 'Panel Trenera' }
export const dynamic = 'force-dynamic'

function getStatusBadge(status: string) {
  if (status === 'pending') {
    return 'bg-amber-100 text-amber-800'
  }

  if (status === 'confirmed') {
    return 'bg-green-100 text-green-800'
  }

  return 'bg-slate-100 text-slate-700'
}

function getStatusLabel(status: string) {
  if (status === 'pending') {
    return 'Oczekuje'
  }

  if (status === 'confirmed') {
    return 'Potwierdzone'
  }

  if (status === 'cancelled') {
    return 'Anulowane'
  }

  return 'Ukonczone'
}

export default async function TrainerPage() {
  const { user } = await requireRole(['trainer', 'admin'])
  const supabase = await createAuthClient()

  const [{ data: profile }, { data: types }] = await Promise.all([
    supabase
      .from('trainer_profiles')
      .select('*')
      .eq('trainer_id', user.id)
      .single(),
    supabase
      .from('training_types')
      .select('*')
      .eq('trainer_id', user.id),
  ])

  const typeIds = (types ?? []).map(type => type.id)
  let bookings: TrainingBookingWithRelations[] = []

  if (typeIds.length > 0) {
    const { data: rawBookings } = await supabase
      .from('training_bookings')
      .select('*')
      .in('training_type_id', typeIds)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5)

    bookings = await hydrateTrainingBookings(supabase, rawBookings ?? [], {
      dogsClient: supabase,
    })
  }

  const isActive = profile?.is_active || false
  const typesCount = types?.length || 0
  const bookingsCount = bookings.length

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="page-title mb-1">Panel Trenera</h1>
          <p className="text-muted-foreground">
            {isActive ? 'Twoj profil jest aktywny' : 'Aktywuj profil, aby rozpoczac przyjmowanie rezerwacji'}
          </p>
        </div>
        <Link href="/trainer/profile" className="btn btn-primary">
          <Settings2 className="w-4 h-4" />
          Edytuj profil
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Rodzaje treningow</p>
              <p className="text-3xl font-bold">{typesCount}</p>
            </div>
            <BookOpen className="w-8 h-8 text-accent opacity-30" />
          </div>
          {typesCount === 0 && (
            <Link href="/trainer/types" className="mt-4 inline-block text-sm text-accent hover:underline font-semibold">
              Dodaj pierwszy typ {'->'}
            </Link>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Nadchodzace rezerwacje</p>
              <p className="text-3xl font-bold">{bookingsCount}</p>
            </div>
            <Calendar className="w-8 h-8 text-accent opacity-30" />
          </div>
        </div>

        <div className="card p-6">
          <p className="text-sm text-muted-foreground mb-2">Status profilu</p>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-amber-500'}`} />
            <span className="font-semibold">{isActive ? 'Aktywny' : 'Nieaktywny'}</span>
          </div>
          {!isActive && (
            <Link href="/trainer/profile" className="mt-4 block text-sm text-accent hover:underline font-semibold">
              Aktywuj profil {'->'}
            </Link>
          )}
        </div>
      </div>

      {isActive && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Link href="/trainer/types" className="card hover:shadow-lg transition-shadow p-6 cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <Plus className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-lg mb-1">Rodzaje treningow</h3>
                <p className="text-sm text-muted-foreground">Dodaj lub edytuj rodzaje treningow</p>
              </div>
            </div>
          </Link>

          <Link href="/trainer/availability" className="card hover:shadow-lg transition-shadow p-6 cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-lg mb-1">Dostepnosc</h3>
                <p className="text-sm text-muted-foreground">Ustaw dni i godziny dostepnosci</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {bookingsCount > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-heading font-semibold text-xl">Nadchodzace rezerwacje</h2>
            <Link href="/trainer/bookings" className="text-sm text-accent hover:underline">
              Wszystkie {'->'}
            </Link>
          </div>

          <div className="space-y-4">
            {bookings.map(booking => (
              <Link
                key={booking.id}
                href={`/trainer/bookings/${booking.id}`}
                className="card card-hover block w-full p-6 cursor-pointer"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-lg mb-1 truncate">
                      {booking.training_types?.name ?? 'Trening indywidualny'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(booking.scheduled_at), 'd MMMM yyyy, HH:mm', { locale: pl })}
                    </p>
                    {booking.dogs?.name && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Pies: <span className="font-medium text-foreground">{booking.dogs.name}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(booking.status)}`}>
                      {getStatusLabel(booking.status)}
                    </span>
                    <span className="text-sm font-medium text-accent">Szczegoly {'->'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
