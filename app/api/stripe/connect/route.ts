import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'

export async function GET() {
  const { user } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })

  const clientId = process.env.STRIPE_CLIENT_ID
  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/callback`

  if (!clientId) {
    return NextResponse.json(
      { error: 'Stripe nie jest skonfigurowany' },
      { status: 500 }
    )
  }

  // Build Stripe Connect OAuth URL
  const connectUrl = new URL('https://connect.stripe.com/oauth/authorize')
  connectUrl.searchParams.append('client_id', clientId)
  connectUrl.searchParams.append('state', user.id) // Store user ID to verify after redirect
  connectUrl.searchParams.append('redirect_uri', returnUrl)
  connectUrl.searchParams.append('stripe_user[email]', user.email || '')
  connectUrl.searchParams.append('stripe_user[url]', `${process.env.NEXT_PUBLIC_APP_URL}/trainer`)
  connectUrl.searchParams.append('stripe_user[country]', 'PL')

  return NextResponse.redirect(connectUrl)
}
