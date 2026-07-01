import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabaseServer'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COOLDOWN_SECONDS = 5 * 60

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy format danych' }, { status: 400 })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Nieprawidłowy adres e-mail' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: throttleResult, error: throttleError } = await supabase.rpc('reserve_password_reset_link', {
    p_email: email,
    p_cooldown_seconds: COOLDOWN_SECONDS,
  })

  if (throttleError) {
    return NextResponse.json({ error: throttleError.message }, { status: 500 })
  }

  const limiter = (throttleResult ?? {}) as { allowed?: boolean; retry_after_seconds?: number }
  if (!limiter.allowed) {
    const retryAfterSeconds = limiter.retry_after_seconds ?? COOLDOWN_SECONDS
    return NextResponse.json(
      {
        error: 'Link do resetowania hasła możesz wysłać tylko raz na 5 minut.',
        retryAfterSeconds,
      },
      { status: 429 }
    )
  }

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const origin = new URL(req.url).origin
  const redirectTo = `${origin}/auth/callback?next=/reset-password`
  const { error } = await authClient.auth.resetPasswordForEmail(email, {
    redirectTo,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    message: 'Link do resetowania hasła został wysłany na podany adres.',
    retryAfterSeconds: COOLDOWN_SECONDS,
  })
}
