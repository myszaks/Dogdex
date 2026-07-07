import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { ArrowLeft, Calendar, Clock, Dog, FileText, Mail, User } from 'lucide-react'
import { requireRole } from '@/lib/getServerUser'
import { createAuthClient, createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import type { TrainingBookingWithRelations } from '@/lib/trainingBookingRelations'
import TrainerBookingActions from './TrainerBookingActions'

export const metadata: Metadata = { title: 'Szczegoly rezerwacji' }
export const dynamic = 'force-dynamic'

interface TrainerBookingDetails extends TrainingBookingWithRelations {
  user_name: string
  user_email: string
}

interface TrainerBookingDetailPageProps {
  params: Promise<{ id: string }>
}

function getStatusBadge(status: string) {
  if (status === 'pending') {
    return 'bg-amber-100 text-amber-800'
  }
  if (status === 'confirmed') {
    return 'bg-green-100 text-green-800'
  }
  if (status === 'cancelled') {
    return 'bg-red-100 text-red-800'
  }
  return 'bg-slate-100 text-slate-800'
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

async function getTrainerBookingDetails(
  trainerId: string,
  bookingId: string,
  role: string
): Promise<TrainerBookingDetails | null> {
  const authClient = await createAuthClient()
  const privilegedClient = hasServiceRoleKey() ? createServerClient() : null
  const bookingClient = role === 'admin' && privilegedClient ? privilegedClient : authClient

  const { data: rawBooking, error } = await bookingClient
    .from('training_bookings')
    .select('*, training_types(id, slug, trainer_id, name, description, price_per_hour, duration_min, is_active, created_at, updated_at)')
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !rawBooking) {
    return null
  }

  const booking = rawBooking as TrainerBookingDetails
  if (!booking.training_types) {
    return null
  }

  if (role !== 'admin' && booking.training_types.trainer_id !== trainerId) {
    return null
  }

  let userName = 'Uzytkownik'
  let userEmail = 'Kontakt niedostepny'
  let dog = null as { id: string; name: string } | null

  if (privilegedClient) {
    const [{ data: profile }, authUserResult, dogResult] = await Promise.all([
      privilegedClient
        .from('profiles')
        .select('full_name')
        .eq('id', booking.user_id)
        .maybeSingle(),
      privilegedClient.auth.admin.getUserById(booking.user_id),
      booking.dog_id
        ? privilegedClient
            .from('dogs')
            .select('id, name')
            .eq('id', booking.dog_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    userName = typeof profile?.full_name === 'string' && profile.full_name.trim().length > 0
      ? profile.full_name
      : authUserResult.data.user?.email || userName
    userEmail = authUserResult.data.user?.email || userEmail
    dog = dogResult.data
  }

  return {
    ...booking,
    dogs: dog ?? undefined,
    user_name: userName,
    user_email: userEmail,
  }
}

export default async function TrainerBookingDetailPage({ params }: TrainerBookingDetailPageProps) {
  const { user, role } = await requireRole(['trainer', 'admin'])
  const { id } = await params

  const booking = await getTrainerBookingDetails(user.id, id, role)
  if (!booking) {
    notFound()
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href="/trainer/bookings" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wroc do rezerwacji
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="page-title mb-2">{booking.training_types?.name ?? 'Rezerwacja treningu'}</h1>
          <p className="text-muted-foreground">
            Szczegoly rezerwacji i dane klienta.
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${getStatusBadge(booking.status)}`}>
          {getStatusLabel(booking.status)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-heading font-semibold text-lg mb-4">Termin</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-secondary/50 px-4 py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  Data
                </div>
                <p className="font-semibold text-foreground">
                  {format(parseISO(booking.scheduled_at), 'd MMMM yyyy', { locale: pl })}
                </p>
              </div>

              <div className="rounded-2xl bg-secondary/50 px-4 py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Clock className="w-4 h-4" />
                  Godzina i czas trwania
                </div>
                <p className="font-semibold text-foreground">
                  {format(parseISO(booking.scheduled_at), 'HH:mm', { locale: pl })} | {booking.duration_min} min
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-heading font-semibold text-lg mb-4">Klient</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Imie i nazwisko</p>
                  <p className="font-semibold text-foreground">{booking.user_name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Adres e-mail</p>
                  {booking.user_email === 'Kontakt niedostepny' ? (
                    <p className="font-semibold text-foreground">{booking.user_email}</p>
                  ) : (
                    <a href={`mailto:${booking.user_email}`} className="font-semibold text-accent hover:underline">
                      {booking.user_email}
                    </a>
                  )}
                </div>
              </div>

              {booking.dogs?.name && (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
                    <Dog className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pies</p>
                    <p className="font-semibold text-foreground">{booking.dogs.name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {booking.notes_user && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-accent" />
                <h2 className="font-heading font-semibold text-lg">Notatka od klienta</h2>
              </div>
              <p className="text-foreground whitespace-pre-wrap">{booking.notes_user}</p>
            </div>
          )}

          {booking.notes_trainer && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-accent" />
                <h2 className="font-heading font-semibold text-lg">Notatka trenera</h2>
              </div>
              <p className="text-foreground whitespace-pre-wrap">{booking.notes_trainer}</p>
            </div>
          )}

          {booking.cancellation_reason && (
            <div className="card p-6 border-red-200 bg-red-50/60">
              <h2 className="font-heading font-semibold text-lg text-red-800 mb-2">Powod anulacji</h2>
              <p className="text-red-700 whitespace-pre-wrap">{booking.cancellation_reason}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <TrainerBookingActions bookingId={booking.id} status={booking.status} />

          <div className="card p-6">
            <h2 className="font-heading font-semibold text-lg mb-4">Nawigacja</h2>
            <div className="flex flex-col gap-3">
              <Link href="/trainer/bookings" className="btn btn-secondary justify-center">
                Wszystkie rezerwacje
              </Link>
              <Link href="/trainer" className="btn btn-secondary justify-center">
                Panel trenera
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
