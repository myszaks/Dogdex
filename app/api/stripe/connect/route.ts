import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { isPayoutRole } from '@/lib/roles'

const STATE_COOKIE = 'dogdex_stripe_connect_state'

export async function GET(request: NextRequest) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!isPayoutRole(role)) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  const clientId = process.env.STRIPE_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? request.nextUrl.origin
  const returnUrl = new URL('/api/stripe/callback', appUrl).toString()

  if (!clientId) {
    return NextResponse.json(
      { error: 'Stripe nie jest skonfigurowany' },
      { status: 500 }
    )
  }

  // Build Stripe Connect OAuth URL
  const state = randomBytes(32).toString('hex')
  const connectUrl = new URL('https://connect.stripe.com/oauth/authorize')
  connectUrl.searchParams.append('response_type', 'code')
  connectUrl.searchParams.append('client_id', clientId)
  connectUrl.searchParams.append('scope', 'read_write')
  connectUrl.searchParams.append('state', state)
  connectUrl.searchParams.append('redirect_uri', returnUrl)
  connectUrl.searchParams.append('stripe_user[email]', user.email || '')
  connectUrl.searchParams.append('stripe_user[url]', new URL('/payments', appUrl).toString())
  connectUrl.searchParams.append('stripe_user[country]', 'PL')

  const response = NextResponse.redirect(connectUrl)
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: new URL(appUrl).protocol === 'https:',
    sameSite: 'lax',
    path: '/api/stripe/callback',
    maxAge: 10 * 60,
  })
  return response
}
