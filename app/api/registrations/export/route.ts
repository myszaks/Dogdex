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

  const [{ data: event }, { data: registrations }] = await Promise.all([
    supabase.from('events').select('title, form_fields').eq('id', eventId).single(),
    supabase
      .from('registrations')
      .select('*, participants(*)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true }),
  ])

  if (!event) return NextResponse.json({ error: 'Nie znaleziono wydarzenia' }, { status: 404 })

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
    const str = Array.isArray(val) ? val.join('; ') : String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows = (registrations ?? []).map((reg: any, idx: number) => {
    const p = reg.participants ?? {}
    const fd: Record<string, unknown> = typeof reg.form_data === 'object' && reg.form_data ? reg.form_data : {}
    const extras = formFields.map(f => escapeCsv(fd[f.id]))
    return [
      String(idx + 1),
      escapeCsv(p.owner_name),
      escapeCsv(p.owner_email),
      escapeCsv(p.dog_name),
      escapeCsv(p.dog_breed),
      escapeCsv(reg.status),
      escapeCsv(reg.created_at ? new Date(reg.created_at).toLocaleString('pl-PL') : ''),
      ...extras,
    ].join(',')
  })

  const csv = [headers.join(','), ...rows].join('\r\n')
  const filename = `zapisy-${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
