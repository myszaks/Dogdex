import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { isTrainerRole } from '@/lib/roles'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null
const STATE_COOKIE = 'dogdex_stripe_connect_state'

function stateMatches(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected || received.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

function redirectToProfile(request: NextRequest, query: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? request.nextUrl.origin
  const response = NextResponse.redirect(new URL(`/trainer/profile?${query}`, appUrl))
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: new URL(appUrl).protocol === 'https:',
    sameSite: 'lax',
    path: '/api/stripe/callback',
    maxAge: 0,
  })
  return response
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const expectedState = req.cookies.get(STATE_COOKIE)?.value

  if (!code || !stateMatches(state, expectedState)) {
    return redirectToProfile(req, 'error=Brak_autoryzacji')
  }

  try {
    if (!stripe) {
      return redirectToProfile(req, 'error=Stripe_not_configured')
    }

    const { user, role } = await getServerUser()
    if (!user || !isTrainerRole(role)) {
      return redirectToProfile(req, 'error=Brak_autoryzacji')
    }
    if (!hasServiceRoleKey()) {
      return redirectToProfile(req, 'error=Stripe_persistence_not_configured')
    }

    // Exchange code for stripe account ID
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    })

    const stripeAccountId = response.stripe_user_id
    if (!stripeAccountId) {
      throw new Error('Stripe OAuth response is missing stripe_user_id')
    }

    // These payment fields are server-managed. The authenticated role has no
    // direct UPDATE grant on profiles, so persist only after all OAuth checks
    // above using the service-role client.
    const supabase = createServerClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        stripe_account_id: stripeAccountId,
        stripe_onboarded: true,
      })
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      throw new Error('Błąd przy zapisywaniu')
    }

    return redirectToProfile(req, 'stripe_connected=true')
  } catch (error) {
    console.error('Stripe error:', error)
    return redirectToProfile(req, 'error=Stripe_error')
  }
}
