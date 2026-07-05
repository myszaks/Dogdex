import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { isRoleRequestKind } from '@/lib/roles'
import type { RoleRequestKind } from '@/lib/roles'

type NormalizedRoleRequest = {
  requested_role: RoleRequestKind
  full_name: string
  business_name: string | null
  city: string | null
  phone: string | null
  experience: string
  verification_links: string[]
  certification_urls: string[]
  pricing_acknowledged: boolean
  terms_accepted: boolean
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function optionalText(value: unknown, maxLength: number): string | null {
  const normalized = text(value, maxLength)
  return normalized || null
}

function links(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\r?\n|,/)
      : []

  return raw
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map(item => item.slice(0, 500))
}

function normalizePayload(body: Record<string, unknown>): { data?: NormalizedRoleRequest; error?: string } {
  const requestedRole = body.requested_role ?? body.requestedRole
  if (!isRoleRequestKind(requestedRole)) {
    return { error: 'Wybierz rolę: organizator, trener albo organizator i trener.' }
  }

  const fullName = text(body.full_name ?? body.fullName, 120)
  if (fullName.length < 2) {
    return { error: 'Podaj imię i nazwisko.' }
  }

  const experience = text(body.experience, 3000)
  if (experience.length < 20) {
    return { error: 'Opisz krótko swoje doświadczenie lub działalność.' }
  }

  const pricingAcknowledged = body.pricing_acknowledged ?? body.pricingAcknowledged
  const termsAccepted = body.terms_accepted ?? body.termsAccepted
  if (pricingAcknowledged !== true || termsAccepted !== true) {
    return { error: 'Potwierdź informacje o kosztach i zgodę na weryfikację.' }
  }

  return {
    data: {
      requested_role: requestedRole,
      full_name: fullName,
      business_name: optionalText(body.business_name ?? body.businessName, 160),
      city: optionalText(body.city, 120),
      phone: optionalText(body.phone, 40),
      experience,
      verification_links: links(body.verification_links ?? body.verificationLinks),
      certification_urls: links(body.certification_urls ?? body.certificationUrls),
      pricing_acknowledged: true,
      terms_accepted: true,
    },
  }
}

export async function GET() {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('role_upgrade_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    currentRole: role ?? 'user',
    requests: data ?? [],
  })
}

export async function POST(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const normalized = normalizePayload(body)
  if (normalized.error || !normalized.data) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: activeRequest, error: activeError } = await supabase
    .from('role_upgrade_requests')
    .select('id, status')
    .eq('user_id', user.id)
    .in('status', ['pending', 'needs_info'])
    .limit(1)
    .maybeSingle()

  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 })
  if (activeRequest) {
    return NextResponse.json(
      { error: 'Masz już aktywny wniosek. Uzupełnij go zamiast tworzyć kolejny.' },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from('role_upgrade_requests')
    .insert([{ user_id: user.id, ...normalized.data }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe JSON' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'Brakuje ID wniosku' }, { status: 400 })

  const normalized = normalizePayload(body)
  if (normalized.error || !normalized.data) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: request, error: fetchError } = await supabase
    .from('role_upgrade_requests')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!request) return NextResponse.json({ error: 'Nie znaleziono wniosku' }, { status: 404 })
  if (!['pending', 'needs_info'].includes(request.status)) {
    return NextResponse.json({ error: 'Ten wniosek jest już zamknięty.' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('role_upgrade_requests')
    .update({
      ...normalized.data,
      status: 'pending',
      rejection_reason: null,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
