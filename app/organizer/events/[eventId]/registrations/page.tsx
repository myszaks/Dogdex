import { createAuthClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import CsvExportButton from '@/components/CsvExportButton'
import type { Metadata } from 'next'
import type { FormField } from '@/types'
import RegistrationsClientList from '@/components/RegistrationsClientList'

interface Props {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = { title: 'Zapisy' }
export const dynamic = 'force-dynamic'

export default async function RegistrationsPage({ params }: Props) {
  const { eventId } = await params

  const supabase = await createAuthClient()

  const [{ data: event }, { data: registrations, count }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase
      .from('registrations')
      .select('*, participants(*)', { count: 'exact' })
      .eq('event_id', eventId)
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ])

  if (!event) notFound()

  const eventFormFields: FormField[] = Array.isArray(event.form_fields) ? event.form_fields : []

  // Stats across all registrations (not just current page) — fetch counts separately
  const [{ count: confirmedCount }, { count: pendingCount }, { count: cancelledCount }] =
    await Promise.all([
      supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'confirmed'),
      supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'pending'),
      supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'cancelled'),
    ])

  const stats = {
    total: count ?? 0,
    confirmed: confirmedCount ?? 0,
    pending: pendingCount ?? 0,
    cancelled: cancelledCount ?? 0,
  }

  return (
    <div>
      <h1 className="page-title">👥 Zapisy</h1>
      <div className="card mb-4 bg-sky-50 border-sky-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sky-800">{event.title}</p>
            {event.start_at && (
              <p className="text-sm text-sky-600 mt-0.5">📅 {formatDate(event.start_at)}</p>
            )}
          </div>
          <CsvExportButton eventId={eventId} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <div className="card text-center py-2">
          <p className="text-xl font-bold text-slate-800">{stats.total}</p>
          <p className="text-xs text-slate-500">Łącznie</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-xl font-bold text-green-600">{stats.confirmed}</p>
          <p className="text-xs text-slate-500">Potwierdzone</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-slate-500">Oczekujące</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-xl font-bold text-red-500">{stats.cancelled}</p>
          <p className="text-xs text-slate-500">Anulowane</p>
        </div>
      </div>

      {!registrations || registrations.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          Brak zapisów na to wydarzenie
        </div>
      ) : (
        <RegistrationsClientList
          initialRegistrations={registrations as any}
          eventFormFields={eventFormFields}
          groupingField={event.grouping_field ?? null}
          eventId={eventId}
        />
      )}
    </div>
  )
}
