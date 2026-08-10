import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'
import { isPayoutRole } from '@/lib/roles'
import { getBusinessProfileAccess } from '@/lib/businessAccess'

function csv(value: unknown): string {
  const raw = value == null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[,"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export async function GET() {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  const businessAccess = await getBusinessProfileAccess()
  const hasBusinessPayments = Boolean(businessAccess?.can('payments.view'))
  if (!isPayoutRole(role) && !hasBusinessPayments) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  const db = createServerClient()
  const rows: string[][] = []
  let eventPaymentsQuery = db.from('event_payments')
    .select('id, payer_email, amount, refunded_amount, currency, status, created_at, stripe_payment_intent_id, reconciliation_status, reconciliation_error, registrations(participants(owner_name, dog_name), events(title)), event_payment_items(event_registration_items(label))')
  eventPaymentsQuery = hasBusinessPayments
    ? eventPaymentsQuery.eq('business_profile_id', businessAccess!.profile.id)
    : eventPaymentsQuery.eq('payee_user_id', user.id)
  const { data: eventPayments } = await eventPaymentsQuery.order('created_at', { ascending: false }).limit(1000)
  for (const payment of eventPayments ?? []) {
    const registration = Array.isArray(payment.registrations) ? payment.registrations[0] : payment.registrations
    const participant = Array.isArray(registration?.participants) ? registration.participants[0] : registration?.participants
    const event = Array.isArray(registration?.events) ? registration.events[0] : registration?.events
    const labels = (payment.event_payment_items ?? []).map(item => {
      const registrationItem = Array.isArray(item.event_registration_items) ? item.event_registration_items[0] : item.event_registration_items
      return registrationItem?.label
    }).filter(Boolean).join('; ')
    rows.push(['Wydarzenie', payment.created_at, event?.title ?? '', labels, participant?.owner_name ?? '', participant?.dog_name ?? '', payment.payer_email, String(payment.amount), String(payment.refunded_amount ?? 0), String(Number(payment.amount) - Number(payment.refunded_amount ?? 0)), payment.currency, payment.status, payment.stripe_payment_intent_id ?? '', payment.reconciliation_status, payment.reconciliation_error ?? ''])
  }

  let typesQuery = db.from('training_types').select('id, name')
  typesQuery = hasBusinessPayments
    ? typesQuery.eq('business_profile_id', businessAccess!.profile.id)
    : typesQuery.eq('trainer_id', user.id)
  const { data: types } = await typesQuery
  const typeMap = new Map((types ?? []).map(type => [type.id, type.name]))
  if (typeMap.size) {
    const { data: bookings } = await db.from('training_bookings')
      .select('id, training_type_id, scheduled_at, user_id, dog_id')
      .in('training_type_id', [...typeMap.keys()])
    const bookingMap = new Map((bookings ?? []).map(booking => [booking.id, booking]))
    if (bookingMap.size) {
      const userIds = [...new Set((bookings ?? []).map(booking => booking.user_id).filter(Boolean))]
      const dogIds = [...new Set((bookings ?? []).map(booking => booking.dog_id).filter(Boolean))]
      const [{ data: profiles }, { data: dogs }, authUsers] = await Promise.all([
        userIds.length
          ? db.from('profiles').select('id, full_name').in('id', userIds)
          : Promise.resolve({ data: [] }),
        dogIds.length
          ? db.from('dogs').select('id, name').in('id', dogIds)
          : Promise.resolve({ data: [] }),
        Promise.all(userIds.map(async userId => {
          const { data, error } = await db.auth.admin.getUserById(userId)
          if (error || !data.user) return { id: userId, email: '', metadataName: '' }
          return {
            id: userId,
            email: data.user.email ?? '',
            metadataName: typeof data.user.user_metadata?.full_name === 'string'
              ? data.user.user_metadata.full_name
              : '',
          }
        })),
      ])
      const profileNameById = new Map((profiles ?? []).map(profile => [profile.id, profile.full_name ?? '']))
      const dogNameById = new Map((dogs ?? []).map(dog => [dog.id, dog.name ?? '']))
      const authUserById = new Map(authUsers.map(authUser => [authUser.id, authUser]))

      const { data: payments } = await db.from('training_payments').select('id, booking_id, amount, currency, status, created_at, stripe_payment_intent_id').in('booking_id', [...bookingMap.keys()]).limit(1000)
      for (const payment of payments ?? []) {
        const booking = bookingMap.get(payment.booking_id)
        if (!booking) continue
        const refunded = payment.status === 'refunded' ? Number(payment.amount) : 0
        const authUser = authUserById.get(booking.user_id)
        const clientName = profileNameById.get(booking.user_id) || authUser?.metadataName || 'Użytkownik'
        const dogName = booking.dog_id ? dogNameById.get(booking.dog_id) ?? '' : ''
        rows.push(['Trening', payment.created_at, typeMap.get(booking.training_type_id) ?? 'Trening', booking.scheduled_at, clientName, dogName, authUser?.email ?? '', String(payment.amount), String(refunded), String(Number(payment.amount) - refunded), payment.currency, payment.status, payment.stripe_payment_intent_id ?? '', '', ''])
      }
    }
  }
  rows.sort((a, b) => b[1].localeCompare(a[1]))
  const headers = ['Źródło', 'Data transakcji', 'Nazwa', 'Szczegóły', 'Klient', 'Pies', 'E-mail płatnika', 'Kwota brutto', 'Zwroty', 'Kwota netto', 'Waluta', 'Status', 'PaymentIntent', 'Uzgodnienie', 'Uwagi']
  const content = [headers, ...rows].map(row => row.map(csv).join(',')).join('\r\n')
  return new NextResponse(`\uFEFF${content}`, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="platnosci-dogdex-${new Date().toISOString().slice(0, 10)}.csv"`,
  } })
}
