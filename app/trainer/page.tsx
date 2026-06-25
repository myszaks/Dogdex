import { createAuthClient } from '@/lib/supabaseServer'
import { requireRole } from '@/lib/getServerUser'
import Link from 'next/link'
import { Settings2, Plus, Calendar, BookOpen } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Panel Trenera' }
export const dynamic = 'force-dynamic'

export default async function TrainerPage() {
  const { user } = await requireRole(['organizer', 'admin'])
  const supabase = await createAuthClient()

  // Get trainer profile
  const { data: profile } = await supabase
    .from('trainer_profiles')
    .select('*')
    .eq('trainer_id', user.id)
    .single()

  // Get training types
  const { data: types } = await supabase
    .from('training_types')
    .select('*')
    .eq('trainer_id', user.id)

  // Get upcoming bookings
  const { data: bookings } = await supabase
    .from('training_bookings')
    .select('*, training_types(name)')
    .in('training_types.trainer_id', [user.id])
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(5)

  const isActive = profile?.is_active || false
  const typesCount = types?.length || 0
  const bookingsCount = bookings?.length || 0

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-title mb-1">Panel Trenera</h1>
          <p className="text-muted-foreground">
            {isActive ? '✓ Twój profil jest aktywny' : 'Aktywuj profil aby rozpocząć przyjmowanie rezerwacji'}
          </p>
        </div>
        <Link href="/trainer/profile" className="btn btn-primary">
          <Settings2 className="w-4 h-4" />
          Edytuj profil
        </Link>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Rodzaje treningów</p>
              <p className="text-3xl font-bold">{typesCount}</p>
            </div>
            <BookOpen className="w-8 h-8 text-accent opacity-30" />
          </div>
          {typesCount === 0 && (
            <Link href="/trainer/types" className="mt-4 inline-block text-sm text-accent hover:underline font-semibold">
              Dodaj pierwszy typ →
            </Link>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Nadchodzące rezerwacje</p>
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
              Aktywuj profil →
            </Link>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      {isActive && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Link href="/trainer/types" className="card hover:shadow-lg transition-shadow p-6 cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <Plus className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-lg mb-1">Rodzaje treningów</h3>
                <p className="text-sm text-muted-foreground">Dodaj lub edytuj rodzaje treningów</p>
              </div>
            </div>
          </Link>

          <Link href="/trainer/availability" className="card hover:shadow-lg transition-shadow p-6 cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-lg mb-1">Dostępność</h3>
                <p className="text-sm text-muted-foreground">Ustaw dni i godziny dostępności</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Upcoming Bookings */}
      {bookingsCount > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-heading font-semibold text-xl">Nadchodzące rezerwacje</h2>
            <Link href="/trainer/bookings" className="text-sm text-accent hover:underline">
              Wszystkie →
            </Link>
          </div>

          <div className="space-y-4">
            {bookings?.map(booking => (
              <Link
                key={booking.id}
                href={`/trainer/bookings/${booking.id}`}
                className="card p-6 hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-heading font-semibold text-lg mb-1">
                      {booking.training_types?.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {new Date(booking.scheduled_at).toLocaleDateString('pl-PL', {
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    booking.status === 'pending'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {booking.status === 'pending' ? 'Oczekuje' : 'Potwierdzone'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
