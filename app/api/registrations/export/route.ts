import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { checkRoleForApi } from '@/lib/getServerUser'

export async function GET(req: Request) {
  const authResult = await checkRoleForApi(['organizer', 'admin'])
  if ('error' in authResult) return authResult.error

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'Brak eventId' }, { status: 400 })

  const supabase = createServerClient()

  const { data: event } = await supabase
    .from('events')
    .select('title, form_fields, created_by')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })
  if (authResult.role !== 'admin' && event.created_by !== authResult.user.id) {
    return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
  }

  const { data: registrations } = await supabase
    .from('registrations')
    .select('*, participants(*)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  const formFields: Array<{ id: string; label: string }> = Array.isArray(event.form_fields)
    ? event.form_fields
    : []

  // Build CSV header
  const extraHeaders = formFields.map(f => f.label)
  const headers = [
    'Lp.',
    'Imię właściciela',
    'E-mail',
    'Imię psa',
    'Rasa',
    'Status',
    'Data zapisu',
    ...extraHeaders,
  ]

  function escapeCsv(val: unknown): string {
    if (val == null) return ''
    const formatValue = (value: unknown): string => {
      if (typeof value === 'boolean') return value ? 'Tak' : 'Nie'
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (normalized === 'true') return 'Tak'
        if (normalized === 'false') return 'Nie'
      }
      return String(value)
    }
    const raw = Array.isArray(val) ? val.map(formatValue).join('; ') : formatValue(val)
    const str = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows = (registrations ?? []).map((reg: Record<string, unknown>, idx: number) => {
    const p = (reg.participants as Record<string, unknown>) ?? {}
    const fd: Record<string, unknown> = typeof reg.form_data === 'object' && reg.form_data ? reg.form_data as Record<string, unknown> : {}
    const extras = formFields.map(f => escapeCsv(fd[f.id]))
    return [
      String(idx + 1),
      escapeCsv(p.owner_name),
      escapeCsv(p.owner_email),
      escapeCsv(p.dog_name),
      escapeCsv(p.dog_breed),
      escapeCsv(({ pending: 'Oczekujące', confirmed: 'Potwierdzone', cancelled: 'Anulowane' } as Record<string, string>)[reg.status as string] ?? reg.status),
      escapeCsv(reg.created_at ? new Date(reg.created_at as string).toLocaleString('pl-PL') : ''),
      ...extras,
    ].join(',')
  })

  const csv = [headers.join(','), ...rows].join('\r\n')
  // Prepend UTF-8 BOM so Excel opens Polish characters correctly
  const bom = '\uFEFF'
  const filename = `zapisy-${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
