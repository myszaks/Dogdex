import { NextResponse } from 'next/server'
import { sendContactEmail, sendContactConfirmation } from '@/lib/email'
import { enforcePublicRateLimits, getRequestIp } from '@/lib/publicRateLimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy format danych' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim()
  const subject = String(body.subject ?? '').trim()
  const message = String(body.message ?? '').trim()

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ error: 'Wszystkie pola są wymagane' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Nieprawidłowy adres e-mail' }, { status: 400 })
  }
  if (name.length > 120 || subject.length > 200 || message.length > 5000) {
    return NextResponse.json({ error: 'Przekroczono maksymalną długość pola' }, { status: 400 })
  }

  const rateLimit = await enforcePublicRateLimits([
    {
      scope: 'contact-ip',
      identifier: getRequestIp(req),
      limit: 5,
      windowSeconds: 10 * 60,
    },
    {
      scope: 'contact-email',
      identifier: email,
      limit: 3,
      windowSeconds: 30 * 60,
    },
  ])

  if (!rateLimit.allowed) {
    if (rateLimit.reason === 'limited') {
      return NextResponse.json(
        { error: 'Zbyt wiele wiadomości. Spróbuj ponownie później.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      )
    }
    return NextResponse.json(
      { error: 'Formularz jest chwilowo niedostępny. Spróbuj ponownie później.' },
      { status: 503 },
    )
  }

  try {
    await sendContactEmail({ name, email, subject, message })
  } catch {
    return NextResponse.json(
      { error: 'Nie udało się wysłać wiadomości — spróbuj ponownie później' },
      { status: 500 }
    )
  }

  // Confirmation is best-effort — don't fail the request if it doesn't send
  void sendContactConfirmation({ name, email, subject })

  return NextResponse.json({ ok: true })
}
