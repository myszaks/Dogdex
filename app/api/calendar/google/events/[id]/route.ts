import { NextResponse } from 'next/server'
import { buildGoogleCalendarUrl } from '@/lib/googleCalendar'
import { createServerClient } from '@/lib/supabaseServer'

interface Params { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerClient()
  const query = supabase.from('events').select('id, slug, title, description, start_at, end_at, location, status')
  const { data: event } = await query.eq(/^[0-9a-f-]{36}$/i.test(id) ? 'id' : 'slug', id).maybeSingle()
  if (!event || event.status === 'draft' || !event.start_at) {
    return NextResponse.json({ error: 'Nie znaleziono terminu wydarzenia' }, { status: 404 })
  }
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
  return NextResponse.redirect(buildGoogleCalendarUrl({
    title: event.title,
    start: event.start_at,
    end: event.end_at,
    description: [event.description, `${baseUrl}/events/${event.slug}`].filter(Boolean).join('\n\n'),
    location: event.location,
  }), 302)
}
