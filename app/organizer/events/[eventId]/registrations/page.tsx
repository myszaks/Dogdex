import { createServerClient } from '@/lib/supabaseServer'
import { notFound } from 'next/navigation'
import { formatDate, formatDateShort } from '@/lib/utils'
import RegistrationStatusButton from '@/components/RegistrationStatusButton'
import CsvExportButton from '@/components/CsvExportButton'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { FormField } from '@/types'

interface Props {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ strona?: string }>
}

export const metadata: Metadata = { title: 'Zapisy' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

export default async function RegistrationsPage({ params, searchParams }: Props) {
  const { eventId } = await params
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.strona ?? '1', 10))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = createServerClient()

  const [{ data: event }, { data: registrations, count }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase
      .from('registrations')
      .select('*, participants(*)', { count: 'exact' })
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .range(from, to),
  ])

  if (!event) notFound()

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

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
        <div className="space-y-2">
          {registrations.map((reg: any) => (
            <div key={reg.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    🐕 {reg.participants?.dog_name ?? '—'}
                    {reg.participants?.dog_breed && (
                      <span className="text-slate-400 font-normal text-sm ml-1.5">
                        ({reg.participants.dog_breed})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600">
                    👤 {reg.participants?.owner_name ?? '—'}
                  </p>
                  {reg.participants?.owner_email && (
                    <p className="text-xs text-slate-400">{reg.participants.owner_email}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDate(reg.created_at)}
                  </p>
                </div>
                <RegistrationStatusButton regId={reg.id} status={reg.status} />
              </div>

              {/* Extra form_data fields */}
              {reg.form_data && typeof reg.form_data === 'object' && Object.keys(reg.form_data).length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                  {eventFormFields
                    .filter(f => reg.form_data[f.id] !== undefined && reg.form_data[f.id] !== null && reg.form_data[f.id] !== '')
                    .map(f => {
                      const val = reg.form_data[f.id]
                      let display: string
                      if (Array.isArray(val)) {
                        display = f.type === 'multidate'
                          ? val.map((d: string) => { try { return formatDateShort(d) } catch { return d } }).join(', ')
                          : val.join(', ')
                      } else {
                        display = String(val)
                      }
                      return (
                        <div key={f.id} className="flex gap-2 text-xs">
                          <span className="text-slate-400 shrink-0">{f.label}:</span>
                          <span className="text-slate-700 font-medium">{display}</span>
                        </div>
                      )
                    })
                  }
                  {/* Fields not in template (unknown keys) */}
                  {Object.entries(reg.form_data as Record<string, unknown>)
                    .filter(([k]) => !eventFormFields.some(f => f.id === k))
                    .filter(([, v]) => v !== undefined && v !== null && v !== '')
                    .map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="text-slate-400 shrink-0">{k}:</span>
                        <span className="text-slate-700 font-medium">{Array.isArray(v) ? (v as string[]).join(', ') : String(v)}</span>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {page > 1 && (
            <Link
              href={`/organizer/events/${eventId}/registrations?strona=${page - 1}`}
              className="btn btn-secondary btn-sm"
            >
              ← Poprzednia
            </Link>
          )}
          <span className="text-sm text-slate-500">
            Strona {page} z {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/organizer/events/${eventId}/registrations?strona=${page + 1}`}
              className="btn btn-secondary btn-sm"
            >
              Następna →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
